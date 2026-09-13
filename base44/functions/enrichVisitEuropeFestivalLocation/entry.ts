import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Google Geocoding API 결과가 "정확한 장소"로 볼 수 있는지 판별.
// ROOFTOP/RANGE_INTERPOLATED(정확한 주소) 또는 establishment/POI류 타입만 인정.
// locality/administrative_area/country 같은 광역 매칭은 거부 (도시 중심좌표 오남용 방지).
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
    let accepted = null;

    for (const candidate of candidates) {
      const { data } = await base44.functions.invoke('geocodeAddress', {
        address: candidate.address,
        city: festival.city,
        country: festival.country,
      });
      attempts.push({ ...candidate, result: data });

      if (isPreciseResult(data)) {
        accepted = { ...candidate, data };
        break;
      }
    }

    if (accepted) {
      await base44.asServiceRole.entities.Festival.update(festivalId, {
        latitude: accepted.data.latitude,
        longitude: accepted.data.longitude,
        geocoding_status: 'success',
      });

      if (rawData) {
        await base44.asServiceRole.entities.VisitEuropeRawData.update(rawData.id, {
          latitude: accepted.data.latitude,
          longitude: accepted.data.longitude,
          location_status: 'venue_confirmed',
          update_time: getKoreaTime(),
        });
      }

      return Response.json({
        success: true,
        resolved: true,
        source: accepted.source,
        formatted_address: accepted.data.formatted_address,
        latitude: accepted.data.latitude,
        longitude: accepted.data.longitude,
        attempts,
      });
    }

    // 정확한 장소를 찾지 못함 - 도시 중심좌표로 임의 대체하지 않고 pending 유지
    return Response.json({
      success: true,
      resolved: false,
      message: '정확한 장소를 특정할 수 없어 위치정보를 pending 상태로 유지합니다',
      attempts,
    });
  } catch (error) {
    console.error('[EnrichVisitEuropeLocation] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}