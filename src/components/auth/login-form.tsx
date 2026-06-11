'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2, Building2, User, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/use-app-store'

// ─── Left Illustration Panel ───────────────────────────────────────────────

function IllustrationPanel() {
  return (
    <div
      className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col items-center justify-center"
      style={{ background: 'linear-gradient(160deg, #5493EA 0%, #3C92B4 25%, #3A979F 50%, #37A175 75%, #40AA6B 100%)' }}
    >
      {/* Decorative blue curved wave shapes (top) */}
      <svg className="absolute top-[12%] left-[-5%] opacity-30" width="500" height="300" viewBox="0 0 500 300">
        <path d="M0 150 Q125 50 250 120 Q375 190 500 100 L500 300 L0 300 Z" fill="#6DB9FD" />
      </svg>
      <svg className="absolute top-[20%] left-[-5%] opacity-20" width="500" height="300" viewBox="0 0 500 300">
        <path d="M0 180 Q150 80 300 150 Q400 200 500 130 L500 300 L0 300 Z" fill="white" />
      </svg>

      {/* Mail envelope illustration (center) */}
      <div className="relative z-10 mb-10">
        <div className="relative">
          {/* Main envelope */}
          <div className="w-40 h-32 rounded-2xl bg-[#FBBC05] shadow-lg flex items-center justify-center">
            <div className="w-36 h-28 rounded-xl bg-[#FBDD99]/60 flex items-center justify-center">
              <Mail className="w-16 h-16 text-[#FBB96D]" strokeWidth={1.5} />
            </div>
          </div>
          {/* Envelope flap */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[70px] border-l-transparent border-r-[70px] border-r-transparent border-b-[40px] border-b-[#F5A623]" />
        </div>

        {/* Colored dots around envelope (top-left decoration) */}
        <div className="absolute -top-6 -left-8 flex gap-2">
          <div className="w-3 h-3 rounded-full bg-[#EA4335]" />
          <div className="w-2 h-2 rounded-full bg-[#34A853]" />
          <div className="w-4 h-4 rounded-full bg-[#4285F4]" />
        </div>

        {/* Small shapes */}
        <div className="absolute -bottom-4 -right-6 flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#BEFFFF]" />
          <div className="w-3 h-3 rounded-full bg-[#FFD8B0]" />
        </div>
      </div>

      {/* Welcome text */}
      <div className="relative z-10 text-center max-w-xs">
        <h2 className="text-3xl font-bold text-white mb-3 leading-tight">
          Welcome to EzyMail
        </h2>
        <p className="text-[15px] text-white/80 leading-relaxed">
          Fast, secure, and beautiful email experience
          <br />
          at your fingertips.
        </p>
      </div>

      {/* Bottom decorative dots */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3">
        <div className="w-2 h-2 rounded-full bg-white/40" />
        <div className="w-2 h-2 rounded-full bg-white/25" />
        <div className="w-2 h-2 rounded-full bg-white/50" />
      </div>
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
  const [rememberMe, setRememberMe] = useState(false)

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
          rememberMe,
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
    <div className="min-h-screen flex bg-[#F0F0F0]">

      {/* Left: Illustration */}
      <IllustrationPanel />

      {/* Right: Login form */}
      <div className="flex-1 lg:w-1/2 flex flex-col justify-center items-center px-6 py-10 bg-white">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-[420px]"
        >
          {/* Logo */}
          <div className="flex items-center gap-2 mb-6">
            <img src="/favicon-32.png" alt="EzyMail" className="w-9 h-9 rounded-lg" />
            <span className="text-xl font-bold text-[#1F1F1F]">
              <span className="text-[#4285F4]">Ezy</span>
              <span className="text-[#34A853]">Mail</span>
            </span>
          </div>

          {/* Personal / Business Tabs */}
          <div className="flex items-center bg-[#F1F3F4] rounded-full p-1 mb-8">
            <button
              type="button"
              onClick={() => setActiveTab('personal')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
                activeTab === 'personal'
                  ? 'bg-white text-[#1F1F1F] shadow-sm'
                  : 'text-[#5F6368] hover:text-[#1F1F1F]'
              }`}
            >
              <User className="w-4 h-4" />
              Personal
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('business')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
                activeTab === 'business'
                  ? 'bg-white text-[#1F1F1F] shadow-sm'
                  : 'text-[#5F6368] hover:text-[#1F1F1F]'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Business
            </button>
          </div>

          {/* Heading */}
          <h2 className="text-[22px] font-semibold text-[#1F1F1F] mb-1">
            Welcome back
          </h2>
          <p className="text-[14px] text-[#444746] mb-7">
            Sign in to your EzyMail account
          </p>

          {/* Form */}
          <form onSubmit={onSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[13px] font-medium text-[#1F1F1F] mb-1.5">
                {activeTab === 'business' ? 'Business email' : 'Email address'}
              </label>
              <input
                type="email"
                placeholder="you@ezy.af"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                autoFocus
                className="w-full h-11 px-4 rounded-lg border border-[#DADCE0] bg-[#F1F3F4] text-sm text-[#1F1F1F] placeholder:text-[#9AA0A6] focus:border-[#4285F4] focus:ring-[#4285F4]/20 focus:bg-white focus:outline-none transition-colors"
              />
              {activeTab === 'business' && (
                <p className="text-[12px] text-[#5F6368] mt-1.5">
                  Your business email format: info@businessname.ezy
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-[13px] font-medium text-[#1F1F1F] mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full h-11 px-4 pr-10 rounded-lg border border-[#DADCE0] bg-[#F1F3F4] text-sm text-[#1F1F1F] placeholder:text-[#9AA0A6] focus:border-[#4285F4] focus:ring-[#4285F4]/20 focus:bg-white focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9AA0A6] hover:text-[#5F6368] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember me & Forgot password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-[#DADCE0] text-[#4285F4] focus:ring-[#4285F4]/20"
                />
                <span className="text-[13px] text-[#444746]">Remember me</span>
              </label>
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
              className="w-full h-[48px] rounded-full bg-[#4285F4] hover:bg-[#3367D6] disabled:opacity-60 text-white font-medium text-[15px] flex items-center justify-center gap-2 transition-colors shadow-sm"
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
              <span className="px-3 bg-white text-[#9AA0A6]">OR</span>
            </div>
          </div>

          {/* Register link */}
          <div className="text-center space-y-2">
            <p className="text-[13px] text-[#444746]">
              Don&apos;t have an account?{' '}
              <button
                onClick={() => setAuthView('register')}
                className="text-[#4285F4] hover:text-[#1a73e8] font-medium transition-colors"
              >
                Create account
              </button>
            </p>
            <p className="text-[13px] text-[#444746]">
              <button
                onClick={() => setAuthView('register')}
                className="text-[#4285F4] hover:text-[#1a73e8] font-medium transition-colors"
              >
                Create a business account instead
              </button>
            </p>
          </div>

          {/* Copyright */}
          <p className="text-center text-[11px] text-[#9AA0A6] mt-8">
            &copy; 2025 EzyMail. All rights reserved.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
