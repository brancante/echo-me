import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { getDb } from '@/lib/db'

/**
 * GET /api/chat/[id]
 * 
 * Get chat job status and result
 * 
 * Returns:
 * {
 *   "id": 123,
 *   "status": "completed",
 *   "result_data": {
 *     "response_text": "Here are our products...",
 *     "audio_path": "/tmp/chat_1_10.mp3",
 *     "rag_context_count": 5,
 *     "persona_name": "Sales Joe"
 *   },
 *   "error_message": null,
 *   "created_at": "2026-03-03T...",
 *   "completed_at": "2026-03-03T..."
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const jobId = parseInt(params.id)
    if (isNaN(jobId)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 })
    }

    const db = getDb()

    // Fetch job (scoped to user)
    const result = await db.query(
      `SELECT id, status, result_data, error_message, created_at, completed_at
       FROM jobs
       WHERE id = $1 AND user_id = $2`,
      [jobId, session.user.id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    return NextResponse.json(result.rows[0])

  } catch (error) {
    console.error('Chat status API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch job status' },
      { status: 500 }
    )
  }
}
