import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 401 });
    }

    const { taskId, updates } = await req.json();
    
    if (!taskId || !updates) {
      return Response.json({ 
        success: false, 
        error: 'taskId and updates required' 
      }, { status: 400 });
    }

    const appId = Deno.env.get('BASE44_APP_ID');
    const apiUrl = `https://api.base44.com/api/scheduled-tasks/${taskId}`;

    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': appId,
        'Authorization': req.headers.get('Authorization')
      },
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update task');
    }

    const data = await response.json();

    return Response.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error updating scheduled task:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});