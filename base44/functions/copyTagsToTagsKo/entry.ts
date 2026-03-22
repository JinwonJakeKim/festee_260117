import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 대한민국 축제 전체 조회
  const festivals = await base44.asServiceRole.entities.Festival.filter({ country: '대한민국' }, '-created_date', 500);

  const targets = festivals.filter(f => {
    const tagsKo = f.tags_ko;
    const tags = f.tags;
    const isEmpty = !tagsKo || tagsKo.length === 0;
    const hasTags = tags && tags.length > 0;
    return isEmpty && hasTags;
  });

  console.log(`[CopyTags] 총 대한민국 축제: ${festivals.length}개, tags_ko 공란 + tags 있음: ${targets.length}개`);

  let updated = 0;
  for (const f of targets) {
    await base44.asServiceRole.entities.Festival.update(f.id, { tags_ko: f.tags });
    console.log(`[CopyTags] ✓ Updated: ${f.name_ko || f.name_original} (${f.tags.length}개 태그)`);
    updated++;
  }

  return Response.json({ success: true, total: festivals.length, updated, message: `${updated}개 축제의 tags_ko 업데이트 완료` });
});