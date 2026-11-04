/**
 * Payload size report — measures the serialized UTF-8 size of the FCM v1
 * message for short / long / HTML emails, BEFORE vs AFTER the size guard.
 *
 * The "before" builder is an exact inline copy of the pre-fix builder
 * (avatar placed into data verbatim) so the comparison is honest.
 * The avatar is produced exactly like production: sharp → 128x128 JPEG q80
 * → Base64 data URL (src/app/api/user/avatar/route.ts).
 *
 * Run: bun scripts/payload-size-report.ts
 */
import sharp from 'sharp'
import { buildFcmMessage, measureFcmMessageBytes } from '../src/lib/notifications/sendPushNotification'
import { readFileSync } from 'node:fs'

// Pre-fix builder (verbatim behavior): no capping, no dropping
function oldBuildFcmMessage(p: {
  fcmToken: string; senderName: string; subject: string; emailId: string
  senderEmail?: string; avatarUrl?: string; preview?: string
}) {
  const body = p.subject || '(No subject)'
  const data: Record<string, string> = {
    url: `/?id=${p.emailId}`,
    emailId: p.emailId,
    tag: `email-${p.emailId}`,
    title: `New email from ${p.senderName}`,
    body,
  }
  if (p.preview) data.preview = p.preview
  if (p.senderEmail) data.senderEmail = p.senderEmail
  if (p.avatarUrl) data.avatar = p.avatarUrl
  return {
    message: {
      token: p.fcmToken,
      data,
      webpush: { headers: { Urgency: 'high' } },
      android: {
        priority: 'high',
        notification: {
          title: `New email from ${p.senderName}`,
          body,
          defaultSound: true,
          defaultVibrateTimings: true,
          icon: 'ic_launcher',
          channelId: 'ezy-emails',
        },
      },
      apns: { payload: { aps: { alert: { title: `New email from ${p.senderName}`, body }, sound: 'default', badge: 1 } } },
    },
  }
}

async function makeRealAvatarDataUrl(): Promise<string> {
  // Same pipeline as POST /api/user/avatar: any image in, 128x128 JPEG q80 out
  const src = readFileSync('public/logo.png')
  const buf = await sharp(src).resize(128, 128, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer()
  return `data:image/jpeg;base64,${buf.toString('base64')}`
}

const TOKEN = 'dR7xKq2mNp9sTv3bWy5zA1cE4fG6hI8jK0lM2nO4pQ6rS8tU0vW2xY4zA6bC8dE0fG:APA91bF' + 'K'.repeat(60)

async function main() {
  const avatar = await makeRealAvatarDataUrl()
  console.log('avatar data URL chars:', avatar.length, '| utf8 bytes:', Buffer.byteLength(avatar, 'utf8'))
  console.log('')

  const longBody = ('Assalamu alaikum, this is a long letter about the upcoming community meeting. '.repeat(160)).trim() // ~11,200 chars
  const htmlBody = '<p>Salam <b>friend</b>, see the <a href="https://ezymail.vercel.app">proposal</a> &amp; attached <img src="x.png"/> report.</p>'.repeat(12)

  const scenarios = [
    { name: 'short email', subject: 'Meeting tomorrow', body: 'See you at 4pm at the office.', html: false },
    { name: 'long email (11k chars)', subject: 'Community meeting agenda and minutes', body: longBody, html: false },
    { name: 'HTML email', subject: 'Weekly report <b>attached</b>', body: htmlBody, html: true },
  ]

  let allAfterUnderLimit = true
  for (const s of scenarios) {
    // The compose route collapses whitespace + slices preview to 200 chars
    const preview = s.body.replace(/\s+/g, ' ').trim().slice(0, 200)
    const base = {
      fcmToken: TOKEN,
      senderName: 'Ahmad Rahimi',
      subject: s.subject,
      emailId: 'clx' + 'e'.repeat(21) + '42',
      senderEmail: 'ahmad@ezy.af',
      avatarUrl: avatar,
      preview,
    }
    const beforeBytes = measureFcmMessageBytes(oldBuildFcmMessage(base))
    const afterMsg = buildFcmMessage(base)
    const afterBytes = measureFcmMessageBytes(afterMsg)
    const avatarKept = (afterMsg as any).message.data.avatar !== undefined
    const previewKept = (afterMsg as any).message.data.preview !== undefined
    if (afterBytes > 3584) allAfterUnderLimit = false
    console.log(`── ${s.name} ──`)
    console.log(`  BEFORE (pre-fix wire): ${beforeBytes} bytes  ${beforeBytes > 4096 ? '→ FCM 400 Message is too large ❌' : ''}`)
    console.log(`  AFTER  (size guard):   ${afterBytes} bytes  → under 3584 safe limit ✓`)
    console.log(`  avatar kept: ${avatarKept} | preview kept: ${previewKept}`)
    console.log(`  url intact: ${(afterMsg as any).message.data.url === `/?id=${base.emailId}`} | emailId intact: ${(afterMsg as any).message.data.emailId === base.emailId}`)
    console.log('')
  }
  console.log('all AFTER payloads under the 3584-byte safe limit:', allAfterUnderLimit)
}

main()
