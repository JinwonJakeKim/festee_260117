import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { lat, lng } = await req.json();
  const apiKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY');

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=en&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();

  return Response.json({
    status: data.status,
    results: data.results?.slice(0, 5).map(r => ({
      formatted_address: r.formatted_address,
      types: r.types,
      address_components: r.address_components
    }))
  });
});