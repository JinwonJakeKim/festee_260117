import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // 워크플로우(스케줄러) 호출은 Authorization 헤더가 없고 base44.auth.me()가 null을 반환합니다.
    // 앱 사용자가 직접 호출한 경우에만 관리자 권한을 검사합니다.
    const authHeader = req.headers.get('Authorization');
    let user = null;
    if (authHeader) {
      try { user = await base44.auth.me(); } catch (e) { user = null; }
    }
    if (authHeader && (!user || user.role !== 'admin')) {
      return Response.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }

    // 다음 달 계산 (예: 9월 5일 → 10월, 12월 5일 → 다음해 1월)
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const targetMonth = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

    console.log(`[MonthlyLinkExtraction] Target month: ${targetMonth}`);

    // 활성화된 FestivalSourceUrl 조회
    const sources = await base44.asServiceRole.entities.FestivalSourceUrl.filter({
      is_active: true
    });

    console.log(`[MonthlyLinkExtraction] Found ${sources.length} active sources`);

    const results = [];
    let totalNewLinks = 0;

    for (const source of sources) {
      try {
        console.log(`[MonthlyLinkExtraction] Processing source: ${source.name} (${source.url})`);
        const { data: result } = await base44.asServiceRole.functions.invoke('extractJapanLinks', {
          sourceUrlId: source.id,
          targetMonth
        });

        const newRecords = result?.new_records || 0;
        totalNewLinks += newRecords;

        results.push({
          source: source.name,
          success: true,
          total_links: result?.total_links || 0,
          new_records: newRecords
        });

        console.log(`[MonthlyLinkExtraction] ✅ ${source.name}: ${result?.total_links || 0} links (${newRecords} new)`);
      } catch (error) {
        console.error(`[MonthlyLinkExtraction] ❌ Error for ${source.name}:`, error.message);
        results.push({
          source: source.name,
          success: false,
          error: error.message
        });
      }
    }

    console.log(`[MonthlyLinkExtraction] Completed. Total new links: ${totalNewLinks}`);

    return Response.json({
      success: true,
      target_month: targetMonth,
      sources_processed: sources.length,
      total_new_links: totalNewLinks,
      results
    });
  } catch (error) {
    console.error('[MonthlyLinkExtraction] Error:', error);
    return Response.json({ success: false, error: error.message || 'Unknown error' }, { status: 500 });
  }
});