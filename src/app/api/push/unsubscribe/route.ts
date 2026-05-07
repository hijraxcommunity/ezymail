import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { fcmToken } = body

    if (!fcmToken || typeof fcmToken !== 'string') {
      return NextResponse.json({ error: 'FCM token is required' }, { status: 400 })
    }

    // Only allow users to delete their own tokens
    await db.pushSubscription.deleteMany({
      where: {
        fcmToken,
        userId: session.userId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('Push unsubscribe error:', message)
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
  }
}
