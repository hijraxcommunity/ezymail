'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'
import { Loader2, KeyRound, Mail, Phone, Eye, EyeOff, CheckCircle2, ShieldCheck, MessageCircle } from 'lucide-react'
import { useAppStore } from '@/store/use-app-store'

type Step = 'identify' | 'otp' | 'reset' | 'done'

export function ForgotPasswordForm() {
  const { setAuthView } = useAppStore()
  const [step, setStep] = useState<Step>('identify')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [maskedPhone, setMaskedPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('Please enter your email address')
      return
    }
    if (phone.replace(/\D/g, '').length < 6) {
      toast.error('Please enter your registered WhatsApp number')
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', email, phone }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'We could not verify your details.')
        return
      }
      setMaskedPhone(data.maskedPhone || '')
      setOtp('')
      setStep('otp')
      toast.success('Verification code sent to your WhatsApp')
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.replace(/\D/g, '').length !== 6) {
      toast.error('Enter the 6-digit code from your WhatsApp message')
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-otp', email, otp }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'We could not verify the code.')
        return
      }
      setResetToken(data.resetToken)
      setStep('reset')
      toast.success('Code verified — set a new password')
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendOtp = async () => {
    if (isLoading) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', email, phone }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Could not send a new code.')
        return
      }
      setMaskedPhone(data.maskedPhone || '')
      setOtp('')
      toast.success('A new code was sent to your WhatsApp')
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      toast.error('Password must be 8+ characters with uppercase, lowercase and a number')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', resetToken, password: newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Could not update the password.')
        return
      }
      setStep('done')
      toast.success('Password updated! Sign in with your new password.')
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className="p-6 sm:p-8 flex flex-col">
        <div className="w-16 h-16 rounded-2xl bg-[#D3E3FD] flex items-center justify-center mx-auto mb-6">
          <KeyRound className="w-8 h-8 text-[#4285F4]" />
        </div>

        {step === 'identify' && (
          <>
            <h2 className="text-xl font-semibold text-[#1F1F1F] dark:text-white text-center mb-2">
              Reset your password
            </h2>
            <p className="text-sm text-[#444746] dark:text-gray-400 text-center mb-6">
              Verify your account with the WhatsApp number you registered
            </p>
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@ezy.af"
                    className="h-11 rounded-xl pl-10 pr-3 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:border-[#4285F4] focus:ring-[#4285F4]/20 focus:outline-none"
                    disabled={isLoading}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                  WhatsApp number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    placeholder="+93 7XX XXX XXX"
                    className="h-11 rounded-xl pl-10 pr-3 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:border-[#4285F4] focus:ring-[#4285F4]/20 focus:outline-none"
                    disabled={isLoading}
                  />
                </div>
                <p className="text-xs text-gray-400">
                  The number you registered when creating your account (with or without country code)
                </p>
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium text-sm transition-all duration-200"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    Verify Number
                  </>
                )}
              </Button>
            </form>
          </>
        )}

        {step === 'otp' && (
          <>
            <h2 className="text-xl font-semibold text-[#1F1F1F] dark:text-white text-center mb-2">
              Enter verification code
            </h2>
            <p className="text-sm text-[#444746] dark:text-gray-400 text-center mb-6">
              We sent a 6-digit code to your WhatsApp number
              {maskedPhone ? <span className="font-medium text-[#1F1F1F] dark:text-gray-200"> {maskedPhone}</span> : ''}.
              Enter it below to continue.
            </p>
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={otp}
                  onChange={(value) => setOtp(value.replace(/\D/g, ''))}
                  disabled={isLoading}
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
              </div>
              <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5" />
                The code expires in 10 minutes
              </p>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium text-sm transition-all duration-200"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    Verify Code
                  </>
                )}
              </Button>
            </form>
            <div className="text-center mt-3">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={isLoading}
                className="text-sm text-[#4285F4] hover:text-[#1a73e8] font-medium transition-colors disabled:opacity-50"
              >
                Didn&apos;t receive it? Send a new code
              </button>
            </div>
          </>
        )}

        {step === 'reset' && (
          <>
            <h2 className="text-xl font-semibold text-[#1F1F1F] dark:text-white text-center mb-2">
              Create a new password
            </h2>
            <p className="text-sm text-[#444746] dark:text-gray-400 text-center mb-6">
              Number verified. Choose a strong new password for {email}.
            </p>
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                  New password
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="8+ chars, uppercase, lowercase, number"
                    className="h-11 rounded-xl pl-3 pr-10 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:border-[#4285F4] focus:ring-[#4285F4]/20 focus:outline-none"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                  Confirm new password
                </label>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your new password"
                  className="h-11 rounded-xl pl-3 pr-3 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:border-[#4285F4] focus:ring-[#4285F4]/20 focus:outline-none"
                  disabled={isLoading}
                />
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium text-sm transition-all duration-200"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Password'
                )}
              </Button>
            </form>
          </>
        )}

        {step === 'done' && (
          <>
            <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-semibold text-[#1F1F1F] dark:text-white text-center mb-2">
              Password updated
            </h2>
            <p className="text-sm text-[#444746] dark:text-gray-400 text-center mb-6">
              Your password has been changed. Sign in with the new one — other devices were signed out for safety.
            </p>
            <Button
              onClick={() => setAuthView('login')}
              className="w-full h-11 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium text-sm transition-all duration-200"
            >
              Back to Sign In
            </Button>
          </>
        )}

        {step !== 'done' && (
          <div className="text-center mt-6">
            <button
              onClick={() => setAuthView('login')}
              className="text-sm text-[#4285F4] hover:text-[#1a73e8] font-medium transition-colors"
            >
              Back to sign in
            </button>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-2">
          © 2025 EzyMail. All rights reserved.
        </p>
      </div>
    </motion.div>
  )
}
