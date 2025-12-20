import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { location, category, keyword, start_date, end_date } = await req.json();

        const eventbriteApiKey = Deno.env.get("EVENTBRITE_API_KEY");
        if (!eventbriteApiKey) {
            return Response.json({ error: 'Eventbrite API key is not set.' }, { status: 500 });
        }

        const url = new URL("https://www.eventbriteapi.com/v3/events/search");
        url.searchParams.append("sort_by", "date");

        if (location) {
            url.searchParams.append("location.address", location);
        }
        if (category) {
            url.searchParams.append("categories", category);
        }
        if (keyword) {
            url.searchParams.append("q", keyword);
        }
        if (start_date) {
            url.searchParams.append("start_date.range_start", `${start_date}T00:00:00Z`);
        }
        if (end_date) {
            url.searchParams.append("start_date.range_end", `${end_date}T23:59:59Z`);
        }
        
        url.searchParams.append("expand", "venue,category,format");

        const response = await fetch(url.toString(), {
            headers: {
                "Authorization": `Bearer ${eventbriteApiKey}`,
                "Accept": "application/json"
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            return Response.json({ 
                error: `Eventbrite API error: ${response.statusText}`,
                details: errorText 
            }, { status: response.status });
        }

        const data = await response.json();
        return Response.json(data);

    } catch (error) {
        console.error("Error in searchEventbriteEvents function:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});