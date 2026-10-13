import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const MAX_DISTANCE_M = 500;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { festival_id, latitude, longitude, festival_name } = await req.json();
    if (typeof festival_id !== 'string' || !festival_id ||
        typeof latitude !== 'number' || typeof longitude !== 'number' ||
        !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    const festival = await base44.asServiceRole.entities.Festival.get(festival_id);
    if (!festival || festival.latitude == null || festival.longitude == null) {
      return Response.json({ error: 'Festival not found' }, { status: 404 });
    }

    const distance = haversineMeters(latitude, longitude, festival.latitude, festival.longitude);
    if (distance > MAX_DISTANCE_M) {
      return Response.json({ error: 'TOO_FAR', distance: Math.round(distance) }, { status: 403 });
    }

    const existing = await base44.asServiceRole.entities.Catch.filter({
      festival_id,
      user_email: user.email
    }, '-created_date', 1);
    if (existing.length > 0) {
      return Response.json({ error: 'ALREADY_CAUGHT' }, { status: 409 });
    }

    const name = typeof festival_name === 'string' && festival_name.trim()
      ? festival_name.trim().slice(0, 200)
      : (festival.name_ko || festival.name_en || festival.name_original || '');

    const record = await base44.entities.Catch.create({
      festival_id,
      festival_name: name,
      user_email: user.email,
      user_name: user.nickname || user.full_name,
      image_url: festival.thumbnail_url,
      location: `${festival.city}, ${festival.country}`,
      latitude,
      longitude
    });

    await base44.asServiceRole.entities.Festival.update(festival_id, {
      catches_count: (festival.catches_count || 0) + 1
    });

    return Response.json({ success: true, id: record.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});