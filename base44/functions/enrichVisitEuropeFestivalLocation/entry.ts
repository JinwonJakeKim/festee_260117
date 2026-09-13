import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Google Geocoding API 결과가 "정확한 장소(exact)"로 볼 수 있는지 판별.
// ROOFTOP/RANGE_INTERPOLATED(정확한 주소) 또는 establishment/POI류 타입만 인정.
// locality/administrative_area/country 같은 광역 매칭은 exact로 인정하지 않음 (대신 tier로 분류해 대표 위치로 사용).
const PRECISE_TYPES = [
  'establishment', 'point_of_interest', 'premise', 'subpremise', 'park', 'stadium',
  'university', 'museum', 'place_of_worship', 'tourist_attraction', 'street_address',
  'natural_feature', 'lodging', 'city_hall',
];

function isPreciseResult(geocodeData) {
  if (!geocodeData || !geocodeData.success) return false;
  const locationType = geocodeData.location_type;
  const types = geocodeData.types || [];
  if (locationType === 'ROOFTOP' || locationType === 'RANGE_INTERPOLATED') return true;
  if (types.some(t => PRECISE_TYPES.includes(t))) return true;
  return false;
}

// exact가 아닌 결과를 city/region/country 대표 위치 등급으로 분류.
const TIER_RANK = { city: 3, region: 2, country: 1 };
function classifyTier(geocodeData) {
  if (!geocodeData || !geocodeData.success) return null;
  const types = geocodeData.types || [];
  if (types.includes('locality') || types.includes('postal_town') || types.includes('sublocality')) return 'city';
  if (types.includes('administrative_area_level_1') || types.includes('administrative_area_level_2') || types.includes('administrative_area_level_3')) return 'region';
  if (types.includes('country')) return 'country';
  return null;
}

// 설명 텍스트에서 "held at the X" / "at the X" 같은 패턴으로 구체적 장소명을 best-effort로 추출.
function extractVenueGuess(description) {
  if (!description) return null;
  const match = description.match(/\b(?:held\s+)?at\s+the\s+([A-Z][\w'&.\-]*(?:\s+[A-Z][\w'&.\-]*){0,5})/);
  return match ? match[1].trim() : null;
}

function getKoreaTime() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { festivalId } = await req.json();
    if (!festivalId) {
      return Response.json({ success: false, error: 'festivalId is required' }, { status: 400 });
    }

    const festivals = await base44.asServiceRole.entities.Festival.filter({ id: festivalId });
    const festival = festivals[0];
    if (!festival) {
      return Response.json({ success: false, error: 'Festival not found' }, { status: 404 });
    }

    if (festival.latitude && festival.longitude) {
      return Response.json({ success: true, already_set: true, message: '이미 위치정보가 존재합니다' });
    }

    const rawRecords = await base44.asServiceRole.entities.VisitEuropeRawData.filter({ festival_id: festivalId });
    const rawData = rawRecords[0] || null;

    const venueGuess = extractVenueGuess(rawData?.source_description);
    const festivalName = festival.name_original || festival.name_en || festival.name;

    const candidates = [];
    if (venueGuess) candidates.push({ address: venueGuess, source: 'venue_from_description' });
    if (festivalName) candidates.push({ address: festivalName, source: 'name_city_country' });

    const attempts = [];
    let exactResult = null;
    let bestFallback = null; // { tier, data, source }

    for (const candidate of candidates) {
      const { data } = await base44.functions.invoke('geocodeAddress', {
        address: candidate.address,
        city: festival.city,
        country: festival.country,
      });
      attempts.push({ ...candidate, result: data });

      if (isPreciseResult(data)) {
        exactResult = { ...candidate, data };
        break;
      }

      const tier = classifyTier(data);
      if (tier && (!bestFallback || TIER_RANK[tier] > TIER_RANK[bestFallback.tier])) {
        bestFallback = { tier, data, source: candidate.source };
      }
    }

    // exact도 fallback도 아직 없으면 도시/국가만 단독으로 재시도 (이름 기반 검색이 아예 결과를 못 찾은 경우 대비)
    if (!exactResult && !bestFallback && festival.city) {
      const { data } = await base44.functions.invoke('geocodeAddress', { address: festival.city, country: festival.country });
      attempts.push({ address: festival.city, source: 'city_only', result: data });
      const tier = classifyTier(data);
      if (tier) bestFallback = { tier, data, source: 'city_only' };
    }
    if (!exactResult && !bestFallback && festival.country) {
      const { data } = await base44.functions.invoke('geocodeAddress', { address: festival.country });
      attempts.push({ address: festival.country, source: 'country_only', result: data });
      const tier = classifyTier(data);
      if (tier) bestFallback = { tier, data, source: 'country_only' };
    }

    if (exactResult) {
      await base44.asServiceRole.entities.Festival.update(festivalId, {
        latitude: exactResult.data.latitude,
        longitude: exactResult.data.longitude,
        geocoding_status: 'success',
        location_accuracy: 'exact',
        location_display_name: null,
      });

      if (rawData) {
        await base44.asServiceRole.entities.VisitEuropeRawData.update(rawData.id, {
          latitude: exactResult.data.latitude,
          longitude: exactResult.data.longitude,
          location_status: 'venue_confirmed',
          location_accuracy: 'exact',
          location_display_name: null,
          update_time: getKoreaTime(),
        });
      }

      return Response.json({
        success: true,
        resolved: true,
        location_accuracy: 'exact',
        source: exactResult.source,
        formatted_address: exactResult.data.formatted_address,
        latitude: exactResult.data.latitude,
        longitude: exactResult.data.longitude,
        attempts,
      });
    }

    if (bestFallback) {
      const displayName = bestFallback.data.formatted_address;
      await base44.asServiceRole.entities.Festival.update(festivalId, {
        latitude: bestFallback.data.latitude,
        longitude: bestFallback.data.longitude,
        geocoding_status: 'success',
        location_accuracy: bestFallback.tier,
        location_display_name: displayName,
      });

      if (rawData) {
        await base44.asServiceRole.entities.VisitEuropeRawData.update(rawData.id, {
          latitude: bestFallback.data.latitude,
          longitude: bestFallback.data.longitude,
          location_status: 'approx_confirmed',
          location_accuracy: bestFallback.tier,
          location_display_name: displayName,
          update_time: getKoreaTime(),
        });
      }

      return Response.json({
        success: true,
        resolved: true,
        location_accuracy: bestFallback.tier,
        source: bestFallback.source,
        formatted_address: displayName,
        latitude: bestFallback.data.latitude,
        longitude: bestFallback.data.longitude,
        attempts,
      });
    }

    // exact도 fallback도 전혀 찾지 못함 - 좌표 없이 unknown 처리 (지도에는 표시 안 됨)
    await base44.asServiceRole.entities.Festival.update(festivalId, {
      geocoding_status: 'failed',
      location_accuracy: 'unknown',
    });

    return Response.json({
      success: true,
      resolved: false,
      location_accuracy: 'unknown',
      message: '위치정보를 전혀 판단할 수 없어 unknown 상태로 유지합니다',
      attempts,
    });
  } catch (error) {
    console.error('[EnrichVisitEuropeLocation] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}