import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { getDb } from '@/lib/db'
import { pushToQueue } from '@/lib/redis'

/**
 * POST /api/chat
 * 
 * Create a chat job and enqueue for processing
 * 
 * Body:
 * {
 *   "message": "What products do you have?",
 *   "product_id": 5 (optional),
 *   "client_id": 10 (optional),
 *   "generate_audio": false (optional),
 *   "conversation_history": [] (optional)
 * }
 * 
 * Returns: { job_id: 123 }
 */
export async function POST(request: NextRequest) {
  const session = await requireAuth(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { message, product_id, client_id, generate_audio, conversation_history } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    const db = getDb()

    // Create job in database
    const result = await db.query(
      `INSERT INTO jobs (user_id, type, status, input)
       VALUES ($1, 'chat', 'pending', $2)
       RETURNING id`,
      [
        session.user.id,
        JSON.stringify({
          message,
          product_id,
          client_id,
          generate_audio: generate_audio || false,
          conversation_history: conversation_history || []
        })
      ]
    )

    const jobId = result.rows[0].id

    // Push to Redis queue
    await pushToQueue('queue:chat', {
      job_id: jobId,
      user_id: session.user.id,
      message,
      product_id,
      client_id,
      generate_audio: generate_audio || false,
      conversation_history: conversation_history || []
    })

    return NextResponse.json({ job_id: jobId })

  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Failed to create chat job' },
      { status: 500 }
    )
  }
}
