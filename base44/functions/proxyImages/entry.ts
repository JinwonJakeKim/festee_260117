import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { urls } = body;

    if (!urls || !Array.isArray(urls)) {
      return Response.json({ error: 'urls array is required' }, { status: 400 });
    }

    const results = await Promise.all(urls.map(async (url) => {
      try {
        const response = await fetch(url, { redirect: 'follow' });
        if (!response.ok) return { url, dataUrl: null };
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        const base64 = btoa(binary);
        return { url, dataUrl: `data:${contentType};base64,${base64}` };
      } catch (e) {
        return { url, dataUrl: null };
      }
    }));

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}