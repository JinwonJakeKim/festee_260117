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