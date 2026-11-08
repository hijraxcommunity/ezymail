import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { db } from '@/lib/db';
import { sendWhatsAppOTP, OpenWAError } from '@/lib/whatsapp/openwa';
import {
  normalizePhoneE164,
  phoneCandidateSet,
  storePhoneOtp,
  clearPhoneOtp,
  checkPhoneOtp,
  phoneOtpAttemptsLeft,
  phoneResendWaitSeconds,
  checkPhoneSendRate,
  checkVerifyIpRate,
  markPhoneOtpSent,
  signPhoneVerificationToken,
  PHONE_OTP_TTL_SECONDS,
  PHONE_OTP_RESEND_COOLDOWN_SECONDS,
  PHONE_VERIFY_TOKEN_TTL_SECONDS,
} from '@/lib/phone-verification';

/**
 * POST /api/auth/verify-phone — WhatsApp OTP verification for REGISTRATION.
 *
 *   action=send    normalize -> rate limits -> uniqueness pre-check ->
 *                  generate + hash-store OTP -> deliver via the existing
 *                  OpenWA sender (message says 5 minutes).
 *   action=verify  check the 6 digits (5 attempts, one-time, 5-minute TTL)
 *                  -> issue a signed, number-bound proof token that the
 *                  register APIs later re-verify and consume.
 *
 * The OTP and the API key are never logged or returned. Failure reasons from
 * OpenWA are coarse classes only.
 */

const OTP_SEND_FAILURE = 'Unable to send the verification code. Please try again later.';

function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length <= 4) return `+${digits}`;
  return `+${digits.slice(0, 2)} ••••${digits.slice(-4)}`;
}

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body?.action;

    const countryCode = typeof body.countryCode === 'string' ? body.countryCode : '';
    const national = typeof body.phone === 'string' ? body.phone : '';
    const e164 = normalizePhoneE164(countryCode, national);

    if (!e164) {
      return NextResponse.json(
        { error: 'Please enter a valid WhatsApp number with its country code.' },
        { status: 400 }
      );
    }

    // ── Send a fresh OTP to the number ──
    if (action === 'send') {
      const ip = clientIp(request);
      if (!checkVerifyIpRate(ip)) {
        return NextResponse.json(
          { error: 'Too many verification requests. Please try again in a few minutes.' },
          { status: 429 }
        );
      }

      const resendWait = phoneResendWaitSeconds(e164);
      if (resendWait > 0) {
        return NextResponse.json(
          { error: `Please wait ${resendWait}s before requesting a new code.`, retryAfter: resendWait },
          { status: 429 }
        );
      }

      if (!checkPhoneSendRate(e164)) {
        return NextResponse.json(
          { error: 'Too many codes requested for this number. Please try again in a few minutes.' },
          { status: 429 }
        );
      }

      // Uniqueness pre-check: refuse numbers an existing account already
      // holds (legacy rows may be stored in non-E.164 shapes, hence the
      // candidate set). The hard guarantee remains the DB unique constraint.
      const taken = await db.user.findFirst({
        where: { phone: { in: phoneCandidateSet(countryCode, national) } },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json(
          { error: 'This WhatsApp number is already registered to an EzyMail account.' },
          { status: 409 }
        );
      }

      // Cryptographically secure 6-digit code, stored as a salted hash only.
      const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
      storePhoneOtp(e164, otp);

      try {
        await sendWhatsAppOTP(e164, otp, { purpose: 'registration', expiryMinutes: 5 });
      } catch (error: unknown) {
        // Nothing verifiable exists for this number until a code is delivered.
        clearPhoneOtp(e164);
        console.error(
          'WhatsApp OTP delivery failed (registration):',
          error instanceof Error ? error.message : 'unknown error'
        );
        const reason = error instanceof OpenWAError ? error.reason : 'SEND_REJECTED';
        return NextResponse.json({ error: OTP_SEND_FAILURE, reason }, { status: 503 });
      }

      markPhoneOtpSent(e164);

      return NextResponse.json({
        sent: true,
        maskedPhone: maskPhone(e164),
        expiresIn: PHONE_OTP_TTL_SECONDS,
        resendAfter: PHONE_OTP_RESEND_COOLDOWN_SECONDS,
      });
    }

    // ── Verify the 6 digits and issue the registration proof token ──
    if (action === 'verify') {
      const otp = typeof body.otp === 'string' ? body.otp.replace(/\D/g, '') : '';
      if (otp.length !== 6) {
        return NextResponse.json(
          { error: 'Enter the 6-digit code from your WhatsApp message.' },
          { status: 400 }
        );
      }

      const result = checkPhoneOtp(e164, otp);
      if (result === 'invalid') {
        return NextResponse.json(
          {
            error: 'Incorrect code. Please try again.',
            attemptsLeft: phoneOtpAttemptsLeft(e164),
          },
          { status: 400 }
        );
      }
      if (result === 'locked') {
        return NextResponse.json(
          { error: 'Too many incorrect attempts. Please request a new code.' },
          { status: 429 }
        );
      }
      if (result === 'expired' || result === 'missing') {
        return NextResponse.json(
          { error: 'This code has expired. Please request a new one.' },
          { status: 400 }
        );
      }

      const token = await signPhoneVerificationToken(e164);

      return NextResponse.json({
        verified: true,
        phone: e164,
        token,
        expiresIn: PHONE_VERIFY_TOKEN_TTL_SECONDS,
      });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Phone verification error:', message);
    return NextResponse.json({ error: 'Failed to process your request' }, { status: 500 });
  }
}
