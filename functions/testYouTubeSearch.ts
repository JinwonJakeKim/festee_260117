import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const { query } = await req.json();
    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    
    console.log(`Searching for: ${query}`);
    console.log(`API Key exists: ${!!apiKey}`);
    if (apiKey) console.log(`API Key length: ${apiKey.length}`);

    if (!apiKey) {
      return Response.json({ error: "No API Key" });
    }

    const searchParams = new URLSearchParams({
      part: 'id',
      q: query,
      type: 'video',
      videoDuration: 'short',
      order: 'viewCount',
      maxResults: '5',
      key: apiKey
    });
    
    const url = `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`;
    console.log(`Fetching: ${url}`);
    
    const response = await fetch(url);
    const text = await response.text();
    console.log(`Response status: ${response.status}`);
    
    try {
        const data = JSON.parse(text);
        return Response.json({ 
            status: response.status,
            data: data,
            shorts: data.items?.map(item => `https://www.youtube.com/shorts/${item.id.videoId}`)
        });
    } catch (e) {
        return Response.json({ error: "JSON Parse Error", text });
    }

  } catch (error) {
    return Response.json({ error: error.message });
  }
});