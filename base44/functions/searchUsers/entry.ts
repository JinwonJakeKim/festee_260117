import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { query, emails } = body;

    const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 500);

    let result;
    if (emails && Array.isArray(emails) && emails.length > 0) {
      result = allUsers.filter(u => emails.includes(u.email));
    } else {
      const q = (query || '').toLowerCase().trim();
      if (!q) {
        return Response.json({ users: [] });
      }
      result = allUsers.filter(u => {
        if (u.email === user.email) return false;
        const emailMatch = u.email && u.email.toLowerCase().includes(q);
        const nameMatch = u.full_name && u.full_name.toLowerCase().includes(q);
        const nicknameMatch = u.nickname && u.nickname.toLowerCase().includes(q);
        return emailMatch || nameMatch || nicknameMatch;
      }).slice(0, 20);
    }

    return Response.json({
      users: result.map(u => ({
        email: u.email,
        full_name: u.full_name,
        nickname: u.nickname || null,
        profile_image: u.profile_image || null
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}