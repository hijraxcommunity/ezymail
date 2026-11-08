'use client'

/**
 * WhatsApp number + OTP verification section shared by the Personal and
 * Business registration forms.
 *
 * Input phase:  country picker + number field + "Verify" button (exactly the
 *               spot marked in the design reference — beside the input).
 * OTP phase:    the number field is replaced by six individual OTP boxes
 *               (auto-focus, backspace navigation, paste, digits only).
 *               The code is verified automatically once the sixth digit is
 *               entered. Resend has a 60-second countdown and the number can
 *               be changed at any time.
 * Verified:     subtle green "Verified" status; the server-issued proof token
 *               is handed to the parent via onVerified() — the parent sends
 *               it with the registration request. Frontend state alone is
 *               never enough to register.
 *
 * Styling matches the existing EzyMail auth forms (rounded-xl, h-11, gray
 * borders, blue #4285F4 for Personal / green #34A853 for Business accents).
 */
import { useEffect, useRef, useState } from 'react'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { Check, Loader2, MessageCircle, Pencil } from 'lucide-react'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'
import { CountryCodePicker } from './country-code-picker'

type Accent = 'blue' | 'green'

interface WhatsAppOtpVerifyProps {
  /** Dial code digits, e.g. "93" */
  phoneCode: string
  onPhoneCodeChange: (dial: string) => void
  /** National number digits */
  phoneNumber: string
  onPhoneNumberChange: (digits: string) => void
  /** 'blue' = personal flow, 'green' = business flow */
  accent: Accent
  /** Server-issued proof token once the number is verified (null = not verified) */
  verifiedToken: string | null
  /** Called with the proof token after the OTP check succeeds */
  onVerified: (token: string) => void
  /** Called when the user chooses to change the number (parent clears the token) */
  onCleared: () => void
  disabled?: boolean
}

const ACCENT = {
  blue: {
    button: 'bg-[#4285F4] hover:bg-[#1a73e8] shadow-sm',
    ring: 'focus:border-[#4285F4] focus:ring-[#4285F4]/20',
    text: 'text-[#4285F4] hover:text-[#1a73e8]',
  },
  green: {
    button: 'bg-[#34A853] hover:bg-[#2d9249] shadow-sm',
    ring: 'focus:border-[#34A853] focus:ring-[#34A853]/20',
    text: 'text-[#34A853] hover:text-[#2d9249]',
  },
} as const

export function WhatsAppOtpVerify({
  phoneCode,
  onPhoneCodeChange,
  phoneNumber,
  onPhoneNumberChange,
  accent,
  verifiedToken,
  onVerified,
  onCleared,
  disabled = false,
}: WhatsAppOtpVerifyProps) {
  const [phase, setPhase] = useState<'input' | 'otp'>('input')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [maskedPhone, setMaskedPhone] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const colors = ACCENT[accent]

  const digits = phoneNumber.replace(/\D/g, '')
  const isVerified = Boolean(verifiedToken)

  // 60-second resend countdown
  useEffect(() => {
    if (cooldown <= 0) {
      if (cooldownTimer.current) {
        clearInterval(cooldownTimer.current)
        cooldownTimer.current = null
      }
      return
    }
    cooldownTimer.current = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1))
    }, 1000)
    return () => {
      if (cooldownTimer.current) {
        clearInterval(cooldownTimer.current)
        cooldownTimer.current = null
      }
    }
  }, [cooldown > 0])

  const requestOtp = async () => {
    if (digits.length < 6 || sending || disabled) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', countryCode: phoneCode, phone: digits }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Unable to send the verification code. Please try again.')
        return
      }
      setMaskedPhone(data.maskedPhone || '')
      setCooldown(typeof data.resendAfter === 'number' ? data.resendAfter : 60)
      setOtp('')
      setPhase('otp')
    } catch {
      setError('Unable to reach the server. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const verifyCode = async (code: string) => {
    if (code.length !== 6 || verifying || disabled) return
    setVerifying(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', countryCode: phoneCode, phone: digits, otp: code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setOtp('')
        setError(
          data.attemptsLeft != null
            ? `${data.error} ${data.attemptsLeft} attempt${data.attemptsLeft === 1 ? '' : 's'} left.`
            : data.error || 'Verification failed. Please try again.'
        )
        return
      }
      onVerified(data.token)
    } catch {
      setOtp('')
      setError('Unable to reach the server. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  const backToInput = () => {
    setPhase('input')
    setOtp('')
    setError('')
    onCleared()
  }

  // ── Verified: subtle green status + change number ──
  if (isVerified) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <CountryCodePicker value={phoneCode} onChange={onPhoneCodeChange} disabled />
          <div className="h-11 flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 flex items-center text-sm text-gray-500 dark:text-gray-400 select-none">
            {digits || '—'}
          </div>
          <button
            type="button"
            onClick={backToInput}
            disabled={disabled}
            className={`h-11 shrink-0 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium transition-colors disabled:opacity-60 ${colors.text} bg-white dark:bg-gray-900 hover:border-current/40 flex items-center gap-1.5`}
          >
            <Pencil className="w-3.5 h-3.5" />
            Change
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <Check className="w-3 h-3 text-emerald-500" />
          </span>
          <span className="text-xs text-emerald-500 font-medium">
            Verified — we can send password reset codes to this number
          </span>
        </div>
      </div>
    )
  }

  // ── OTP phase: six boxes replace the number input ──
  if (phase === 'otp') {
    return (
      <div className="space-y-2">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 px-3 py-4">
          <p className="text-xs text-[#444746] dark:text-gray-400 text-center flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" />
            <span>
              Code sent to <span className="font-medium text-[#1F1F1F] dark:text-gray-200">{maskedPhone || `+${phoneCode} ${digits}`}</span> on WhatsApp
            </span>
          </p>
          <InputOTP
            maxLength={6}
            pattern={REGEXP_ONLY_DIGITS}
            value={otp}
            onChange={(value) => { setOtp(value.replace(/\D/g, '')); if (error) setError('') }}
            onComplete={(value) => verifyCode(value.replace(/\D/g, ''))}
            disabled={verifying || disabled}
            autoFocus
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          {verifying && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Verifying code...
            </p>
          )}
          <p className="text-[11px] text-gray-400 text-center">
            The code expires in 5 minutes. Enter all six digits to verify automatically.
          </p>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={requestOtp}
            disabled={cooldown > 0 || sending || disabled}
            className={`font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${colors.text}`}
          >
            {sending ? (
              <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending...</span>
            ) : cooldown > 0 ? (
              <span className="text-gray-400">Resend code in {cooldown}s</span>
            ) : (
              'Resend code'
            )}
          </button>
          <button
            type="button"
            onClick={backToInput}
            disabled={disabled}
            className="text-gray-500 dark:text-gray-400 hover:text-[#1F1F1F] dark:hover:text-white font-medium transition-colors disabled:opacity-60"
          >
            Change number
          </button>
        </div>
      </div>
    )
  }

  // ── Input phase: number field + Verify button beside it ──
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <CountryCodePicker value={phoneCode} onChange={onPhoneCodeChange} disabled={sending || disabled} />
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => onPhoneNumberChange(e.target.value.replace(/\D/g, '').slice(0, 14))}
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="7XX XXX XXX"
          disabled={sending || disabled}
          className={`h-11 min-w-0 flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-[#1F1F1F] dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-current transition-colors disabled:opacity-60 ${colors.ring}`}
        />
        <button
          type="button"
          onClick={requestOtp}
          disabled={digits.length < 6 || sending || disabled}
          className={`h-11 shrink-0 px-4 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed ${colors.button}`}
        >
          {sending ? (
            <span className="flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" />Sending</span>
          ) : (
            'Verify'
          )}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
