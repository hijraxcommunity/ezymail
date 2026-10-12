import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { z } from 'zod/v4'

const addLabelsSchema = z.object({
  labelIds: z.array(z.string()),
})

/**
 * Returns the email only when it exists AND the session user may access it.
 * Access follows the same rule as /api/emails/[id]: the user is the sender
 * or the recipient. Returns null otherwise, so callers answer 404 and never
 * confirm the existence of another user's email.
 */
async function getEmailIfAccessible(emailId: string, userId: string, userEmail: string) {
  return db.email.findFirst({
    where: {
      id: emailId,
      OR: [{ senderId: userId }, { recipientEmail: userEmail }],
    },
    select: { id: true },
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const email = await getEmailIfAccessible(id, session.userId, session.email)
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email not found' }, { status: 404 })
    }

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
    const session = await getSession()
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const email = await getEmailIfAccessible(id, session.userId, session.email)
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email not found' }, { status: 404 })
    }

    const body = await req.json()
    const { labelIds } = addLabelsSchema.parse(body)

    // Verify label ownership: only labels owned by the session user are ever
    // modified; foreign or unknown label ids are silently skipped (unchanged
    // behavior for valid operations).
    const ownedLabels = await db.label.findMany({
      where: { id: { in: labelIds }, userId: session.userId },
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
    const session = await getSession()
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const email = await getEmailIfAccessible(id, session.userId, session.email)
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email not found' }, { status: 404 })
    }

    const body = await req.json()
    const { labelIds } = addLabelsSchema.parse(body)

    // Only labels owned by the session user may be modified. Filtering to
    // owned ids prevents deleting any EmailLabel row that references another
    // user's label, even if such a row exists in the database.
    const ownedLabels = await db.label.findMany({
      where: { id: { in: labelIds }, userId: session.userId },
      select: { id: true },
    })
    const ownedIds = ownedLabels.map(l => l.id)

    await db.emailLabel.deleteMany({
      where: { emailId: id, labelId: { in: ownedIds } },
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
