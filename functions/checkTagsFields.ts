import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const festivals = await base44.asServiceRole.entities.Festival.filter({ country: '대한민국' }, '-created_date', 500);

  const isEmpty = (arr) => !arr || arr.length === 0;

  const result = {
    total: festivals.length,
    empty_tags: [],
    empty_tags_ko: [],
    empty_tags_en: [],
    empty_tags_jp: [],
    empty_tags_zh: [],
  };

  for (const f of festivals) {
    const name = f.name_ko || f.name_original || f.id;
    if (isEmpty(f.tags)) result.empty_tags.push(name);
    if (isEmpty(f.tags_ko)) result.empty_tags_ko.push(name);
    if (isEmpty(f.tags_en)) result.empty_tags_en.push(name);
    if (isEmpty(f.tags_jp)) result.empty_tags_jp.push(name);
    if (isEmpty(f.tags_zh)) result.empty_tags_zh.push(name);
  }

  return Response.json({
    total: result.total,
    empty_tags: { count: result.empty_tags.length, names: result.empty_tags },
    empty_tags_ko: { count: result.empty_tags_ko.length, names: result.empty_tags_ko },
    empty_tags_en: { count: result.empty_tags_en.length, names: result.empty_tags_en },
    empty_tags_jp: { count: result.empty_tags_jp.length, names: result.empty_tags_jp },
    empty_tags_zh: { count: result.empty_tags_zh.length, names: result.empty_tags_zh },
  });
});