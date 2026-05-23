import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { limit = 20 } = await req.json().catch(() => ({}));

    // summary_original이 비어있고 description_original이 있는 레코드 조회
    const allRecords = await base44.asServiceRole.entities.JapantravelRawData.list('-created_date', 500);
    const targets = allRecords.filter(r =>
      (!r.summary_original || r.summary_original.trim() === '') &&
      r.description_original && r.description_original.trim().length > 50
    ).slice(0, limit);

    console.log(`[FillSummary] Found ${targets.length} records to process`);

    let success = 0;
    let failed = 0;

    for (const record of targets) {
      try {
        console.log(`[FillSummary] Processing: ${record.name_original}`);
        const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `You are a festival information summarizer. Based on the following festival description, write a concise 2-3 sentence summary in English that captures what the festival is, where/when it happens, and what makes it special. Do NOT include any website branding or generic tourism phrases. Write only about this specific festival.

Festival name: ${record.name_original}
Description: ${record.description_original.substring(0, 2000)}

Write only the summary, nothing else.`,
        });

        if (llmResult && typeof llmResult === 'string' && llmResult.trim().length > 10) {
          await base44.asServiceRole.entities.JapantravelRawData.update(record.id, {
            summary_original: llmResult.trim(),
            update_time: new Date().toISOString(),
          });
          console.log(`[FillSummary] ✓ Updated: ${record.name_original}`);
          success++;
        } else {
          console.warn(`[FillSummary] LLM returned empty result for: ${record.name_original}`);
          failed++;
        }
      } catch (e) {
        console.error(`[FillSummary] Error for ${record.name_original}: ${e.message}`);
        failed++;
      }
    }

    return Response.json({
      success: true,
      processed: targets.length,
      updated: success,
      failed,
      message: `${success}개 레코드의 summary_original을 LLM으로 생성했습니다.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});