import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // Japan 관련 country 값들
    const japanCountries = ['Japan', '일본', 'japan'];

    let updated = 0;
    let skipped = 0;

    for (const country of japanCountries) {
      const festivals = await base44.asServiceRole.entities.Festival.filter({ country });
      
      for (const festival of festivals) {
        if (!festival.summary_original && festival.summary_en) {
          await base44.asServiceRole.entities.Festival.update(festival.id, {
            summary_original: festival.summary_en
          });
          updated++;
        } else {
          skipped++;
        }
      }
    }

    return Response.json({
      success: true,
      updated,
      skipped,
      message: `${updated}개 축제의 summary_original을 summary_en으로 채웠습니다.`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});