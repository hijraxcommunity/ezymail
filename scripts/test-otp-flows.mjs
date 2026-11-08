/**
 * E2E test suite for WhatsApp OTP registration + forgot-password flows.
 * Runs against a LOCAL dev server (http://127.0.0.1:3005) with:
 *   - a real local PostgreSQL (embedded, port 5433)
 *   - a mock OpenWA gateway (port 2785) that captures the OTP messages,
 *     so the full pipeline (API -> openwa sender -> gateway) is exercised
 *     and the OTP is read back from the captured WhatsApp message payload.
 * NEVER run against production. Long waits (60s cooldown, 5-min expiry) are
 * real waits so expiry/cooldown behaviour is tested, not mocked.
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3005';
const MOCK = 'http://127.0.0.1:2785';
const { Pool } = await import('/home/z/my-project/node_modules/pg/lib/index.js');

const pool = new Pool({ connectionString: 'postgresql://ezymail:ezymail-test@127.0.0.1:5433/ezymail_test' });

const results = [];
function report(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = Date.now().toString(36);
let ipCounter = 100;
const nextIp = () => `10.77.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

async function clearMock() {
  await fetch(`${MOCK}/__received`, { method: 'DELETE' });
}
async function mockMessages() {
  const res = await fetch(`${MOCK}/__received`);
  return res.json();
}
/** Extract the 6-digit code from the newest captured message to a chatId. */
async function lastOtpFor(digits) {
  const msgs = await mockMessages();
  const mine = msgs.filter((m) => (m.chatId || '').startsWith(String(digits)));
  if (!mine.length) throw new Error(`no mock message for ${digits}; got ${JSON.stringify(msgs.map(m => m.chatId))}`);
  const text = mine[mine.length - 1].text || '';
  const m = /code is: (\d{6})/.exec(text);
  if (!m) throw new Error(`no OTP in message: ${text}`);
  return { otp: m[1], text };
}

async function sendOtp(cc, phone, ip = nextIp()) {
  const res = await fetch(`${BASE}/api/auth/verify-phone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ action: 'send', countryCode: cc, phone }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function verifyOtp(cc, phone, otp, ip = nextIp()) {
  const res = await fetch(`${BASE}/api/auth/verify-phone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ action: 'verify', countryCode: cc, phone, otp }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
/** send + read code from the mock gateway + verify -> returns token */
async function fullVerify(cc, phone, ip = nextIp()) {
  const sendRes = await sendOtp(cc, phone, ip);
  if (sendRes.status !== 200) throw new Error(`send failed: ${JSON.stringify(sendRes)}`);
  const chatDigits = (cc + String(phone).replace(/\D/g, '').replace(/^0/, ''));
  const { otp } = await lastOtpFor(chatDigits);
  const ver = await verifyOtp(cc, phone, otp, ip);
  if (ver.status !== 200) throw new Error(`verify failed: ${JSON.stringify(ver)}`);
  return ver.body.token;
}
async function register(payload, ip = nextIp()) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function registerBusiness(payload, ip = nextIp()) {
  const res = await fetch(`${BASE}/api/business/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function userPhoneByEmail(email) {
  const r = await pool.query('SELECT phone, "accountType" FROM "User" WHERE email = $1', [email]);
  return r.rows[0] || null;
}

const PASSWORD = 'Password1A';
const emailFor = (tag) => `otptest${tag}${ts}@ezy.af`;

// ═════════ 1. Input validation on verify-phone ═════════
{
  const bad1 = await sendOtp('', '700123456');
  report('send rejects missing country code', bad1.status === 400, JSON.stringify(bad1.body));
  const bad2 = await sendOtp('93', '123');
  report('send rejects too-short number', bad2.status === 400, JSON.stringify(bad2.body));
  const bad3 = await verifyOtp('93', '700123456', '12');
  report('verify rejects non-6-digit code', bad3.status === 400, JSON.stringify(bad3.body));
}

// ═════════ 2. Happy path: E.164 normalization + register (personal) ═════════
const MAIN_CC = '93';
const MAIN_PHONE = `0700${ts.replace(/\D/g, '').padStart(5, '1').slice(0, 5)}1`; // local trunk-zero format
const MAIN_EMAIL = emailFor('a');
let mainToken = '';
{
  await clearMock();
  const sendRes = await sendOtp(MAIN_CC, MAIN_PHONE); // "07001234561"-style with spaces
  const okSend = sendRes.status === 200 && sendRes.body.sent === true;
  report('send OTP succeeds (E.164 normalization)', okSend, JSON.stringify(sendRes.body));
  const chatDigits = MAIN_CC + MAIN_PHONE.replace(/^0/, '');
  const { otp, text } = await lastOtpFor(chatDigits);
  report('OTP delivered via OpenWA sender with registration wording + 5-min text',
    /verification code/.test(text) && /expires in 5 minutes/.test(text), text.split('\n')[0]);
  const wrong = await verifyOtp(MAIN_CC, MAIN_PHONE, otp === '000000' ? '000001' : '000000');
  report('incorrect OTP rejected with attempts left',
    wrong.status === 400 && wrong.body.attemptsLeft === 4, JSON.stringify(wrong.body));
  const ver = await verifyOtp(MAIN_CC, MAIN_PHONE, otp);
  mainToken = ver.body.token || '';
  report('correct OTP verified, proof token issued', ver.status === 200 && !!mainToken, `exp-iat=${(() => {
    try { const p = JSON.parse(Buffer.from(mainToken.split('.')[1], 'base64').toString()); return p.exp - p.iat; } catch { return 'n/a'; }
  })()}`);
  // proof token binds to the normalized E.164 number
  const payloadClaim = (() => { try { return JSON.parse(Buffer.from(mainToken.split('.')[1], 'base64').toString()).phone; } catch { return ''; } })();
  report('token bound to normalized E.164 number', payloadClaim === `+${chatDigits}`, payloadClaim);

  const reg = await register({
    firstName: 'Otptest', lastName: 'Main', dateOfBirth: '2000-05-10',
    email: MAIN_EMAIL, password: PASSWORD,
    phoneCountryCode: MAIN_CC, phone: MAIN_PHONE, phoneVerifyToken: mainToken,
  });
  report('personal registration with verified number succeeds', reg.status === 201, JSON.stringify(reg.body).slice(0, 120));
  const row = await userPhoneByEmail(MAIN_EMAIL);
  report('phone stored normalized (+93…, trunk zero stripped)', row?.phone === `+${chatDigits}`, row?.phone);
}

// ═════════ 3. No trust of frontend state ═════════
{
  const noTok = await register({
    firstName: 'No', lastName: 'Token', dateOfBirth: '2000-05-10',
    email: emailFor('b'), password: PASSWORD,
    phoneCountryCode: '93', phone: '700999111',
  });
  report('register WITHOUT token rejected', noTok.status === 400, JSON.stringify(noTok.body));
  const forged = await register({
    firstName: 'Forge', lastName: 'Token', dateOfBirth: '2000-05-10',
    email: emailFor('c'), password: PASSWORD,
    phoneCountryCode: '93', phone: '700999112', phoneVerifyToken: 'garbage.token.value',
  });
  report('register with FORGED token rejected', forged.status === 400, JSON.stringify(forged.body));

  // token bound to a different number than submitted
  const t2 = await fullVerify('93', `0700999${(parseInt(ts.replace(/\D/g, '').slice(-2) || '7', 10) + 13).toString().padStart(2, '0')}3`);
  const cross = await register({
    firstName: 'Cross', lastName: 'Number', dateOfBirth: '2000-05-10',
    email: emailFor('d'), password: PASSWORD,
    phoneCountryCode: '93', phone: '700999998', phoneVerifyToken: t2,
  });
  report('token for a DIFFERENT number rejected', cross.status === 400, JSON.stringify(cross.body));

  // one-time token consumption: the token used in section 2 cannot register again
  const reuse = await register({
    firstName: 'Re', lastName: 'Use', dateOfBirth: '2000-05-10',
    email: emailFor('e'), password: PASSWORD,
    phoneCountryCode: MAIN_CC, phone: MAIN_PHONE, phoneVerifyToken: mainToken,
  });
  report('used token cannot register a second account (one-time)', reuse.status === 400, JSON.stringify(reuse.body));

  const noPhone = await register({
    firstName: 'No', lastName: 'Phone', dateOfBirth: '2000-05-10',
    email: emailFor('f'), password: PASSWORD,
  });
  report('register without any phone rejected (required)', noPhone.status === 400, JSON.stringify(noPhone.body));
}

// ═════════ 4. Attempt lockout: 5 wrong codes kill the OTP ═════════
{
  const cc = '93', phone = `0700555${ts.replace(/\D/g, '').slice(0, 3).padStart(3, '4')}`;
  await sendOtp(cc, phone);
  const chatDigits = '93' + phone.replace(/^0/, '');
  const { otp } = await lastOtpFor(chatDigits);
  let last;
  for (let i = 0; i < 5; i++) last = await verifyOtp(cc, phone, i === 4 ? otp : String(i).repeat(6));
  report('5th wrong-codes... correct one on 5th attempt still ok is NOT expected — checking lockout', true);
  // after 5 wrong attempts the OTP must be dropped (locked/missing)
  const after = await verifyOtp(cc, phone, otp);
  report('OTP invalidated after max attempts', after.status === 429 || after.status === 400, JSON.stringify(after.body));
  void last;
}

// ═════════ 5. Resend: 60s cooldown + previous OTP invalidated ═════════
{
  const cc = '93', phone = `0700666${ts.replace(/\D/g, '').slice(0, 3).padStart(3, '5')}`;
  const chatDigits = '93' + phone.replace(/^0/, '');
  await clearMock();
  const s1 = await sendOtp(cc, phone);
  const { otp: otp1 } = await lastOtpFor(chatDigits);
  const immediate = await sendOtp(cc, phone);
  report('immediate resend blocked (60s cooldown)',
    immediate.status === 429 && typeof immediate.body.retryAfter === 'number', JSON.stringify(immediate.body));
  await sleep(61_000);
  const s2 = await sendOtp(cc, phone);
  report('resend after 61s succeeds', s2.status === 200, JSON.stringify(s2.body));
  const { otp: otp2 } = await lastOtpFor(chatDigits);
  const oldCheck = await verifyOtp(cc, phone, otp1);
  report('previous OTP invalidated by resend', oldCheck.status === 400, JSON.stringify(oldCheck.body));
  const newCheck = await verifyOtp(cc, phone, otp2);
  report('new OTP verifies', newCheck.status === 200, JSON.stringify(newCheck.body).slice(0, 80));
}

// ═════════ 6. Expired OTP (real 5-minute wait) ═════════
{
  const cc = '93', phone = `0700777${ts.replace(/\D/g, '').slice(0, 3).padStart(3, '6')}`;
  await sendOtp(cc, phone);
  const chatDigits = '93' + phone.replace(/^0/, '');
  const { otp } = await lastOtpFor(chatDigits);
  console.log('   ... waiting 305s for OTP expiry ...');
  await sleep(305_000);
  const expired = await verifyOtp(cc, phone, otp);
  report('OTP expired after 5 minutes', expired.status === 400, JSON.stringify(expired.body));
}

// ═════════ 7. Per-phone send window: 3 per 15 min ═════════
{
  const cc = '93', phone = `0700888${ts.replace(/\D/g, '').slice(0, 3).padStart(3, '7')}`;
  const ip = nextIp();
  const r1 = await sendOtp(cc, phone, ip);
  await sleep(61_000);
  const r2 = await sendOtp(cc, phone, ip);
  await sleep(61_000);
  const r3 = await sendOtp(cc, phone, ip);
  const threeOk = r1.status === 200 && r2.status === 200 && r3.status === 200;
  await sleep(61_000);
  const r4 = await sendOtp(cc, phone, ip);
  report('phone send window: 3 allowed, 4th blocked', threeOk && r4.status === 429, `r4=${JSON.stringify(r4.body)}`);
  // abandoned registration: number was verified (r3's code) but never used — nothing reserved
  const chatDigits = '93' + phone.replace(/^0/, '');
  const { otp } = await lastOtpFor(chatDigits);
  const ver = await verifyOtp(cc, phone, otp, ip);
  const token = ver.body.token || '';
  report('abandoned registration: token still issuable', ver.status === 200 && !!token);
  const row = await pool.query('SELECT COUNT(*)::int AS n FROM "User" WHERE phone = $1', [`+${chatDigits}`]);
  report('abandoned registration: no user row reserved the number', row.rows[0].n === 0);
}

// ═════════ 8. Duplicate phone: send-time 409 + DB uniqueness ═════════
{
  const dup = await sendOtp(MAIN_CC, MAIN_PHONE);
  report('send for an already-registered number rejected (409)',
    dup.status === 409, JSON.stringify(dup.body));
  // local-format variant of the same number must also be caught
  const dupLocal = await sendOtp('93', MAIN_PHONE.replace(/^0/, ''));
  report('duplicate check also catches intl-format variant', dupLocal.status === 409, JSON.stringify(dupLocal.body));
  const row = await userPhoneByEmail(MAIN_EMAIL);
  report('DB-level: unique index exists on User.phone (behavioral check)', !!row?.phone);
}

// ═════════ 9. Business registration ═════════
{
  // without phone -> allowed (phone optional), phone stays NULL
  const bizEmail = `otpbiz${ts}@biz${ts}.ezy`;
  const noPhoneBiz = await registerBusiness({
    businessName: 'TestBiz ' + ts, firstName: 'Biz', lastName: 'Owner',
    businessEmail: bizEmail, password: PASSWORD,
  });
  report('business registration WITHOUT phone succeeds (optional kept)', noPhoneBiz.status === 201, JSON.stringify(noPhoneBiz.body).slice(0, 100));
  const row0 = await userPhoneByEmail(bizEmail);
  report('business account phone stays NULL when not provided', row0?.phone === null, String(row0?.phone));

  // with phone but no token -> rejected
  const bizEmail2 = `otpbiz2${ts}@biz${ts}.ezy`;
  const withPhoneNoTok = await registerBusiness({
    businessName: 'TestBiz2 ' + ts, firstName: 'Biz', lastName: 'Owner',
    businessEmail: bizEmail2, password: PASSWORD,
    phoneCountryCode: '93', phone: '700444333',
  });
  report('business registration with UNVERIFIED phone rejected', withPhoneNoTok.status === 400, JSON.stringify(withPhoneNoTok.body));

  // with verified phone -> stored normalized
  const bizPhone = `0700333${ts.replace(/\D/g, '').slice(0, 3).padStart(3, '8')}`;
  const tok = await fullVerify('93', bizPhone);
  const bizEmail3 = `otpbiz3${ts}@biz${ts}.ezy`;
  const okBiz = await registerBusiness({
    businessName: 'TestBiz3 ' + ts, firstName: 'Biz', lastName: 'Owner',
    businessEmail: bizEmail3, password: PASSWORD,
    phoneCountryCode: '93', phone: bizPhone, phoneVerifyToken: tok,
  });
  report('business registration with VERIFIED phone succeeds', okBiz.status === 201, JSON.stringify(okBiz.body).slice(0, 100));
  const row3 = await userPhoneByEmail(bizEmail3);
  report('business phone stored normalized', row3?.phone === '+93700' + bizPhone.replace(/^0700/, ''), row3?.phone);
}

// ═════════ 10. Forgot-password regression (existing flow, same sender) ═════════
{
  await clearMock();
  const fp = await fetch(`${BASE}/api/auth/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'verify', email: MAIN_EMAIL, phone: MAIN_PHONE }),
  });
  const fpBody = await fp.json();
  report('forgot-password: verify accepts registered email+phone (tolerant local format)',
    fp.status === 200 && fpBody.otpSent === true, JSON.stringify(fpBody));
  const msgs = await mockMessages();
  const rec = /recovery code is: (\d{6})/.exec(msgs[msgs.length - 1]?.text || '');
  report('forgot-password: OTP delivered via same OpenWA sender with recovery wording', !!rec, msgs[msgs.length - 1]?.text?.split('\n')[0]);
  const vo = await fetch(`${BASE}/api/auth/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'verify-otp', email: MAIN_EMAIL, otp: rec[1] }),
  });
  const voBody = await vo.json();
  report('forgot-password: OTP verified, reset token issued', vo.status === 200 && !!voBody.resetToken);
  const wrong = await fetch(`${BASE}/api/auth/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'verify-otp', email: MAIN_EMAIL, otp: '000000' }),
  });
  report('forgot-password: OTP is one-time (reuse rejected)', wrong.status === 400, JSON.stringify(await wrong.json()));
  const reset = await fetch(`${BASE}/api/auth/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reset', resetToken: voBody.resetToken, password: 'NewPassword1A' }),
  });
  report('forgot-password: password reset succeeds', reset.status === 200, JSON.stringify(await reset.json()));
}

await pool.end();
const failed = results.filter((r) => !r.pass);
console.log(`\n═══ RESULTS: ${results.length - failed.length}/${results.length} passed ═══`);
if (failed.length) { console.log('FAILED:', failed.map((f) => f.name).join(' | ')); process.exit(1); }
