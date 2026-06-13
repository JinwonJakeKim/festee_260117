import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const startPage = body.page || 0;
    const pageSize = 50;

    const toKoreaTime = (timeStr) => {
      if (!timeStr) return null;
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return timeStr;
      return new Date(date.getTime() + 9 * 60 * 60 * 1000)
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19);
    };

    // 이미 한국 시간 형식(YYYY-MM-DD HH:mm:ss)이면 스킵
    const isAlreadyKoreaFormat = (timeStr) => {
      if (!timeStr) return false;
      return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timeStr);
    };

    const records = await base44.asServiceRole.entities.JapantravelRawData.list(
      'created_date', pageSize, startPage * pageSize
    );

    let totalUpdated = 0;
    let totalSkipped = 0;

    if (records && records.length > 0) {
      for (const record of records) {
        const createTime = record.create_time;
        const updateTime = record.update_time;

        if (isAlreadyKoreaFormat(createTime) && isAlreadyKoreaFormat(updateTime)) {
          totalSkipped++;
          continue;
        }

        const updatePayload = {};
        if (createTime && !isAlreadyKoreaFormat(createTime)) {
          updatePayload.create_time = toKoreaTime(createTime);
        }
        if (updateTime && !isAlreadyKoreaFormat(updateTime)) {
          updatePayload.update_time = toKoreaTime(updateTime);
        }

        if (Object.keys(updatePayload).length > 0) {
          await base44.asServiceRole.entities.JapantravelRawData.update(record.id, updatePayload);
          totalUpdated++;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    const hasMore = records && records.length === pageSize;

    return Response.json({
      success: true,
      page: startPage,
      processed: records ? records.length : 0,
      updated: totalUpdated,
      skipped: totalSkipped,
      has_more: hasMore,
      next_page: hasMore ? startPage + 1 : null,
      message: hasMore
        ? `페이지 ${startPage} 완료. 다음 실행 시 page: ${startPage + 1} 로 호출하세요.`
        : `모든 데이터 변환 완료 (updated: ${totalUpdated}, skipped: ${totalSkipped})`
    });

  } catch (error) {
    console.error('[FixTimestamps] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});