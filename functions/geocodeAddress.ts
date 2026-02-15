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