import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let skip = 0;
    const limit = 50;
    let totalUpdated = 0;
    let totalSkipped = 0;

    while (true) {
        const festivals = await base44.asServiceRole.entities.Festival.filter(
            { country: '대한민국' },
            '-created_date',
            limit,
            skip
        );

        if (!festivals || festivals.length === 0) break;

        for (const festival of festivals) {
            if (festival.description && !festival.description_original) {
                await base44.asServiceRole.entities.Festival.update(festival.id, {
                    description_original: festival.description
                });
                totalUpdated++;
            } else {
                totalSkipped++;
            }
        }

        if (festivals.length < limit) break;
        skip += limit;
    }

    return Response.json({ success: true, updated: totalUpdated, skipped: totalSkipped });
});