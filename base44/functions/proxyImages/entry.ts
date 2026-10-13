import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const MAX_URLS = 20;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const l = ip.toLowerCase();
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') ||
      l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb') ||
      l.startsWith('::ffff:');
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== 'https:') throw new Error('Only https allowed');
  if (u.username || u.password) throw new Error('Credentials not allowed');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new Error('Blocked host');
  }
  const isIpLiteral = /^[0-9.]+$/.test(host) || host.includes(':');
  if (isIpLiteral) {
    if (isPrivateIp(host)) throw new Error('Blocked host');
    return u;
  }
  for (const type of ['A', 'AAAA'] as const) {
    let records: string[] = [];
    try {
      records = await Deno.resolveDns(host, type);
    } catch (_e) {
      records = [];
    }
    if (records.some(isPrivateIp)) throw new Error('Blocked host');
  }
  return u;
}

async function fetchImage(rawUrl: string): Promise<string | null> {
  let current = rawUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const u = await assertPublicHttpsUrl(current);
    const response = await fetch(u.toString(), { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get('location');
      if (!loc) return null;
      current = new URL(loc, u).toString();
      continue;
    }
    if (!response.ok) return null;
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) return null;
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_BYTES) return null;
    let binary = '';
    const chunkSize = 8192;
    for (let j = 0; j < bytes.length; j += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(j, j + chunkSize) as unknown as number[]);
    }
    return `data:${contentType};base64,${btoa(binary)}`;
  }
  return null;
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { urls } = await req.json();
    if (!urls || !Array.isArray(urls) || urls.length > MAX_URLS) {
      return Response.json({ error: 'urls array is required (max 20)' }, { status: 400 });
    }

    const results = await Promise.all(urls.map(async (url: unknown) => {
      if (typeof url !== 'string') return { url, dataUrl: null };
      try {
        return { url, dataUrl: await fetchImage(url) };
      } catch (_e) {
        return { url, dataUrl: null };
      }
    }));

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}