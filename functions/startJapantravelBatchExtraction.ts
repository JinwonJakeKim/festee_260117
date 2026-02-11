import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { linkIds } = await req.json();

    if (!linkIds || !Array.isArray(linkIds) || linkIds.length === 0) {
      return Response.json({ 
        success: false,
        error: 'linkIds array is required and must not be empty' 
      }, { status: 400 });
    }

    console.log(`[Batch Extraction] Setting status of ${linkIds.length} links to 'pending' for continuous processing.`);

    let successfullyUpdated = 0;
    for (const linkId of linkIds) {
      try {
        await base44.asServiceRole.entities.JapantravelLinks.update(linkId, {
          processing_status: 'pending',
          error_message: null
        });
        successfullyUpdated++;
      } catch (updateError) {
        console.error(`[Batch Extraction] Failed to update link ${linkId}:`, updateError);
      }
    }

    return Response.json({
      success: true,
      message: `${successfullyUpdated}개의 링크가 자동 처리를 위해 대기열에 추가되었습니다. 5분마다 자동화에 의해 순차적으로 처리됩니다.`,
      processed: successfullyUpdated,
      remaining: linkIds.length - successfullyUpdated
    });

  } catch (error) {
    console.error('[Batch Extraction] Unexpected error:', error);
    return Response.json({ 
      success: false,
      error: error.message || 'Unknown error occurred'
    }, { status: 500 });
  }
});