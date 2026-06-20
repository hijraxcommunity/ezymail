'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  ArrowLeft,
  ArrowRight,
  Lock,
  Shield,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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

const passwordSchema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type PasswordValues = z.infer<typeof passwordSchema>

const STEPS = [
  { id: 1, label: 'Business', icon: Briefcase },
  { id: 2, label: 'Email', icon: Mail },
  { id: 3, label: 'Password', icon: Lock },
  { id: 4, label: 'Review', icon: Shield },
]

export function BusinessRegisterForm() {
  const { setUser, setAuthView } = useAppStore()
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)

  // Step 1: Business info
  const [businessName, setBusinessName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // Step 2: Email
  const [emailPrefix, setEmailPrefix] = useState('')
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [phone, setPhone] = useState('')
  const [employeeCount, setEmployeeCount] = useState('')

  // Step 3: Password
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  // Password form (must be called before .watch())
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })
  const passwordValue = passwordForm.watch('password')
  const passwordStrength = getPasswordStrength(passwordValue || '')

  // Build the email domain from business name
  const emailDomain = businessName?.trim()
    ? businessName.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)
    : 'companyname'

  const fullBusinessEmail = emailPrefix?.trim()
    ? `${emailPrefix.trim().toLowerCase()}@${emailDomain}.ezy`
    : ''

  // Debounced email availability check
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isValidPrefix = /^[a-zA-Z0-9._-]+$/.test(emailPrefix.trim()) && emailPrefix.trim().length > 0

  useEffect(() => {
    if (!fullBusinessEmail || !isValidPrefix) {
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
    return () => { if (checkTimerRef.current) clearTimeout(checkTimerRef.current) }
  }, [fullBusinessEmail, isValidPrefix])

  // Step navigation
  const handleStep1Next = () => {
    if (businessName.trim().length < 2) {
      toast.error('Please enter a business name (min 2 characters)')
      return
    }
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      toast.error('Please enter your first and last name (min 2 chars each)')
      return
    }
    setStep(2)
  }

  const handleStep2Next = () => {
    if (!fullBusinessEmail || !isValidPrefix) {
      toast.error('Please enter a valid email prefix')
      return
    }
    if (emailStatus === 'taken') {
      toast.error('This business email is already taken. Please pick another.')
      return
    }
    setStep(3)
  }

  const handleStep3Next = () => {
    passwordForm.trigger().then(valid => {
      if (valid) setStep(4)
    })
  }

  const handleRegister = async () => {
    if (!agreedToTerms) {
      toast.error('You must agree to the terms and conditions')
      return
    }
    if (emailStatus === 'taken') {
      toast.error('This business email is already taken.')
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch('/api/business/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName,
          firstName,
          lastName,
          businessEmail: fullBusinessEmail,
          phone: phone || undefined,
          employeeCount: employeeCount || undefined,
          password: passwordForm.getValues('password'),
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
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className="p-6 sm:p-8 flex flex-col overflow-y-auto">
        {/* Personal / Business Tab Switcher (desktop only) */}
        <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-6">
          <button
            onClick={() => setAuthView('register')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-[#1F1F1F] dark:hover:text-white transition-all"
          >
            <User className="w-3.5 h-3.5" />
            Personal
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-white bg-[#34A853] shadow-sm transition-all"
          >
            <Building2 className="w-3.5 h-3.5" />
            Business
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8 px-2 sm:px-4">
          {STEPS.map((s, i) => {
            const StepIcon = s.icon
            const isActive = step === s.id
            const isCompleted = step > s.id
            return (
              <div key={s.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                      isCompleted
                        ? 'bg-[#34A853] text-white'
                        : isActive
                        ? 'bg-[#34A853] text-white shadow-lg shadow-[#34A853]/30'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                    }`}
                  >
                    {isCompleted ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : <StepIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  </div>
                  <span className={`text-[10px] sm:text-xs mt-1 font-medium ${
                    isActive ? 'text-[#34A853]' : isCompleted ? 'text-[#34A853]' : 'text-gray-400'
                  }`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-6 sm:w-12 h-0.5 mx-1 sm:mx-2 transition-all duration-300 ${
                    step > s.id ? 'bg-[#34A853]' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          {/* STEP 1: Business Info */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <h2 className="text-lg font-semibold text-[#1F1F1F] dark:text-white mb-1">
                About your business
              </h2>
              <p className="text-sm text-[#444746] dark:text-gray-400 mb-5">
                Tell us your business name and your details
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                    Business Name
                  </label>
                  <Input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="AFGOS"
                    className="h-11 rounded-xl border-gray-200 dark:border-gray-700 focus:border-[#34A853] focus:ring-[#34A853]/20"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                      First Name
                    </label>
                    <Input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Ahmad"
                      className="h-11 rounded-xl border-gray-200 dark:border-gray-700 focus:border-[#34A853] focus:ring-[#34A853]/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                      Last Name
                    </label>
                    <Input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Amiri"
                      className="h-11 rounded-xl border-gray-200 dark:border-gray-700 focus:border-[#34A853] focus:ring-[#34A853]/20"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Email */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <h2 className="text-lg font-semibold text-[#1F1F1F] dark:text-white mb-1">
                Your business email
              </h2>
              <p className="text-sm text-[#444746] dark:text-gray-400 mb-5">
                Choose your professional email address
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                    Business Email
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      data-email-prefix
                      value={emailPrefix}
                      onChange={(e) => {
                        const raw = e.target.value
                        const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '')
                        if (cleaned !== raw) {
                          const input = e.target
                          const pos = input.selectionStart ? Math.min(input.selectionStart, cleaned.length) : cleaned.length
                          requestAnimationFrame(() => {
                            const nativeInput = window.document.querySelector<HTMLInputElement>('[data-email-prefix]')
                            if (nativeInput) {
                              nativeInput.value = cleaned
                              nativeInput.setSelectionRange(pos, pos)
                            }
                          })
                        }
                        setEmailPrefix(cleaned)
                        setEmailStatus('idle')
                      }}
                      placeholder="info"
                      className="w-full h-11 rounded-xl pl-3 pr-[9.5rem] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:border-[#34A853] focus:ring-[#34A853]/20 focus:outline-none transition-colors"
                      autoFocus
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none font-medium select-none whitespace-nowrap">
                      @{emailDomain}.ezy
                    </span>
                  </div>
                  {/* Email availability indicator */}
                  {fullBusinessEmail && emailPrefix.trim().length > 0 && (
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
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                    Phone Number <span className="text-xs text-gray-400 font-normal">(optional)</span>
                  </label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="h-11 rounded-xl border-gray-200 dark:border-gray-700 focus:border-[#34A853] focus:ring-[#34A853]/20"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                    Team Size <span className="text-xs text-gray-400 font-normal">(optional)</span>
                  </label>
                  <select
                    value={employeeCount}
                    onChange={(e) => setEmployeeCount(e.target.value)}
                    className="w-full h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm focus:border-[#34A853] focus:ring-[#34A853]/20 focus:outline-none transition-colors"
                  >
                    <option value="">Select team size</option>
                    {EMPLOYEE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Password */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <h2 className="text-lg font-semibold text-[#1F1F1F] dark:text-white mb-1">
                Create a password
              </h2>
              <p className="text-sm text-[#444746] dark:text-gray-400 mb-5">
                Use a strong password to secure your business account
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      {...passwordForm.register('password')}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create a strong password"
                      className="h-11 rounded-xl pl-3 pr-10 border-gray-200 dark:border-gray-700 focus:border-[#34A853] focus:ring-[#34A853]/20"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {passwordForm.formState.errors.password && (
                    <p className="text-xs text-[#EA4335]">{passwordForm.formState.errors.password.message}</p>
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
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Input
                      {...passwordForm.register('confirmPassword')}
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm your password"
                      className="h-11 rounded-xl pl-3 pr-10 border-gray-200 dark:border-gray-700 focus:border-[#34A853] focus:ring-[#34A853]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {passwordForm.formState.errors.confirmPassword && (
                    <p className="text-xs text-[#EA4335]">{passwordForm.formState.errors.confirmPassword.message}</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Review */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <h2 className="text-lg font-semibold text-[#1F1F1F] dark:text-white mb-1">
                Review your info
              </h2>
              <p className="text-sm text-[#444746] dark:text-gray-400 mb-5">
                Double check before creating your business account
              </p>
              <div className="space-y-4 mb-6">
                <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Business</span>
                    <span className="text-sm font-medium text-[#1F1F1F] dark:text-white">
                      {businessName}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Name</span>
                    <span className="text-sm font-medium text-[#1F1F1F] dark:text-white">
                      {firstName} {lastName}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Email</span>
                    <span className={`text-sm font-medium ${
                      fullBusinessEmail && emailStatus !== 'taken' ? 'text-[#34A853]' : 'text-red-500'
                    }`}>
                      {fullBusinessEmail || 'Not set'}
                    </span>
                  </div>
                  {phone && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Phone</span>
                      <span className="text-sm font-medium text-[#1F1F1F] dark:text-white">{phone}</span>
                    </div>
                  )}
                  {employeeCount && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Team Size</span>
                      <span className="text-sm font-medium text-[#1F1F1F] dark:text-white">
                        {EMPLOYEE_OPTIONS.find(o => o.value === employeeCount)?.label}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="biz-terms"
                    checked={agreedToTerms}
                    onCheckedChange={(c) => setAgreedToTerms(c === true)}
                    className="data-[state=checked]:bg-[#34A853] data-[state=checked]:border-[#34A853] mt-0.5"
                  />
                  <label htmlFor="biz-terms" className="text-sm text-[#444746] dark:text-gray-400 cursor-pointer leading-relaxed">
                    I agree to the <span className="text-[#34A853]">Terms of Service</span> and <span className="text-[#34A853]">Privacy Policy</span>
                  </label>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex gap-3 mt-6 sm:mt-8">
          {step > 1 && (
            <Button type="button" variant="outline" onClick={() => setStep(step - 1)}
              className="h-11 rounded-xl flex-1 border-gray-200 dark:border-gray-700">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          )}
          {step < 4 ? (
            <Button type="button"
              onClick={() => { if (step === 1) handleStep1Next(); else if (step === 2) handleStep2Next(); else if (step === 3) handleStep3Next() }}
              className="h-11 rounded-xl flex-1 bg-[#34A853] hover:bg-[#2d9249] text-white font-medium">
              Continue
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          ) : (
            <Button type="button" onClick={handleRegister} disabled={isLoading}
              className="h-11 rounded-xl flex-1 bg-[#34A853] hover:bg-[#2d9249] text-white font-medium">
              {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : 'Create Business Account'}
            </Button>
          )}
        </div>

        {/* Back to business login */}
        <div className="text-center mt-5">
          <button onClick={() => setAuthView('business-login')}
            className="text-sm text-[#444746] dark:text-gray-400 hover:text-[#34A853] transition-colors">
            Already have an account? <span className="font-medium text-[#34A853]">Sign in</span>
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-2">
          © 2025 EzyMail. All rights reserved.
        </p>
      </div>
    </motion.div>
  )
}
