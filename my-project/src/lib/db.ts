import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // Use pg adapter for connection pooling (required for Vercel serverless)
  const connectionString = process.env.DATABASE_URL!

  // In production (Vercel), use the pg adapter for connection pooling
  // In development, use standard PrismaClient
  if (process.env.NODE_ENV === 'production' && connectionString.startsWith('postgresql://')) {
    const { Pool } = require('pg')
    const pool = new Pool({
      connectionString,
      max: 5, // Max connections for serverless
      idleTimeoutMillis: 10000,
    })
    const adapter = new PrismaPg(pool)
    return new PrismaClient({ adapter })
  }

  return new PrismaClient({
    log: ['query'],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
