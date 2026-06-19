'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2, Building2, Mail, Lock } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store/use-app-store'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function BusinessLoginForm() {
  const { setUser, setAuthView } = useAppStore()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

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
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        toast.error(result.error || 'Invalid email or password')
        return
      }

      // Verify this is actually a business account
      if (result.user?.accountType !== 'business') {
        toast.error('This is a personal account. Please sign in on the Personal tab.')
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

  const motionProps = {
      initial: { opacity: 0, y: 20, scale: 0.95 },
      animate: { opacity: 1, y: 0, scale: 1 },
      transition: { duration: 0.5, ease: 'easeOut' },
    }
  return (
    <motion.div {...motionProps}
    >
      <div className="p-6 sm:p-8 flex flex-col">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#34A853]/10 mb-3">
            <Building2 className="w-6 h-6 text-[#34A853]" />
          </div>
          <h2 className="text-xl font-semibold text-[#1F1F1F] dark:text-white">
            Business Sign In
          </h2>
          <p className="text-sm text-[#444746] dark:text-gray-400 mt-1">
            Sign in to your business account
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Email */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
              Business Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                {...register('email')}
                type="email"
                placeholder="info@companyname.ezy"
                className="h-11 rounded-xl pl-10 border-gray-200 dark:border-gray-700 focus:border-[#34A853] focus:ring-[#34A853]/20"
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
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                className="h-11 rounded-xl pl-10 pr-10 border-gray-200 dark:border-gray-700 focus:border-[#34A853] focus:ring-[#34A853]/20"
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

          {/* Forgot password */}
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setAuthView('forgot-password')}
              className="text-sm text-[#34A853] hover:text-[#2d9249] font-medium transition-colors"
            >
              Forgot password?
            </button>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 rounded-xl bg-[#34A853] hover:bg-[#2d9249] text-white font-medium text-sm transition-all duration-200"
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
            <span className="px-3 bg-white dark:bg-gray-900 text-gray-400">OR</span>
          </div>
        </div>

        {/* Links */}
        <div className="text-center space-y-2">
          <p className="text-sm text-[#444746] dark:text-gray-400">
            Don't have a business account?{' '}
            <button
              onClick={() => setAuthView('business-register')}
              className="text-[#34A853] hover:text-[#2d9249] font-medium transition-colors"
            >
              Create one
            </button>
          </p>
          <p className="text-sm text-[#444746] dark:text-gray-400">
            <button
              onClick={() => setAuthView('login')}
              className="text-[#4285F4] hover:text-[#1a73e8] font-medium transition-colors"
            >
              Back to Personal Sign In
            </button>
          </p>

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 mt-2">
            © 2025 EzyMail. All rights reserved.
          </p>
        </div>
    </motion.div>
  )
}
