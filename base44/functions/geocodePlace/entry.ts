import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query } = await req.json();

    if (!query) {
      return Response.json({ success: false, error: 'Query is required' });
    }

    const apiKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY');
    if (!apiKey) {
      return Response.json({ success: false, error: 'Geocoding API key not configured' });
    }

    // 월간 사용량 제한 (reverseGeocode/geocodeAddress와 공유)
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const logs = await base44.asServiceRole.entities.ApiUsageLog.filter({ api_name: 'google_geocoding_api' });
    const monthlyUsage = logs
      .filter(log => log.date && log.date.startsWith(currentMonth))
      .reduce((sum, log) => sum + (log.count || 0), 0);
    if (monthlyUsage >= 10000) {
      return Response.json({ success: false, error: 'GEOCODING_API_LIMIT_REACHED' }, { status: 429 });
    }
    const today = new Date().toISOString().split('T')[0];
    const todayLog = logs.find(log => log.date === today);
    if (todayLog) {
      await base44.asServiceRole.entities.ApiUsageLog.update(todayLog.id, { count: (todayLog.count || 0) + 1 });
    } else {
      await base44.asServiceRole.entities.ApiUsageLog.create({
        api_name: 'google_geocoding_api',
        date: today,
        count: 1,
        limit: 10000,
        console_url: 'https://console.cloud.google.com/google/maps-apis/quotas'
      });
    }

    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
    const response = await fetch(geocodeUrl);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      const formattedAddress = data.results[0].formatted_address;

      return Response.json({
        success: true,
        latitude: location.lat,
        longitude: location.lng,
        formatted_address: formattedAddress
      });
    } else {
      return Response.json({
        success: false,
        error: `No results found for: ${query}`
      });
    }

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});