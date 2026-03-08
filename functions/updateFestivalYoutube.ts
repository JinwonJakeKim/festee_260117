import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { festivalIds } = await req.json();
    if (!festivalIds || !Array.isArray(festivalIds) || festivalIds.length === 0) {
      return Response.json({ error: 'festivalIds array is required' }, { status: 400 });
    }

    // 배치 1개씩 처리 (CPU 제한)
    const festivalId = festivalIds[0];
    console.log(`[UpdateYoutube] Processing festival: ${festivalId}`);

    const festivals = await base44.asServiceRole.entities.Festival.filter({ id: festivalId });
    const festival = festivals[0];
    if (!festival) {
      return Response.json({ error: `Festival not found: ${festivalId}` }, { status: 404 });
    }

    const festivalName = festival.name_jp || festival.name_original || festival.name_ko || festival.name_en || '';
    console.log(`[UpdateYoutube] Festival name: ${festivalName}`);

    // YouTube 일일 한도 체크
    const today = new Date().toISOString().split('T')[0];
    const ytLogs = await base44.asServiceRole.entities.ApiUsageLog.filter({
      api_name: 'youtube_data_api',
      date: today
    }).catch(() => []);
    const ytCount = ytLogs[0]?.count || 0;
    if (ytCount >= 90) {
      return Response.json({ 
        error: `YouTube API 일일 한도 초과 (${ytCount}/90)`,
        success: false 
      }, { status: 429 });
    }

    // YouTube 검색 쿼리 보정 (년도/年 제거 + 祭り 없으면 추가)
    const buildYoutubeQuery = (name) => {
      if (!name) return name;
      let cleaned = name.replace(/\d{4}[年년]?/g, '').replace(/\s{2,}/g, ' ').trim();
      const festivalKeywords = ['祭り', 'まつり', 'パレード', 'イベント', 'フェア', 'マラソン', 'ショー', '展示会', 'フェスタ', 'festival', 'parade', 'fair', 'marathon', 'show', 'exhibition', 'festa'];
      const hasKeyword = festivalKeywords.some(kw => cleaned.toLowerCase().includes(kw.toLowerCase()));
      if (!hasKeyword) cleaned = cleaned + ' 祭り';
      return cleaned;
    };

    const searchName = buildYoutubeQuery(festivalName);
    console.log(`[UpdateYoutube] YouTube search: "${searchName}"`);

    const youtubeResult = await base44.functions.invoke('fetchYoutubeVideos', {
      festivalName: searchName,
      searchHighlightVideo: true,
      searchShorts: true
    });

    if (!youtubeResult.data?.success) {
      return Response.json({ 
        success: false, 
        festivalId,
        festivalName,
        error: youtubeResult.data?.error || 'YouTube search failed' 
      });
    }

    const updateData = {
      video_url: youtubeResult.data.highlightVideoUrl || festival.video_url || '',
      video_channel_name: youtubeResult.data.highlightVideoChannelName || '',
      youtube_shorts_urls: youtubeResult.data.shortsUrls || [],
      shorts_views_5_total: youtubeResult.data.shortsViewsTotal || 0,
    };

    await base44.asServiceRole.entities.Festival.update(festivalId, updateData);
    console.log(`[UpdateYoutube] ✓ Updated: ${festivalName} | video=${updateData.video_url ? '✓' : '✗'} | shorts=${updateData.youtube_shorts_urls.length}`);

    return Response.json({
      success: true,
      festivalId,
      festivalName,
      video_url: updateData.video_url,
      shorts_count: updateData.youtube_shorts_urls.length,
      shorts_views: updateData.shorts_views_5_total,
    });

  } catch (error) {
    console.error('[UpdateYoutube] Error:', error.message);
    if (error.message?.includes('YOUTUBE_API_LIMIT_REACHED')) {
      return Response.json({ success: false, error: 'YouTube API 한도 초과' }, { status: 429 });
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});