import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// Google Geocoding API 언어 코드 매핑
const LANGUAGE_MAP = {
  ko: 'ko',
  en: 'en',
  ja: 'ja',
  zh: 'zh-CN',
};

// 주소 구성요소에서 우선순위에 따라 값 추출
function getComponent(components, types, nameType = 'long_name') {
  for (const type of types) {
    const comp = components.find(c => c.types.includes(type));
    if (comp && comp[nameType]) return comp[nameType];
  }
  return null;
}

// 계층적 주소 문자열 빌드 (예: "서울특별시 성북구 안암동")
function buildHierarchicalAddress(components, language) {
  // 모든 관련 구성요소를 큰 단위부터 순서대로 수집
  const levels = [];

  const admin1 = getComponent(components, ['administrative_area_level_1']);
  if (admin1) levels.push(admin1);

  const admin2 = getComponent(components, ['administrative_area_level_2']);
  const locality = getComponent(components, ['locality']);
  const sub1 = getComponent(components, ['sublocality_level_1']);

  // 한국: 구가 sublocality_level_1, 일본: 구가 locality, 기타: 구가 administrative_area_level_2
  // 중복 방지하며 추가
  if (admin2 && !levels.includes(admin2)) levels.push(admin2);
  if (locality && !levels.includes(locality)) levels.push(locality);
  if (sub1 && !levels.includes(sub1)) levels.push(sub1);

  const sub2 = getComponent(components, ['sublocality_level_2']);
  if (sub2 && !levels.includes(sub2)) levels.push(sub2);

  const sub3 = getComponent(components, ['sublocality_level_3']);
  if (sub3 && !levels.includes(sub3)) levels.push(sub3);

  const sub4 = getComponent(components, ['sublocality_level_4']);
  if (sub4 && !levels.includes(sub4)) levels.push(sub4);

  const neighborhood = getComponent(components, ['neighborhood']);
  if (neighborhood && !levels.includes(neighborhood)) levels.push(neighborhood);

  if (levels.length === 0) return null;

  // 한국/일본: 큰 단위 → 작은 단위 (예: 서울특별시 성북구 안암동)
  // 영문/중국어: 작은 단위 → 큰 단위 (예: Anam-dong, Seongbuk, Seoul)
  const isAsianOrder = language === 'ko' || language === 'ja';
  return isAsianOrder ? levels.join(' ') : levels.slice().reverse().join(', ');
}

// 짧은 주소 (동/읍/면 수준 — 빌딩 번호 등 지나치게 세부 단위는 제외)
function buildShortAddress(components) {
  const smallest = getComponent(components, [
    'sublocality_level_2',
    'sublocality_level_1',
    'locality',
    'neighborhood',
    'administrative_area_level_2',
    'administrative_area_level_1',
  ]);
  return smallest || null;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lng, language = 'ko' } = await req.json();

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return Response.json({
        success: false,
        error: 'lat and lng (number) are required',
      }, { status: 400 });
    }

    const apiKey = secrets.get('GOOGLE_GEOCODING_API_KEY');
    if (!apiKey) {
      return Response.json({
        success: false,
        error: 'Geocoding API key not configured',
      }, { status: 500 });
    }

    // API 사용량 체크 (월 10,000회 제한 - geocodeAddress와 공유)
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let monthlyLimitReached = false;
    try {
      const logs = await base44.asServiceRole.entities.ApiUsageLog.filter({
        api_name: 'google_geocoding_api'
      });
      const monthlyUsage = logs
        .filter(log => log.date.startsWith(currentMonth))
        .reduce((sum, log) => sum + (log.count || 0), 0);
      if (monthlyUsage >= 10000) {
        monthlyLimitReached = true;
      }
    } catch (logError) {
      console.error('[ReverseGeocode] Failed to check API usage:', logError.message);
    }

    if (monthlyLimitReached) {
      return Response.json({
        success: false,
        error: 'GEOCODING_API_LIMIT_REACHED',
      }, { status: 429 });
    }

    const langCode = LANGUAGE_MAP[language] || 'ko';
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=${langCode}&key=${apiKey}`;

    const response = await fetch(geocodeUrl);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const firstResult = data.results[0];
      const components = firstResult.address_components || [];

      const formattedAddress = firstResult.formatted_address;
      const hierarchicalAddress = buildHierarchicalAddress(components, language);
      const shortAddress = buildShortAddress(components);

      // 사용량 기록 (waitUntil로 응답 지연 방지)
      try {
        const today = new Date().toISOString().split('T')[0];
        const existingLogs = await base44.asServiceRole.entities.ApiUsageLog.filter({
          api_name: 'google_geocoding_api',
          date: today
        });
        if (existingLogs.length === 0) {
          await base44.asServiceRole.entities.ApiUsageLog.create({
            api_name: 'google_geocoding_api',
            date: today,
            count: 1,
            limit: 10000,
            console_url: 'https://console.cloud.google.com/google/maps-apis/quotas'
          });
        } else {
          await base44.asServiceRole.entities.ApiUsageLog.update(existingLogs[0].id, {
            count: existingLogs[0].count + 1
          });
        }
      } catch (logError) {
        console.error('[ReverseGeocode] Failed to update usage log:', logError.message);
      }

      return Response.json({
        success: true,
        formatted_address: formattedAddress,
        address: hierarchicalAddress || formattedAddress,
        short_address: shortAddress,
      });
    } else {
      return Response.json({
        success: false,
        error: `Reverse geocoding failed: ${data.status}`,
      }, { status: 400 });
    }
  } catch (error) {
    console.error('[ReverseGeocode] Error:', error);
    return Response.json({
      success: false,
      error: error.message || 'Unknown error occurred',
    }, { status: 500 });
  }
}