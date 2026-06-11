'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, Eye, EyeOff, Loader2, Building2, User } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useAppStore } from '@/store/use-app-store'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormValues = z.infer<typeof loginSchema>

// ─── Illustration Side ────────────────────────────────────────────────────

function IllustrationSide() {
  return (
    <div className="hidden lg:flex lg:w-[55%] bg-gradient-to-br from-[#4285F4] via-[#3367D6] to-[#1a4fb3] relative overflow-hidden flex-col items-center justify-center p-12">
      {/* Decorative circles */}
      <div className="absolute top-[-80px] left-[-80px] w-[300px] h-[300px] rounded-full bg-white/5" />
      <div className="absolute bottom-[-60px] right-[-60px] w-[250px] h-[250px] rounded-full bg-white/5" />
      <div className="absolute top-[40%] left-[10%] w-[120px] h-[120px] rounded-full bg-white/[0.03]" />
      <div className="absolute bottom-[20%] left-[50%] w-[80px] h-[80px] rounded-full bg-white/[0.04]" />

      {/* Floating mail elements */}
      <div className="absolute top-[15%] right-[20%] opacity-20">
        <svg className="w-16 h-16 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      </div>
      <div className="absolute bottom-[25%] left-[15%] opacity-15 rotate-[-15deg]">
        <svg className="w-12 h-12 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      </div>
      <div className="absolute top-[55%] right-[12%] opacity-10 rotate-[20deg]">
        <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center max-w-md">
        {/* Large email illustration */}
        <div className="mx-auto mb-10 w-48 h-48 rounded-3xl bg-white/10 backdrop-blur-sm flex items-center justify-center shadow-2xl">
          <svg className="w-24 h-24 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>

        <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
          Email made{' '}
          <span className="relative inline-block">
            <span className="relative z-10">Ezy</span>
            <motion.span
              className="absolute bottom-0 left-0 w-full h-3 bg-[#34A853]/40 rounded-full -z-0"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            />
          </span>
        </h2>
        <p className="text-blue-100 text-lg leading-relaxed">
          Secure, fast, and beautifully simple email for everyone. Manage your personal and business communications in one place.
        </p>

        {/* Stats row */}
        <div className="mt-10 flex items-center justify-center gap-8">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">99.9%</p>
            <p className="text-xs text-blue-200 mt-1">Uptime</p>
          </div>
          <div className="w-px h-10 bg-white/20" />
          <div className="text-center">
            <p className="text-2xl font-bold text-white">256-bit</p>
            <p className="text-xs text-blue-200 mt-1">Encryption</p>
          </div>
          <div className="w-px h-10 bg-white/20" />
          <div className="text-center">
            <p className="text-2xl font-bold text-white">&lt;2s</p>
            <p className="text-xs text-blue-200 mt-1">Delivery</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Login Form Component ──────────────────────────────────────────────────

export function LoginForm() {
  const { setUser, setAuthView } = useAppStore()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [activeTab, setActiveTab] = useState<'personal' | 'business'>('personal')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
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
    <div className="min-h-screen flex bg-white dark:bg-gray-950">
      {/* Left: Illustration */}
      <IllustrationSide />

      {/* Right: Login form */}
      <div className="flex-1 lg:w-[45%] flex flex-col justify-center items-center p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-[420px]"
        >
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <img src="/favicon-32.png" alt="EzyMail" className="w-10 h-10 rounded-xl" />
            <h1 className="text-2xl font-bold">
              <span className="text-[#4285F4]">Ezy</span>
              <span className="text-[#34A853]">Mail</span>
            </h1>
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-[#1F1F1F] dark:text-white">
              {activeTab === 'business' ? 'Sign in to Business' : 'Welcome back'}
            </h2>
            <p className="text-sm text-[#444746] dark:text-gray-400 mt-1">
              {activeTab === 'business'
                ? 'Access your business email and dashboard'
                : 'Sign in to your EzyMail account'
              }
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                Email address
              </label>
              <div className="relative">
                <Input
                  {...register('email')}
                  type="email"
                  placeholder="you@ezy.af"
                  className="h-11 rounded-xl pl-3 pr-4 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:border-[#4285F4] focus:ring-[#4285F4]/20 focus:bg-white dark:focus:bg-gray-800 transition-colors"
                  disabled={isLoading}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-[#EA4335]">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                Password
              </label>
              <div className="relative">
                <Input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  className="h-11 rounded-xl pl-3 pr-10 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:border-[#4285F4] focus:ring-[#4285F4]/20 focus:bg-white dark:focus:bg-gray-800 transition-colors"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-[#EA4335]">{errors.password.message}</p>
              )}
            </div>

            {/* Remember me & Forgot password */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                  className="data-[state=checked]:bg-[#4285F4] data-[state=checked]:border-[#4285F4]"
                />
                <label
                  htmlFor="remember"
                  className="text-sm text-[#444746] dark:text-gray-400 cursor-pointer"
                >
                  Remember me
                </label>
              </div>
              <button
                type="button"
                onClick={() => setAuthView('forgot-password')}
                className="text-sm text-[#4285F4] hover:text-[#1a73e8] font-medium transition-colors"
              >
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium text-sm transition-all duration-200"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white dark:bg-gray-950 text-gray-400">OR</span>
            </div>
          </div>

          {/* Register link */}
          <div className="text-center">
            <p className="text-sm text-[#444746] dark:text-gray-400">
              Don&apos;t have an account?{' '}
              <button
                onClick={() => setAuthView('register')}
                className="text-[#4285F4] hover:text-[#1a73e8] font-medium transition-colors"
              >
                Create account
              </button>
            </p>
          </div>

          {/* Personal / Business Tabs */}
          <div className="mt-10 flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setActiveTab('personal')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === 'personal'
                  ? 'bg-white dark:bg-gray-700 text-[#1F1F1F] dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <User className="w-4 h-4" />
              Personal
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('business')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === 'business'
                  ? 'bg-white dark:bg-gray-700 text-[#1F1F1F] dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Business
            </button>
          </div>
        </motion.div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-8">
          &copy; 2025 EzyMail. All rights reserved.
        </p>
      </div>
    </div>
  )
}
