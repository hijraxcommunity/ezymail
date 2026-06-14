'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Building2,
  Mail,
  Phone,
  Users,
  Eye,
  EyeOff,
  Loader2,
  Check,
  X,
  Briefcase,
  User,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store/use-app-store'

const EMPLOYEE_OPTIONS = [
  { value: '1-10', label: '1–10 employees' },
  { value: '11-50', label: '11–50 employees' },
  { value: '51-200', label: '51–200 employees' },
  { value: '200+', label: '200+ employees' },
]

function getPasswordStrength(password: string) {
  if (!password) return { score: 0, label: '', color: '' }
  let score = 0
  if (password.length >= 8) score++
  if (/[a-z]/.test(password)) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++
  if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500' }
  if (score <= 3) return { score, label: 'Medium', color: 'bg-amber-500' }
  return { score, label: 'Strong', color: 'bg-emerald-500' }
}

const businessRegisterSchema = z
  .object({
    businessName: z.string().min(2, 'Business name must be at least 2 characters'),
    firstName: z.string().min(2, 'First name must be at least 2 characters'),
    lastName: z.string().min(2, 'Last name must be at least 2 characters'),
    businessEmailPrefix: z
      .string()
      .min(1, 'Email prefix is required')
      .regex(
        /^[a-zA-Z0-9._-]+$/,
        'Only letters, numbers, dots, underscores and hyphens'
      ),
    phone: z.string().optional(),
    employeeCount: z.string().optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[a-z]/, 'Must contain a lowercase letter')
      .regex(/[0-9]/, 'Must contain a number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type BusinessRegisterValues = z.infer<typeof businessRegisterSchema>

export function BusinessRegisterForm() {
  const { setUser, setAuthView } = useAppStore()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [emailStatus, setEmailStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken'
  >('idle')

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BusinessRegisterValues>({
    resolver: zodResolver(businessRegisterSchema),
    defaultValues: {
      businessName: '',
      firstName: '',
      lastName: '',
      businessEmailPrefix: '',
      phone: '',
      employeeCount: '',
      password: '',
      confirmPassword: '',
    },
  })

  const businessEmailPrefix = watch('businessEmailPrefix')
  const businessNameValue = watch('businessName')
  const passwordValue = watch('password')
  const passwordStrength = getPasswordStrength(passwordValue || '')

  // Build the email domain from business name (lowercase, no spaces)
  const emailDomain = businessNameValue?.trim()
    ? businessNameValue.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)
    : 'companyname'

  // Build the full business email
  const fullBusinessEmail = businessEmailPrefix?.trim()
    ? `${businessEmailPrefix.trim().toLowerCase()}@${emailDomain}.ezy`
    : ''

  // Debounced email availability check
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!fullBusinessEmail || !businessEmailPrefix?.trim()) {
      setEmailStatus('idle')
      return
    }

    setEmailStatus('checking')
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current)

    checkTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/business/check-email?email=${encodeURIComponent(fullBusinessEmail)}`
        )
        const data = await res.json()
        setEmailStatus(data.available ? 'available' : 'taken')
      } catch {
        setEmailStatus('idle')
      }
    }, 600)

    return () => {
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current)
    }
  }, [fullBusinessEmail, businessEmailPrefix])

  const onSubmit = async (data: BusinessRegisterValues) => {
    if (emailStatus === 'taken') {
      toast.error('This business email is already taken. Please choose another.')
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/business/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: data.businessName,
          firstName: data.firstName,
          lastName: data.lastName,
          businessEmail: fullBusinessEmail,
          phone: data.phone || undefined,
          employeeCount: data.employeeCount || undefined,
          password: data.password,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        toast.error(result.error || 'Registration failed')
        return
      }

      toast.success('Business account created successfully!')
      setUser(result.user)
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl shadow-black/5 p-6 sm:p-8 overflow-y-auto">
        {/* Personal / Business Tab Switcher */}
        <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-6">
          <button
            onClick={() => setAuthView('register')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-[#1F1F1F] dark:hover:text-white transition-all"
          >
            <User className="w-3.5 h-3.5" />
            Personal
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-[#1F1F1F] dark:text-white bg-[#34A853] text-white shadow-sm transition-all"
          >
            <Building2 className="w-3.5 h-3.5" />
            Business
          </button>
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#4285F4]/10 mb-3">
            <Building2 className="w-6 h-6 text-[#4285F4]" />
          </div>
          <h2 className="text-xl font-semibold text-[#1F1F1F] dark:text-white">
            Create your business account
          </h2>
          <p className="text-sm text-[#444746] dark:text-gray-400 mt-1">
            Get a professional email for your business
          </p>
        </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Business Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                <Briefcase className="w-3.5 h-3.5 inline mr-1" />
                Business Name <span className="text-red-400">*</span>
              </label>
              <Input
                {...register('businessName')}
                placeholder="Acme Inc."
                className="h-11 rounded-xl border-gray-200 dark:border-gray-700 focus:border-[#4285F4] focus:ring-[#4285F4]/20"
                disabled={isLoading}
                autoFocus
              />
              {errors.businessName && (
                <p className="text-xs text-[#EA4335]">{errors.businessName.message}</p>
              )}
            </div>

            {/* First Name & Last Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                  First Name <span className="text-red-400">*</span>
                </label>
                <Input
                  {...register('firstName')}
                  placeholder="John"
                  className="h-11 rounded-xl border-gray-200 dark:border-gray-700 focus:border-[#4285F4] focus:ring-[#4285F4]/20"
                  disabled={isLoading}
                />
                {errors.firstName && (
                  <p className="text-xs text-[#EA4335]">{errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                  Last Name <span className="text-red-400">*</span>
                </label>
                <Input
                  {...register('lastName')}
                  placeholder="Doe"
                  className="h-11 rounded-xl border-gray-200 dark:border-gray-700 focus:border-[#4285F4] focus:ring-[#4285F4]/20"
                  disabled={isLoading}
                />
                {errors.lastName && (
                  <p className="text-xs text-[#EA4335]">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            {/* Business Email */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                <Mail className="w-3.5 h-3.5 inline mr-1" />
                Business Email <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Input
                  {...register('businessEmailPrefix', {
                    onChange: (e) => {
                      // Strip invalid characters and update without cursor jump
                      const cleaned = e.target.value.replace(/[^a-zA-Z0-9._-]/g, '')
                      if (cleaned !== e.target.value) {
                        const input = e.target
                        const pos = input.selectionStart ? Math.min(input.selectionStart, cleaned.length) : cleaned.length
                        // Use native input value set to avoid cursor reset
                        requestAnimationFrame(() => {
                          const nativeInput = window.document.querySelector<HTMLInputElement>('[data-email-prefix]')
                          if (nativeInput) {
                            nativeInput.value = cleaned
                            nativeInput.setSelectionRange(pos, pos)
                          }
                        })
                        setValue('businessEmailPrefix', cleaned, { shouldValidate: true })
                      }
                      setEmailStatus('idle')
                    },
                  })}
                  data-email-prefix
                  placeholder="info"
                  className="h-11 rounded-xl border-gray-200 dark:border-gray-700 focus:border-[#4285F4] focus:ring-[#4285F4]/20 pr-[9.5rem]"
                  disabled={isLoading}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none font-medium select-none whitespace-nowrap">
                  @{emailDomain}.ezy
                </span>
              </div>
              {errors.businessEmailPrefix && (
                <p className="text-xs text-[#EA4335]">
                  {errors.businessEmailPrefix.message}
                </p>
              )}
              {/* Email availability indicator */}
              {fullBusinessEmail && businessEmailPrefix.trim().length > 0 && (
                <div className="flex items-center gap-1.5">
                  {emailStatus === 'checking' && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                  )}
                  {emailStatus === 'available' && (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-xs text-emerald-500 font-medium">
                        {fullBusinessEmail} is available
                      </span>
                    </>
                  )}
                  {emailStatus === 'taken' && (
                    <>
                      <X className="w-3.5 h-3.5 text-red-500" />
                      <span className="text-xs text-red-500 font-medium">
                        {fullBusinessEmail} is already taken
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Phone Number */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                <Phone className="w-3.5 h-3.5 inline mr-1" />
                Phone Number <span className="text-xs text-gray-400 font-normal">(optional)</span>
              </label>
              <Input
                {...register('phone')}
                type="tel"
                placeholder="+1 (555) 000-0000"
                className="h-11 rounded-xl border-gray-200 dark:border-gray-700 focus:border-[#4285F4] focus:ring-[#4285F4]/20"
                disabled={isLoading}
              />
            </div>

            {/* Number of Employees */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                <Users className="w-3.5 h-3.5 inline mr-1" />
                Number of Employees <span className="text-xs text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                {...register('employeeCount')}
                className="w-full h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm focus:border-[#4285F4] focus:ring-[#4285F4]/20 focus:outline-none transition-colors"
                disabled={isLoading}
              >
                <option value="">Select team size</option>
                {EMPLOYEE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                Password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  className="h-11 rounded-xl pl-3 pr-10 border-gray-200 dark:border-gray-700 focus:border-[#4285F4] focus:ring-[#4285F4]/20"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-[#EA4335]">{errors.password.message}</p>
              )}
              {passwordValue && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                          i <= passwordStrength.score
                            ? passwordStrength.color
                            : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      />
                    ))}
                  </div>
                  <p
                    className={`text-xs font-medium ${
                      passwordStrength.label === 'Weak'
                        ? 'text-red-500'
                        : passwordStrength.label === 'Medium'
                          ? 'text-amber-500'
                          : 'text-emerald-500'
                    }`}
                  >
                    {passwordStrength.label}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                Confirm Password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Input
                  {...register('confirmPassword')}
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  className="h-11 rounded-xl pl-3 pr-10 border-gray-200 dark:border-gray-700 focus:border-[#4285F4] focus:ring-[#4285F4]/20"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-xs text-[#EA4335]">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-xl bg-[#34A853] hover:bg-[#2d9249] text-white font-medium text-sm transition-all duration-200 mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating business account...
                </>
              ) : (
                'Create Business Account'
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white dark:bg-gray-900 text-gray-400">
                OR
              </span>
            </div>
          </div>

          {/* Back links */}
          <div className="text-center space-y-2">
            <button
              onClick={() => setAuthView('business-login')}
              className="text-sm text-[#444746] dark:text-gray-400 hover:text-[#34A853] transition-colors"
            >
              Already have a business account?{' '}
              <span className="font-medium text-[#34A853]">Sign in</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          © 2025 EzyMail. All rights reserved.
        </p>
    </motion.div>
  )
}
