'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2, Building2, User } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/use-app-store'

// ─── Left Illustration Panel ───────────────────────────────────────────────

function IllustrationPanel() {
  return (
    <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col" style={{ background: 'linear-gradient(135deg, #5493EA 0%, #3C92B4 25%, #3A979F 50%, #37A175 75%, #40AA6B 100%)' }}>

      {/* White dot cluster logo (top-left) */}
      <div className="absolute top-8 left-8">
        <div className="relative w-24 h-16">
          <div className="absolute top-0 left-0 w-16 h-16 rounded-full bg-white/30" />
          <div className="absolute top-2 left-6 w-12 h-12 rounded-full bg-white/50" />
          <div className="absolute top-4 left-3 w-10 h-10 rounded-full bg-white/70" />
          <div className="absolute top-6 left-8 w-8 h-8 rounded-full bg-white/90" />
          <div className="absolute bottom-0 left-10 w-6 h-6 rounded-full bg-white/40" />
          <div className="absolute top-1 left-14 w-5 h-5 rounded-full bg-white/60" />
        </div>
      </div>

      {/* Large organic white blob (center-left) */}
      <div className="absolute top-[38%] left-[18%]">
        <div className="w-56 h-40 rounded-[60%_40%_50%_50%/50%_60%_40%_50%] bg-white/15" />
      </div>

      {/* Abstract colorful illustration shapes */}
      <div className="absolute top-[28%] left-[42%] opacity-80">
        <svg width="120" height="160" viewBox="0 0 120 160" fill="none">
          <circle cx="60" cy="35" r="25" fill="#FBDD99" />
          <ellipse cx="60" cy="110" rx="35" ry="50" fill="#6DB9FD" />
        </svg>
      </div>

      <div className="absolute bottom-[30%] right-[15%] opacity-70">
        <svg width="100" height="80" viewBox="0 0 100 80" fill="none">
          <rect x="5" y="10" width="90" height="60" rx="8" fill="#FBBC05" />
          <path d="M5 18 L50 50 L95 18" stroke="#FBB96D" strokeWidth="4" fill="none" />
          <rect x="5" y="10" width="90" height="25" rx="8" fill="#FBDD99" opacity="0.5" />
        </svg>
      </div>

      {/* Small decorative circles */}
      <div className="absolute top-[18%] right-[30%] w-8 h-8 rounded-full bg-[#34A853]/40" />
      <div className="absolute bottom-[40%] left-[35%] w-6 h-6 rounded-full bg-[#EA4335]/30" />
      <div className="absolute top-[55%] right-[25%] w-10 h-10 rounded-full bg-[#FBBC05]/30" />
      <div className="absolute bottom-[20%] left-[50%] w-5 h-5 rounded-full bg-white/20" />

      {/* Decorative lines */}
      <div className="absolute top-[45%] left-[55%] w-20 h-1 bg-white/20 rounded-full rotate-[-15deg]" />
      <div className="absolute top-[60%] left-[30%] w-16 h-1 bg-white/15 rounded-full rotate-[10deg]" />

      {/* Bottom-left small shapes */}
      <div className="absolute bottom-16 left-12 flex gap-3">
        <div className="w-3 h-3 rounded-full bg-white/30" />
        <div className="w-3 h-3 rounded-full bg-white/20" />
        <div className="w-3 h-3 rounded-full bg-white/40" />
      </div>
    </div>
  )
}

// ─── Material Design Filled Input ──────────────────────────────────────────

function FilledInput({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  rightElement,
  disabled,
  autoFocus,
}: {
  label: string
  type?: string
  placeholder?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  rightElement?: React.ReactNode
  disabled?: boolean
  autoFocus?: boolean
}) {
  const [focused, setFocused] = useState(false)

  return (
    <div className="relative">
      <label className="block text-[13px] font-medium text-[#1F1F1F] mb-1.5">
        {label}
      </label>
      <div
        className={`relative rounded-t-lg rounded-b-lg transition-colors ${
          focused ? 'bg-[#E8F0FE]' : 'bg-[#F1F3F4]'
        }`}
      >
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          autoFocus={autoFocus}
          className="w-full h-11 px-4 bg-transparent text-sm text-[#1F1F1F] placeholder:text-[#9AA0A6] focus:outline-none"
        />
        {rightElement && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {rightElement}
          </div>
        )}
      </div>
      {/* Active indicator line */}
      <div
        className={`h-[2px] rounded-full transition-colors ${
          focused ? 'bg-[#4285F4]' : 'bg-transparent'
        }`}
      />
    </div>
  )
}

// ─── Main Login Form ──────────────────────────────────────────────────────

export function LoginForm() {
  const { setUser, setAuthView } = useAppStore()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'personal' | 'business'>('personal')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Please enter a valid email address')
      return
    }
    if (!password) {
      toast.error('Password is required')
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          rememberMe: false,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        toast.error(result.error || 'Invalid email or password')
        return
      }

      toast.success('Welcome back!')
      setUser(result.user)
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(180deg, #F3F7FD 0%, #F5FAF8 100%)' }}>

      {/* Top header bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#D9D9DB]">
        <div className="flex items-center gap-2">
          <img src="/favicon-32.png" alt="EzyMail" className="w-8 h-8 rounded-lg" />
          <span className="text-[15px] font-semibold text-[#1F1F1F]">
            <span className="text-[#4285F4]">Ezy</span>
            <span className="text-[#34A853]">Mail</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4285F4] to-[#34A853] flex items-center justify-center">
            <span className="text-white text-xs font-bold">?</span>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Illustration */}
        <IllustrationPanel />

        {/* Right: Form */}
        <div className="flex-1 lg:w-1/2 flex flex-col justify-center items-center px-6 py-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="w-full max-w-[460px]"
          >
            {/* Heading */}
            <h2 className="text-[22px] font-semibold text-[#1F1F1F] mb-1">
              {activeTab === 'business' ? 'Sign in to Business' : 'Welcome back'}
            </h2>
            <p className="text-[14px] text-[#444746] mb-8">
              {activeTab === 'business'
                ? 'Access your business email and dashboard'
                : 'Sign in to your EzyMail account'
              }
            </p>

            {/* Form */}
            <form onSubmit={onSubmit} className="space-y-5">
              {/* Email */}
              <FilledInput
                label="Email address"
                type="email"
                placeholder="you@ezy.af"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                autoFocus
              />

              {/* Password */}
              <FilledInput
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[#9AA0A6] hover:text-[#5F6368] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              {/* Forgot password */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setAuthView('forgot-password')}
                  className="text-[13px] text-[#4285F4] hover:text-[#1a73e8] font-medium transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              {/* Sign In button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-[48px] rounded-full bg-[#4285F4] hover:bg-[#3367D6] disabled:opacity-60 text-white font-medium text-[15px] flex items-center justify-center gap-2 transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#E5E7EB]" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 text-[#9AA0A6]" style={{ background: 'linear-gradient(180deg, #F3F7FD, #F5FAF8)' }}>or</span>
              </div>
            </div>

            {/* Register link */}
            <div className="text-center">
              <p className="text-[13px] text-[#444746]">
                Don&apos;t have an account?{' '}
                <button
                  onClick={() => setAuthView('register')}
                  className="text-[#4285F4] hover:text-[#1a73e8] font-medium transition-colors"
                >
                  Create account
                </button>
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bottom Tab Bar — Personal / Business */}
      <div className="bg-[#202020] border-t border-[#1A1A1A]">
        <div className="flex items-center justify-center py-3 px-4">
          <button
            type="button"
            onClick={() => setActiveTab('personal')}
            className={`flex items-center gap-2.5 px-6 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              activeTab === 'personal'
                ? 'bg-white text-[#1F1F1F] shadow-md'
                : 'text-[#9E9E9E] hover:text-white'
            }`}
          >
            <User className="w-4 h-4" />
            Personal
          </button>
          <div className="w-4" />
          <button
            type="button"
            onClick={() => setActiveTab('business')}
            className={`flex items-center gap-2.5 px-6 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              activeTab === 'business'
                ? 'bg-white text-[#1F1F1F] shadow-md'
                : 'text-[#9E9E9E] hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Business
          </button>
        </div>
      </div>
    </div>
  )
}
