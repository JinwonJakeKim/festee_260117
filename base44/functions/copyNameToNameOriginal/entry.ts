import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 대한민국 축제 중 name_original이 비어있는 것들 조회
    const festivals = await base44.asServiceRole.entities.Festival.filter({ country: '대한민국' });
    console.log(`[CopyName] 총 대한민국 축제: ${festivals.length}개`);

    let updated = 0;
    let skipped = 0;

    for (const festival of festivals) {
      if (!festival.name_original && festival.name) {
        await base44.asServiceRole.entities.Festival.update(festival.id, {
          name_original: festival.name
        });
        updated++;
      } else {
        skipped++;
      }
    }

    console.log(`[CopyName] 업데이트: ${updated}개, 스킵: ${skipped}개`);

    return Response.json({
      success: true,
      total: festivals.length,
      updated,
      skipped,
      message: `${updated}개 축제의 name → name_original 복사 완료`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});