import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // ─── Admin User ───
  const adminPassword = await hash('Admin@123', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@ezy.af' },
    update: {},
    create: {
      email: 'admin@ezy.af',
      passwordHash: adminPassword,
      firstName: 'EzyMail',
      lastName: 'Admin',
      dateOfBirth: '1990-01-01',
      role: 'admin',
      status: 'active',
    },
  })
  console.log(`✅ Admin: ${admin.email}`)

  // ─── Test Users ───
  const testPassword = await hash('Test@123', 12)

  const user1 = await prisma.user.upsert({
    where: { email: 'john.doe@ezy.af' },
    update: {},
    create: {
      email: 'john.doe@ezy.af',
      passwordHash: testPassword,
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1995-06-15',
      role: 'user',
      status: 'active',
    },
  })
  console.log(`✅ User: ${user1.email}`)

  const user2 = await prisma.user.upsert({
    where: { email: 'sarah.smith@ezy.af' },
    update: {},
    create: {
      email: 'sarah.smith@ezy.af',
      passwordHash: testPassword,
      firstName: 'Sarah',
      lastName: 'Smith',
      dateOfBirth: '1998-03-22',
      role: 'user',
      status: 'active',
    },
  })
  console.log(`✅ User: ${user2.email}`)

  const user3 = await prisma.user.upsert({
    where: { email: 'ahmad.khan@ezy.af' },
    update: {},
    create: {
      email: 'ahmad.khan@ezy.af',
      passwordHash: testPassword,
      firstName: 'Ahmad',
      lastName: 'Khan',
      dateOfBirth: '2000-11-08',
      role: 'user',
      status: 'active',
    },
  })
  console.log(`✅ User: ${user3.email}`)

  // ─── Welcome System User ───
  const welcomePassword = await hash('system-welcome-2025', 12)
  const welcome = await prisma.user.upsert({
    where: { email: 'welcome@ezy.af' },
    update: {},
    create: {
      email: 'welcome@ezy.af',
      passwordHash: welcomePassword,
      firstName: 'EzyMail',
      lastName: 'Team',
      dateOfBirth: '2000-01-01',
      role: 'system',
      status: 'active',
    },
  })
  console.log(`✅ System: ${welcome.email}`)

  // ─── Sample Emails (skip if already exist) ───
  const emailCount = await prisma.email.count()
  if (emailCount === 0) {
    await prisma.email.create({
      data: {
        senderId: welcome.id,
        recipientEmail: user1.email,
        subject: 'Welcome to EzyMail! 🎉',
        body: 'Hi John,\n\nWelcome to EzyMail — your new home for fast, simple, and secure email.\n\nHere are a few things to get you started:\n• 📧 Send your first email to a friend\n• ⭐ Star important messages to find them quickly\n• 📁 Create custom folders to stay organized\n\nHappy emailing!\nThe EzyMail Team',
        bodyHtml: '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><div style="background: linear-gradient(135deg, #4285F4 0%, #34A853 100%); padding: 30px; border-radius: 12px 12px 0 0;"><h1 style="color: white; margin: 0;">Welcome to EzyMail! 🎉</h1></div><div style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px;"><p style="font-size: 16px;">Hi John,</p><p style="font-size: 16px;">Welcome to EzyMail — your new home for fast, simple, and secure email.</p><h3>Get started:</h3><ul style="line-height: 2;"><li>📧 Send your first email to a friend</li><li>⭐ Star important messages</li><li>📁 Create custom folders</li></ul><p>Happy emailing!<br><strong>The EzyMail Team</strong></p></div></div>',
        folder: 'inbox',
        isRead: true,
      },
    })

    await prisma.email.create({
      data: {
        senderId: user2.id,
        recipientEmail: user1.email,
        subject: 'Meeting Tomorrow',
        body: 'Hi John,\n\nJust wanted to confirm our meeting tomorrow at 10 AM. Please bring the project documents.\n\nBest,\nSarah',
        bodyHtml: '<p>Hi John,</p><p>Just wanted to confirm our meeting tomorrow at <strong>10 AM</strong>. Please bring the project documents.</p><p>Best,<br>Sarah</p>',
        folder: 'inbox',
        isRead: false,
      },
    })

    await prisma.email.create({
      data: {
        senderId: user3.id,
        recipientEmail: user1.email,
        subject: 'Project Update - Q2 Goals',
        body: 'Hey John,\n\nI have completed the Q2 project goals document. Here is a summary:\n\n1. Increase user engagement by 25%\n2. Launch new mobile app features\n3. Improve email delivery speed by 40%\n\nLet me know your thoughts.\n\nThanks,\nAhmad',
        bodyHtml: '<p>Hey John,</p><p>I have completed the Q2 project goals document. Here is a summary:</p><ol><li>Increase user engagement by 25%</li><li>Launch new mobile app features</li><li>Improve email delivery speed by 40%</li></ol><p>Let me know your thoughts.</p><p>Thanks,<br>Ahmad</p>',
        folder: 'inbox',
        isRead: false,
      },
    })

    await prisma.email.create({
      data: {
        senderId: user1.id,
        recipientEmail: user2.email,
        subject: 'Re: Meeting Tomorrow',
        body: 'Hi Sarah,\n\nConfirmed! I will be there at 10 AM with all the documents.\n\nSee you then,\nJohn',
        bodyHtml: '<p>Hi Sarah,</p><p>Confirmed! I will be there at 10 AM with all the documents.</p><p>See you then,<br>John</p>',
        folder: 'sent',
        isRead: true,
      },
    })

    await prisma.email.create({
      data: {
        senderId: admin.id,
        recipientEmail: user3.email,
        subject: 'System Maintenance Notice',
        body: 'Dear User,\n\nWe will be performing scheduled maintenance this Saturday from 2 AM to 4 AM (UTC).\n\nDuring this time, EzyMail services may be temporarily unavailable. We apologize for any inconvenience.\n\nThank you for your patience.\n\nEzyMail Admin Team',
        bodyHtml: '<p>Dear User,</p><p>We will be performing scheduled maintenance this <strong>Saturday from 2 AM to 4 AM (UTC)</strong>.</p><p>During this time, EzyMail services may be temporarily unavailable.</p><p>Thank you for your patience.</p><p>EzyMail Admin Team</p>',
        folder: 'inbox',
        isRead: true,
      },
    })

    await prisma.email.create({
      data: {
        senderId: user2.id,
        recipientEmail: user1.email,
        subject: 'Important: Deadline Extended',
        body: 'Hi John,\n\nGood news! The project deadline has been extended to next Friday. This should give us enough time to finalize everything.\n\nBest regards,\nSarah',
        bodyHtml: '<p>Hi John,</p><p>Good news! The project deadline has been extended to <strong>next Friday</strong>. This should give us enough time to finalize everything.</p><p>Best regards,<br>Sarah</p>',
        folder: 'inbox',
        isRead: false,
        isStarred: true,
      },
    })
    console.log('✅ Sample emails created')
  } else {
    console.log(`ℹ️  Skipping emails (${emailCount} already exist)`)
  }

  // ─── Custom Folders for John ───
  const folderCount = await prisma.folder.count({ where: { userId: user1.id } })
  if (folderCount === 0) {
    await prisma.folder.createMany({
      data: [
        { userId: user1.id, name: 'Work', color: '#4285F4' },
        { userId: user1.id, name: 'Personal', color: '#34A853' },
      ],
    })
    console.log('✅ Folders created')
  } else {
    console.log(`ℹ️  Skipping folders (${folderCount} already exist)`)
  }

  // ─── System Settings ───
  const settingsCount = await prisma.systemSettings.count()
  if (settingsCount === 0) {
    await prisma.systemSettings.createMany({
      data: [
        { settingKey: 'max_email_size', settingValue: '"25"', category: 'email' },
        { settingKey: 'maintenance_mode', settingValue: 'false', category: 'system' },
        { settingKey: 'registration_open', settingValue: 'true', category: 'auth' },
      ],
    })
    console.log('✅ System settings created')
  } else {
    console.log(`ℹ️  Skipping settings (${settingsCount} already exist)`)
  }

  console.log('\n🎉 Seed completed!')
  console.log('\n📋 Test Accounts:')
  console.log('  Admin:  admin@ezy.af / Admin@123')
  console.log('  User:   john.doe@ezy.af / Test@123')
  console.log('  User:   sarah.smith@ezy.af / Test@123')
  console.log('  User:   ahmad.khan@ezy.af / Test@123')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
