import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { rawDataIds, retransform = false } = await req.json();
    
    if (!rawDataIds || !Array.isArray(rawDataIds) || rawDataIds.length === 0) {
      return Response.json({ 
        success: false,
        error: 'rawDataIds array is required' 
      }, { status: 400 });
    }

    console.log(`[UrlExtraction Transform] Starting transformation of ${rawDataIds.length} records, retransform=${retransform}`);

    const results = [];
    
    for (const rawDataId of rawDataIds) {
      try {
        // 원본 데이터 가져오기
        const rawDataRecords = await base44.asServiceRole.entities.UrlExtractionRawData.filter({ id: rawDataId });
        const rawData = rawDataRecords[0];
        
        if (!rawData) {
          results.push({
            rawDataId,
            success: false,
            error: 'Raw data not found'
          });
          continue;
        }

        console.log(`[Transform] Processing: ${rawData.extracted_data?.name_ko || rawData.extracted_data?.name_original}`);

        // 상태 업데이트 - processing
        await base44.asServiceRole.entities.UrlExtractionRawData.update(rawDataId, {
          processing_status: 'processing'
        });

        const festivalData = rawData.extracted_data;
        const festivalNameForSearch = festivalData.name_en || festivalData.name_ko || festivalData.name_original;

        // Google 이미지 검색
        let thumbnailUrl = festivalData.thumbnail_url;
        let mediaUrls = festivalData.media_urls || [];
        
        try {
          console.log(`[Transform] Searching Google Images for: ${festivalNameForSearch}`);
          const googleApiKey = Deno.env.get('GOOGLE_CUSTOM_SEARCH_API_KEY');
          const searchEngineId = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID');

          if (googleApiKey && searchEngineId) {
            const imageSearchUrl = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(festivalNameForSearch + ' festival')}&searchType=image&num=5`;
            const imageResponse = await fetch(imageSearchUrl);
            
            if (imageResponse.ok) {
              const imageData = await imageResponse.json();
              if (imageData.items && imageData.items.length > 0) {
                if (!thumbnailUrl || thumbnailUrl.includes('picsum.photos')) {
                  thumbnailUrl = imageData.items[0].link;
                  console.log(`[Transform] ✓ Updated thumbnail from Google Images`);
                }
                
                imageData.items.slice(1, 5).forEach((item, idx) => {
                  if (!mediaUrls.some(m => m.url === item.link)) {
                    mediaUrls.push({
                      type: 'image',
                      url: item.link,
                      caption: `${festivalNameForSearch} - 이미지 ${idx + 1}`
                    });
                  }
                });
                console.log(`[Transform] ✓ Added ${imageData.items.length - 1} images to media_urls`);
              }
            }
          }
        } catch (imageError) {
          console.error('[Transform] Google Images search failed:', imageError.message);
        }

        // YouTube Shorts 검색
        let youtubeShortUrls = [];
        try {
          console.log(`[Transform] Searching YouTube Shorts for: ${festivalNameForSearch}`);
          const youtubeApiKey = Deno.env.get('YOUTUBE_API_KEY');
          
          if (youtubeApiKey) {
            const shortsSearchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(festivalNameForSearch + ' festival shorts')}&type=video&videoDuration=short&maxResults=5&key=${youtubeApiKey}`;
            const shortsResponse = await fetch(shortsSearchUrl);
            
            if (shortsResponse.ok) {
              const shortsData = await shortsResponse.json();
              if (shortsData.items && shortsData.items.length > 0) {
                youtubeShortUrls = shortsData.items
                  .filter(item => item.id?.videoId)
                  .map(item => `https://www.youtube.com/shorts/${item.id.videoId}`)
                  .slice(0, 5);
                console.log(`[Transform] ✓ Found ${youtubeShortUrls.length} YouTube Shorts`);
              }
            }
          }
        } catch (shortsError) {
          console.error('[Transform] YouTube Shorts search failed:', shortsError.message);
        }

        // Festival 엔티티 생성 또는 업데이트
        let festivalId = rawData.festival_id;
        const festivalPayload = {
          ...festivalData,
          thumbnail_url: thumbnailUrl,
          media_urls: mediaUrls,
          youtube_shorts_urls: youtubeShortUrls.length > 0 ? youtubeShortUrls : (festivalData.youtube_shorts_urls || [])
        };

        if (retransform && festivalId) {
          // 재변환 - 기존 Festival 업데이트
          const existingFestivals = await base44.asServiceRole.entities.Festival.filter({ id: festivalId });
          const existingFestival = existingFestivals[0];
          
          if (existingFestival) {
            await base44.asServiceRole.entities.Festival.update(festivalId, festivalPayload);
            console.log(`[Transform] ✓ Updated existing Festival: ${festivalId}`);
          } else {
            // 기존 Festival이 없으면 새로 생성
            const newFestival = await base44.asServiceRole.entities.Festival.create(festivalPayload);
            festivalId = newFestival.id;
            console.log(`[Transform] ✓ Created new Festival (original not found): ${festivalId}`);
          }
        } else {
          // 첫 변환 - 새 Festival 생성
          const newFestival = await base44.asServiceRole.entities.Festival.create(festivalPayload);
          festivalId = newFestival.id;
          console.log(`[Transform] ✓ Created new Festival: ${festivalId}`);
        }

        // 상태 업데이트 - processed
        await base44.asServiceRole.entities.UrlExtractionRawData.update(rawDataId, {
          processing_status: 'processed',
          festival_id: festivalId,
          error_message: null
        });

        results.push({
          rawDataId,
          festivalId,
          success: true,
          festivalName: festivalPayload.name
        });

      } catch (itemError) {
        console.error(`[Transform] Error processing ${rawDataId}:`, itemError);
        
        await base44.asServiceRole.entities.UrlExtractionRawData.update(rawDataId, {
          processing_status: 'failed',
          error_message: itemError.message
        });

        results.push({
          rawDataId,
          success: false,
          error: itemError.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return Response.json({
      success: true,
      message: `변환 완료: 성공 ${successCount}개, 실패 ${failCount}개`,
      results
    });

  } catch (error) {
    console.error('[UrlExtraction Transform] Error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});