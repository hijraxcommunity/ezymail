import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { db } from '@/lib/db'
import { z } from 'zod/v4'

const addLabelsSchema = z.object({
  labelIds: z.array(z.string()),
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const emailLabels = await db.emailLabel.findMany({
      where: { emailId: id },
      include: { label: true },
    })

    const labels = emailLabels.map(el => el.label)
    return NextResponse.json({ success: true, data: labels })
  } catch (error) {
    console.error('GET email labels error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch labels' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const { labelIds } = addLabelsSchema.parse(body)

    // Verify label ownership
    const ownedLabels = await db.label.findMany({
      where: { id: { in: labelIds }, userId: session.userId as string },
    })

    const ownedIds = ownedLabels.map(l => l.id)

    // Create EmailLabel relations (skip duplicates)
    for (const labelId of ownedIds) {
      await db.emailLabel.upsert({
        where: { emailId_labelId: { emailId: id, labelId } },
        create: { emailId: id, labelId },
        update: {},
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 })
    }
    console.error('POST email labels error:', error)
    return NextResponse.json({ success: false, error: 'Failed to add labels' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const { labelIds } = addLabelsSchema.parse(body)

    await db.emailLabel.deleteMany({
      where: { emailId: id, labelId: { in: labelIds } },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 })
    }
    console.error('DELETE email labels error:', error)
    return NextResponse.json({ success: false, error: 'Failed to remove labels' }, { status: 500 })
  }
}
