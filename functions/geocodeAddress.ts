import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const { address, city, country } = await req.json();

    if (!city && !address) {
      return Response.json({
        success: false,
        error: 'City or address is required'
      });
    }

    const apiKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY');
    if (!apiKey) {
      return Response.json({
        success: false,
        error: 'Geocoding API key not configured'
      });
    }

    // API 사용량 체크 (월 10,000회 제한)
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    try {
      const logs = await base44.asServiceRole.entities.ApiUsageLog.filter({
        api_name: 'google_geocoding_api'
      });
      
      // 이번 달 사용량 합산
      const monthlyUsage = logs
        .filter(log => log.date.startsWith(currentMonth))
        .reduce((sum, log) => sum + (log.count || 0), 0);
      
      const monthlyLimit = 10000;
      
      if (monthlyUsage >= monthlyLimit) {
        console.log(`[Geocoding] ❌ Monthly limit reached: ${monthlyUsage}/${monthlyLimit}`);
        return Response.json({
          success: false,
          error: 'GEOCODING_API_LIMIT_REACHED',
          message: `Geocoding API 월 ${monthlyLimit}회 무료 한도를 초과했습니다. (${monthlyUsage}회 사용)`
        }, { status: 429 });
      }
      
      console.log(`[Geocoding] ✓ Monthly usage: ${monthlyUsage + 1}/${monthlyLimit}`);
    } catch (logError) {
      console.error('[Geocoding] Failed to check API usage:', logError.message);
    }

    // 주소 문자열 조합
    const addressComponents = [];
    if (address) addressComponents.push(address);
    if (city) addressComponents.push(city);
    if (country) addressComponents.push(country);
    const fullAddress = addressComponents.join(', ');

    console.log(`[Geocoding] Attempting to geocode: ${fullAddress}`);

    // Google Geocoding API 호출
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${apiKey}`;
    
    const response = await fetch(geocodeUrl);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      const formattedAddress = data.results[0].formatted_address;

      console.log(`[Geocoding] ✅ Success: ${formattedAddress} -> (${location.lat}, ${location.lng})`);

      // 사용량 기록 (성공 시에만)
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
        console.error('[Geocoding] Failed to update usage log:', logError.message);
      }

      return Response.json({
        success: true,
        latitude: location.lat,
        longitude: location.lng,
        formatted_address: formattedAddress
      });
    } else {
      console.log(`[Geocoding] ❌ Failed: ${data.status}`);
      
      return Response.json({
        success: false,
        error: `Geocoding failed: ${data.status}`,
        details: data.error_message || 'No results found'
      });
    }

  } catch (error) {
    console.error('[Geocoding] Error:', error);
    return Response.json({
      success: false,
      error: error.message || 'Unknown error occurred'
    }, { status: 500 });
  }
});