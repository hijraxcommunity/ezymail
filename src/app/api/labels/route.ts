import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { db } from '@/lib/db'
import { z } from 'zod/v4'

const labelSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().default('#4285F4'),
})

async function getSession(req: NextRequest) {
  const token = req.cookies.get('token')?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET))
    return payload
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const labels = await db.label.findMany({
      where: { userId: session.userId as string },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ success: true, data: labels })
  } catch (error) {
    console.error('GET /api/labels error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch labels' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req)
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = labelSchema.parse(body)

    const label = await db.label.create({
      data: {
        userId: session.userId as string,
        name: parsed.name,
        color: parsed.color,
      },
    })

    return NextResponse.json({ success: true, data: label }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input', details: error.errors }, { status: 400 })
    }
    console.error('POST /api/labels error:', error)
    return NextResponse.json({ success: false, error: 'Failed to create label' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession(req)
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { id, ...data } = labelSchema.partial().required({ name: true }).parse(body)

    if (!id) {
      return NextResponse.json({ success: false, error: 'Label ID required' }, { status: 400 })
    }

    const label = await db.label.findFirst({
      where: { id, userId: session.userId as string },
    })

    if (!label) {
      return NextResponse.json({ success: false, error: 'Label not found' }, { status: 404 })
    }

    const updated = await db.label.update({
      where: { id },
      data,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input', details: error.errors }, { status: 400 })
    }
    console.error('PUT /api/labels error:', error)
    return NextResponse.json({ success: false, error: 'Failed to update label' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession(req)
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'Label ID required' }, { status: 400 })
    }

    const label = await db.label.findFirst({
      where: { id, userId: session.userId as string },
    })

    if (!label) {
      return NextResponse.json({ success: false, error: 'Label not found' }, { status: 404 })
    }

    await db.label.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/labels error:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete label' }, { status: 500 })
  }
}
