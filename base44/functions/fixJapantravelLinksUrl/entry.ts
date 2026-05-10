import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 401 });
    }

    // pending 상태의 모든 JapantravelLinks 조회
    const records = await base44.asServiceRole.entities.JapantravelLinks.filter({
      processing_status: 'pending'
    });

    console.log(`총 ${records.length}개 pending 레코드 확인`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const record of records) {
      const originalUrl = record.url;
      // en.en. → en. 수정
      const fixedUrl = originalUrl.replace('https://en.en.japantravel.com/', 'https://en.japantravel.com/');

      if (fixedUrl !== originalUrl) {
        await base44.asServiceRole.entities.JapantravelLinks.update(record.id, {
          url: fixedUrl
        });
        fixedCount++;
        console.log(`Fixed: ${originalUrl} → ${fixedUrl}`);
      } else {
        skippedCount++;
      }
    }

    return Response.json({
      success: true,
      total: records.length,
      fixed: fixedCount,
      skipped: skippedCount,
      message: `총 ${records.length}개 중 ${fixedCount}개 URL 수정 완료`
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});