'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, Eye, EyeOff, Loader2 } from 'lucide-react'
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

export function LoginForm() {
  const { setUser, setAuthView } = useAppStore()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

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
    <div className="min-h-screen flex items-center justify-center p-0 sm:p-4 bg-white dark:bg-gray-900 sm:bg-transparent">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full sm:max-w-md h-full sm:h-auto sm:min-h-0 min-h-screen sm:min-h-0 flex flex-col sm:flex-initial"
      >
        <div className="bg-white dark:bg-gray-900 sm:rounded-2xl sm:shadow-xl sm:shadow-black/5 p-6 sm:p-8 flex-1 flex flex-col justify-center sm:justify-start">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <img src="/favicon-32.png" alt="EzyMail" className="w-10 h-10 rounded-xl" />
            <h1 className="text-2xl font-bold">
              <span className="text-[#4285F4]">Ezy</span>
              <span className="text-[#34A853]">Mail</span>
            </h1>
          </div>

          {/* Heading */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-[#1F1F1F] dark:text-white">Welcome back</h2>
            <p className="text-sm text-[#444746] dark:text-gray-400 mt-1">
              Sign in to your EzyMail account
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
                  className="h-11 rounded-xl pl-3 pr-16 border-gray-200 dark:border-gray-700 focus:border-[#4285F4] focus:ring-[#4285F4]/20"
                  disabled={isLoading}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                  @ezy.af
                </span>
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
                  className="h-11 rounded-xl pl-3 pr-10 border-gray-200 dark:border-gray-700 focus:border-[#4285F4] focus:ring-[#4285F4]/20"
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
              <span className="px-3 bg-inherit dark:bg-inherit text-gray-400">OR</span>
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
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          © 2025 EzyMail. All rights reserved.
        </p>
      </motion.div>
    </div>
  )
}
