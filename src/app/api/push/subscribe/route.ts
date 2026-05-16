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
    const { fcmToken, deviceInfo, platform } = body

    if (!fcmToken || typeof fcmToken !== 'string') {
      return NextResponse.json({ error: 'FCM token is required' }, { status: 400 })
    }

    // Upsert: update existing token or create new one
    await db.pushSubscription.upsert({
      where: { fcmToken },
      update: {
        userId: session.userId,
        deviceInfo: deviceInfo || null,
        platform: platform || null,
      },
      create: {
        userId: session.userId,
        fcmToken,
        deviceInfo: deviceInfo || null,
        platform: platform || null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('Push subscribe error:', message)
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 })
  }
}
