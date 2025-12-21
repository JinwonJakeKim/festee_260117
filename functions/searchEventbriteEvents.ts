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

        // Build query parameters
        const params = new URLSearchParams();

        if (location) {
            params.append("location.address", location);
        }
        if (category) {
            params.append("categories", category);
        }
        if (keyword) {
            params.append("q", keyword);
        }
        if (start_date) {
            params.append("start_date.range_start", `${start_date}T00:00:00Z`);
        }
        if (end_date) {
            params.append("start_date.range_end", `${end_date}T23:59:59Z`);
        }

        params.append("expand", "venue,category,format");
        params.append("token", eventbriteApiKey);

        const url = `https://www.eventbriteapi.com/v3/events/search/?${params.toString()}`;

        console.log("Calling Eventbrite API URL:", url);

        const response = await fetch(url, {
            headers: {
                "Accept": "application/json"
            }
        });

        console.log("Eventbrite API response status:", response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Eventbrite API error:", errorText);
            return Response.json({ 
                error: `Eventbrite API error: ${response.statusText}`,
                details: errorText,
                url: url
            }, { status: response.status });
        }

        const data = await response.json();
        console.log("Eventbrite API returned", data.events?.length || 0, "events");
        return Response.json(data);

    } catch (error) {
        console.error("Error in searchEventbriteEvents function:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});