import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // japantravel 소스 URL 수정
    const sourceUrlId = '6968962962c8e05c6d6e1f7f';
    
    await base44.asServiceRole.entities.FestivalSourceUrl.update(sourceUrlId, {
      container_selector: 'div.row.small-event-gutter',
      link_selector: 'a.article-item-link'
    });

    return Response.json({
      success: true,
      message: 'japantravel 소스 URL의 CSS 선택자가 수정되었습니다.'
    });

  } catch (error) {
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});