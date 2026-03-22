import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    // 링크만 있고 상세 데이터가 없는 레코드들을 조회 (name_original이 없거나 빈 문자열)
    const allRawData = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.list('-created_date', 1000);
    const linkOnlyRecords = allRawData.filter(r => !r.name_original || r.name_original === "");

    console.log(`Found ${linkOnlyRecords.length} link-only records to migrate`);

    let migrated = 0;
    let deleted = 0;

    for (const record of linkOnlyRecords) {
      try {
        // 새 JapantravelLinks 엔티티에 생성
        await base44.asServiceRole.entities.JapantravelLinks.create({
          url: record.source_url,
          country: record.country,
          processing_status: record.processing_status || 'pending',
          error_message: record.error_message || null
        });

        // 기존 레코드 삭제
        await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.delete(record.id);

        migrated++;
        deleted++;
      } catch (error) {
        console.error(`Failed to migrate record ${record.id}:`, error.message);
      }
    }

    return Response.json({
      success: true,
      message: `Migration completed: ${migrated} records migrated, ${deleted} records deleted from RawData`,
      migrated,
      deleted
    });

  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});