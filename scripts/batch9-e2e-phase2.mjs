/**
 * Batch 9 E2E phase 2 — TOTP replay guard across RESTARTS and INSTANCES.
 *
 * Run by scripts/run-batch9-e2e.sh AFTER phase 1 (batch9-e2e.mjs) wrote
 * /tmp/b9-totp-state.json with the exact step+code the first instance
 * consumed. This phase runs against TWO next dev processes sharing one
 * PostgreSQL server-state store:
 *
 *   A = :3007 — the phase-1 instance RESTARTED (fresh process, warm DB)
 *   B = :3008 — a SECOND instance that has never seen phase 1
 *
 * Proofs:
 *   R1: the phase-1 consumed code is refused on the RESTARTED instance
 *       (persistence — the guard is not process memory)
 *   R2: the same code is refused on the NEVER-SEEN instance B, and B reads
 *       the exact stored step phase 1 wrote (cross-instance shared state)
 *   R3: a FRESH step still logs in on A (guard blocks replays, not progress)
 *   R4: the code A just consumed is refused on B within the same ±1 window
 *       (cross-instance replay rejection, not window expiry)
 *   R5: a newer fresh step logs in on B, and A refuses its replay
 *       (both directions proven)
 */
import { readFileSync } from 'node:fs'
import { createHash, createHmac } from 'node:crypto'
import { createRequire } from 'node:module'

const STATE_PATH = '/tmp/b9-totp-state.json'
const BASE_A = process.env.B9_BASE_A || 'http://127.0.0.1:3007'
const BASE_B = process.env.B9_BASE_B || 'http://127.0.0.1:3008'
const PROJECT = '/home/z/my-project'
const require = createRequire(PROJECT + '/package.json')
const { PrismaClient } = require(PROJECT + '/node_modules/@prisma/client')
const prisma = new PrismaClient()

const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'))

let pass = 0, fail = 0
const results = []
function check(name, cond, extra) {
  if (cond) { pass++; results.push(`PASS ${name}${extra ? ' — ' + extra : ''}`) }
  else { fail++; results.push(`FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function jar() {
  const cookies = new Map()
  return {
    header() { return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ') },
    absorb(res) {
      const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : []
      for (const c of raw) {
        const [pair] = c.split(';')
        const idx = pair.indexOf('=')
        cookies.set(pair.slice(0, idx), pair.slice(idx + 1))
      }
    },
  }
}

async function api(base, cj, body) {
  const res = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cj.header() ? { Cookie: cj.header() } : {}) },
    body: JSON.stringify(body),
    redirect: 'manual',
  })
  cj.absorb(res)
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

// ── TOTP (same helpers as phase 1, mirroring src/lib/totp.ts) ──
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function base32Decode(str) {
  const bits = []
  for (const char of str.toUpperCase().replace(/[=]+$/, '')) {
    const val = B32.indexOf(char)
    if (val === -1) continue
    bits.push(val.toString(2).padStart(5, '0'))
  }
  const bytes = []
  const bitString = bits.join('')
  for (let i = 0; i + 8 <= bitString.length; i += 8) bytes.push(parseInt(bitString.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
function totpAt(secret, counter) {
  const key = base32Decode(secret)
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(0, 0)
  buf.writeUInt32BE(counter, 4)
  const digest = createHmac('sha1', key).update(buf).digest()
  const off = digest[digest.length - 1] & 0x0f
  const num = ((digest[off] & 0x7f) << 24) | ((digest[off + 1] & 0xff) << 16) | ((digest[off + 2] & 0xff) << 8) | (digest[off + 3] & 0xff)
  return (num % 1_000_000).toString().padStart(6, '0')
}
function currentStep() { return Math.floor(Date.now() / 1000 / 30) }
const kvKey = `totp-step:${state.userId}`
async function storedStep() {
  const row = await prisma.kvState.findUnique({ where: { key: kvKey } })
  return row ? Number(row.value) : null
}
async function waitFreshStep(afterStep, deadlineMs = 40000) {
  const deadline = Date.now() + deadlineMs
  let c = currentStep()
  while (c <= afterStep && Date.now() < deadline) { await sleep(500); c = currentStep() }
  return c
}

async function main() {
  // R1 — RESTARTED instance A refuses the phase-1 consumed code.
  const r1 = await api(BASE_A, jar(), { email: state.email, password: state.password, twoFactorCode: state.lastCode })
  const s1 = await storedStep()
  check('R1: the phase-1 consumed code is refused on the RESTARTED instance', r1.status === 401 && s1 === state.lastUsedStep,
    `status ${r1.status}, stored step ${s1} (expected ${state.lastUsedStep})`)

  // R2 — the NEVER-SEEN instance B refuses it too and reads the same row.
  const r2 = await api(BASE_B, jar(), { email: state.email, password: state.password, twoFactorCode: state.lastCode })
  const s2 = await storedStep()
  check('R2: the phase-1 consumed code is refused on the SECOND instance (shared store)', r2.status === 401 && s2 === state.lastUsedStep,
    `status ${r2.status}, stored step ${s2}`)

  // R3 — a FRESH step still logs in on the restarted A.
  const freshA = await waitFreshStep(state.lastUsedStep)
  const codeA = totpAt(state.secret, freshA)
  const r3 = await api(BASE_A, jar(), { email: state.email, password: state.password, twoFactorCode: codeA })
  check('R3: a FRESH step logs in on the restarted instance (guard blocks replays, not progress)', r3.status === 200, `status ${r3.status}, step ${freshA}`)

  // R4 — the code A just consumed is refused on B, WITHIN the ±1 window
  // (so the refusal is the replay guard, not window expiry); the stored
  // step is A's fresh claim.
  const r4 = await api(BASE_B, jar(), { email: state.email, password: state.password, twoFactorCode: codeA })
  const s4 = await storedStep()
  const withinWindow = Math.abs(currentStep() - freshA) <= 1
  check('R4: the code consumed on A is refused on B (cross-instance replay, same window)', r4.status === 401 && s4 === freshA && withinWindow,
    `status ${r4.status}, stored step ${s4}, window ok ${withinWindow}`)

  // R5 — a newer fresh step logs in on B, and A refuses its replay.
  const freshB = await waitFreshStep(freshA)
  const codeB = totpAt(state.secret, freshB)
  const r5a = await api(BASE_B, jar(), { email: state.email, password: state.password, twoFactorCode: codeB })
  const r5b = await api(BASE_A, jar(), { email: state.email, password: state.password, twoFactorCode: codeB })
  const s5 = await storedStep()
  check('R5: progress continues on B and A refuses its replay (both directions)', r5a.status === 200 && r5b.status === 401 && s5 === freshB,
    `B fresh ${r5a.status}, A replay ${r5b.status}, stored step ${s5}`)

  console.log('\n===== Batch 9 E2E phase 2 (restart + cross-instance TOTP) =====')
  for (const line of results) console.log(line)
  console.log(`\nTOTAL: ${pass} pass, ${fail} fail`)
  await prisma.$disconnect()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(async (err) => {
  console.error('PHASE 2 CRASH:', err)
  try { await prisma.$disconnect() } catch {}
  process.exit(1)
})
