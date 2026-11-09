/**
 * Scratch expiry test (run with PHONE_OTP_TTL_SECONDS temporarily = 10s).
 * send -> (no verify) -> wait 15s (TTL 10s) -> verify must be 400 "expired".
 * Also re-checks that a fresh OTP still verifies fine before the wait.
 */
const BASE = 'http://127.0.0.1:3005';
const ts = Date.now().toString(36).replace(/\D/g, '').padEnd(4, '7');
const cc = '93';
const phone = `0700499${ts.slice(0, 3).padStart(3, '9')}`;
const chatDigits = '93' + phone.replace(/^0/, '');
const H = { 'Content-Type': 'application/json' };

const send = await fetch(`${BASE}/api/auth/verify-phone`, {
  method: 'POST', headers: { ...H, 'x-forwarded-for': '10.88.1.1' },
  body: JSON.stringify({ action: 'send', countryCode: cc, phone }),
});
const sendBody = await send.json().catch(() => ({}));
console.log(`${send.status === 200 && sendBody.sent === true ? 'PASS' : 'FAIL'}  send OTP (ttl=10s mode) — ${send.status} ${JSON.stringify(sendBody).slice(0, 80)}`);

const msgs = await (await fetch('http://127.0.0.1:2785/__received')).json();
const mine = msgs.filter((m) => (m.chatId || '').startsWith(chatDigits));
const otp = /code is: (\d{6})/.exec(mine[mine.length - 1]?.text || '')?.[1];
console.log(`${otp ? 'PASS' : 'FAIL'}  OTP captured from gateway — ${otp ? 'code present' : 'MISSING'}`);

console.log('   ... waiting 15s for the 10s TTL to elapse ...');
await new Promise((r) => setTimeout(r, 15_000));

const expired = await fetch(`${BASE}/api/auth/verify-phone`, {
  method: 'POST', headers: { ...H, 'x-forwarded-for': '10.88.1.2' },
  body: JSON.stringify({ action: 'verify', countryCode: cc, phone, otp }),
});
const eBody = await expired.json().catch(() => ({}));
console.log(`${expired.status === 400 && /expired/i.test(eBody.error || '') ? 'PASS' : 'FAIL'}  OTP rejected after TTL — ${expired.status} ${JSON.stringify(eBody)}`);

// sanity: a brand-new number still verifies when inside the TTL
const phone2 = `0700500${ts.slice(0, 3).padStart(3, '8')}`;
await fetch(`${BASE}/api/auth/verify-phone`, {
  method: 'POST', headers: { ...H, 'x-forwarded-for': '10.88.1.3' },
  body: JSON.stringify({ action: 'send', countryCode: cc, phone: phone2 }),
});
const msgs2 = await (await fetch('http://127.0.0.1:2785/__received')).json();
const otp2 = /code is: (\d{6})/.exec(
  msgs2.filter((m) => (m.chatId || '').startsWith('93' + phone2.replace(/^0/, ''))).slice(-1)[0]?.text || ''
)?.[1];
const ok = await fetch(`${BASE}/api/auth/verify-phone`, {
  method: 'POST', headers: { ...H, 'x-forwarded-for': '10.88.1.4' },
  body: JSON.stringify({ action: 'verify', countryCode: cc, phone: phone2, otp: otp2 }),
});
const okBody = await ok.json().catch(() => ({}));
console.log(`${ok.status === 200 && okBody.verified === true ? 'PASS' : 'FAIL'}  fresh OTP still verifies inside TTL — ${ok.status}`);
