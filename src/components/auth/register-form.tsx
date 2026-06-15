'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Eye, EyeOff, Loader2, Check, ArrowLeft, ArrowRight, User, Lock, Calendar, Shield, X, Building2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useAppStore } from '@/store/use-app-store'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function generateDays(month: number, year: number) {
  if (!month || !year) return Array.from({ length: 31 }, (_, i) => i + 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, i) => i + 1)
}

function generateYears() {
  const currentYear = new Date().getFullYear()
  return Array.from({ length: 100 }, (_, i) => currentYear - 13 - i)
}

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

const nameSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
})

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

type NameValues = z.infer<typeof nameSchema>
type PasswordValues = z.infer<typeof passwordSchema>

const STEPS = [
  { id: 1, label: 'Name', icon: User },
  { id: 2, label: 'Birthday', icon: Calendar },
  { id: 3, label: 'Password', icon: Lock },
  { id: 4, label: 'Review', icon: Shield },
]

export function RegisterForm() {
  const { setUser, setAuthView } = useAppStore()
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Step 1: Name
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // Step 2: Birthday
  const [month, setMonth] = useState(0)
  const [day, setDay] = useState(0)
  const [year, setYear] = useState(0)

  // Email: user-chosen username part (before @ezy.af)
  const [emailUsername, setEmailUsername] = useState('')
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')

  // Step 3: Password
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  // Forms (must be called before .watch())
  const nameForm = useForm<NameValues>({
    resolver: zodResolver(nameSchema),
    defaultValues: { firstName: '', lastName: '' },
  })
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })
  const passwordValue = passwordForm.watch('password')
  const passwordStrength = getPasswordStrength(passwordValue || '')

  // Build the full email from username + @ezy.af
  const fullEmail = emailUsername.trim() ? `${emailUsername.trim().toLowerCase()}@ezy.af` : ''

  // Validate username (letters, numbers, dots, underscores, hyphens)
  const isValidUsername = /^[a-zA-Z0-9._-]+$/.test(emailUsername.trim()) && emailUsername.trim().length > 0

  // Check availability (debounced)
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!fullEmail || !isValidUsername) {
      setEmailStatus('idle')
      return
    }
    setEmailStatus('checking')
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current)
    checkTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(fullEmail)}`)
        const data = await res.json()
        setEmailStatus(data.available ? 'available' : 'taken')
      } catch {
        setEmailStatus('idle')
      }
    }, 600)
    return () => { if (checkTimerRef.current) clearTimeout(checkTimerRef.current) }
  }, [fullEmail, isValidUsername])

  const handleNameNext = () => {
    const fn = nameForm.getValues('firstName')
    const ln = nameForm.getValues('lastName')
    if (fn.length < 2 || ln.length < 2) {
      toast.error('Please enter your first and last name (min 2 chars each)')
      return
    }
    if (!fullEmail || !isValidUsername) {
      toast.error('Please enter a valid email username')
      return
    }
    if (emailStatus === 'taken') {
      toast.error('Your chosen email is taken. Please pick another one')
      return
    }
    setFirstName(fn)
    setLastName(ln)
    setStep(2)
  }

  const handleDobNext = () => {
    if (!month || !day || !year) {
      toast.error('Please fill in your complete date of birth')
      return
    }
    const dob = new Date(year, month - 1, day)
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    if (age < 13) {
      toast.error('You must be at least 13 years old')
      return
    }
    setStep(3)
  }

  const handlePasswordNext = () => {
    passwordForm.trigger().then(valid => {
      if (valid) setStep(4)
    })
  }

  const handleRegister = async () => {
    if (!agreedToTerms) {
      toast.error('You must agree to the terms and conditions')
      return
    }
    if (!fullEmail || emailStatus === 'taken') {
      toast.error('Please choose an available email address')
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          dateOfBirth: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          email: fullEmail,
          password: passwordForm.getValues('password'),
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        toast.error(result.error || 'Registration failed')
        return
      }
      toast.success('Account created successfully!')
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
      <div className="p-6 sm:p-8 flex-1 flex flex-col justify-center sm:justify-start overflow-y-auto">
        {/* Personal / Business Tab Switcher — Business tab hidden on mobile */}
        <div className="hidden lg:flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-6">
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-[#1F1F1F] dark:text-white bg-white dark:bg-gray-700 shadow-sm transition-all"
          >
            <User className="w-3.5 h-3.5" />
            Personal
          </button>
          <button
            onClick={() => setAuthView('business-register')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-[#1F1F1F] dark:hover:text-white transition-all"
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
                          ? 'bg-[#4285F4] text-white shadow-lg shadow-[#4285F4]/30'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                      }`}
                    >
                      {isCompleted ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : <StepIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                    </div>
                    <span className={`text-[10px] sm:text-xs mt-1 font-medium ${
                      isActive ? 'text-[#4285F4]' : isCompleted ? 'text-[#34A853]' : 'text-gray-400'
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
            {/* STEP 1: Name + Email */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                <h2 className="text-lg font-semibold text-[#1F1F1F] dark:text-white mb-1">
                  What&apos;s your name?
                </h2>
                <p className="text-sm text-[#444746] dark:text-gray-400 mb-5">
                  Choose your name and pick your email address
                </p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">First name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <Input
                        {...nameForm.register('firstName')}
                        placeholder="John"
                        className="h-11 rounded-xl pl-10 border-gray-200 dark:border-gray-700 focus:border-[#4285F4] focus:ring-[#4285F4]/20"
                        autoFocus
                      />
                    </div>
                    {nameForm.formState.errors.firstName && (
                      <p className="text-xs text-red-500">{nameForm.formState.errors.firstName.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">Last name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <Input
                        {...nameForm.register('lastName')}
                        placeholder="Doe"
                        className="h-11 rounded-xl pl-10 border-gray-200 dark:border-gray-700 focus:border-[#4285F4] focus:ring-[#4285F4]/20"
                      />
                    </div>
                    {nameForm.formState.errors.lastName && (
                      <p className="text-xs text-red-500">{nameForm.formState.errors.lastName.message}</p>
                    )}
                  </div>

                  {/* EMAIL CHOOSER */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <Input
                        value={emailUsername}
                        onChange={(e) => { setEmailUsername(e.target.value.replace(/[^a-zA-Z0-9._-]/g, '')); setEmailStatus('idle') }}
                        placeholder="yourname"
                        className="h-11 rounded-xl pl-10 pr-20 border-gray-200 dark:border-gray-700 focus:border-[#4285F4] focus:ring-[#4285F4]/20"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none font-medium select-none">
                        @ezy.af
                      </span>
                    </div>
                    {/* Status indicator */}
                    {fullEmail && isValidUsername && (
                      <div className="flex items-center gap-1.5">
                        {emailStatus === 'checking' && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                        )}
                        {emailStatus === 'available' && (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-xs text-emerald-500 font-medium">{fullEmail} is available</span>
                          </>
                        )}
                        {emailStatus === 'taken' && (
                          <>
                            <X className="w-3.5 h-3.5 text-red-500" />
                            <span className="text-xs text-red-500 font-medium">{fullEmail} is taken</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 2: Birthday */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                <h2 className="text-lg font-semibold text-[#1F1F1F] dark:text-white mb-1">
                  When&apos;s your birthday?
                </h2>
                <p className="text-sm text-[#444746] dark:text-gray-400 mb-5">
                  You must be 13 or older to use EzyMail
                </p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">Month</label>
                    <select
                      value={month}
                      onChange={(e) => { setMonth(Number(e.target.value)); setDay(0) }}
                      className="w-full h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm focus:border-[#4285F4] focus:ring-[#4285F4]/20 focus:outline-none"
                    >
                      <option value={0}>Select month</option>
                      {MONTHS.map((m, i) => (
                        <option key={m} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">Day</label>
                      <select
                        value={day}
                        onChange={(e) => setDay(Number(e.target.value))}
                        className="w-full h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm focus:border-[#4285F4] focus:ring-[#4285F4]/20 focus:outline-none"
                      >
                        <option value={0}>Day</option>
                        {generateDays(month, year || new Date().getFullYear() - 20).map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">Year</label>
                      <select
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className="w-full h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm focus:border-[#4285F4] focus:ring-[#4285F4]/20 focus:outline-none"
                      >
                        <option value={0}>Year</option>
                        {generateYears().map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
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
                  Use 8+ characters with uppercase, lowercase & numbers
                </p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <Input
                        {...passwordForm.register('password')}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Create a strong password"
                        className="h-11 rounded-xl pl-10 pr-10 border-gray-200 dark:border-gray-700 focus:border-[#4285F4] focus:ring-[#4285F4]/20"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {passwordForm.formState.errors.password && (
                      <p className="text-xs text-red-500">{passwordForm.formState.errors.password.message}</p>
                    )}
                    {passwordValue && (
                      <div className="space-y-1">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                              i <= passwordStrength.score ? passwordStrength.color : 'bg-gray-200 dark:bg-gray-700'
                            }`} />
                          ))}
                        </div>
                        <p className={`text-xs font-medium ${
                          passwordStrength.label === 'Weak' ? 'text-red-500' :
                          passwordStrength.label === 'Medium' ? 'text-amber-500' : 'text-emerald-500'
                        }`}>{passwordStrength.label}</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#1F1F1F] dark:text-gray-300">Confirm password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <Input
                        {...passwordForm.register('confirmPassword')}
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirm your password"
                        className="h-11 rounded-xl pl-10 pr-10 border-gray-200 dark:border-gray-700 focus:border-[#4285F4] focus:ring-[#4285F4]/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {passwordForm.formState.errors.confirmPassword && (
                      <p className="text-xs text-red-500">{passwordForm.formState.errors.confirmPassword.message}</p>
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
                  Double check before creating your account
                </p>
                <div className="space-y-4 mb-6">
                  <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Name</span>
                      <span className="text-sm font-medium text-[#1F1F1F] dark:text-white">
                        {firstName} {lastName}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Email</span>
                      <span className={`text-sm font-medium ${fullEmail && isValidUsername && emailStatus !== 'taken' ? 'text-[#4285F4]' : 'text-red-500'}`}>
                        {fullEmail || 'Not set'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Birthday</span>
                      <span className="text-sm font-medium text-[#1F1F1F] dark:text-white">
                        {MONTHS[month - 1]} {day}, {year}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="terms"
                      checked={agreedToTerms}
                      onCheckedChange={(c) => setAgreedToTerms(c === true)}
                      className="data-[state=checked]:bg-[#4285F4] data-[state=checked]:border-[#4285F4] mt-0.5"
                    />
                    <label htmlFor="terms" className="text-sm text-[#444746] dark:text-gray-400 cursor-pointer leading-relaxed">
                      I agree to the <span className="text-[#4285F4]">Terms of Service</span> and <span className="text-[#4285F4]">Privacy Policy</span>
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
                onClick={() => { if (step === 1) handleNameNext(); else if (step === 2) handleDobNext(); else if (step === 3) handlePasswordNext() }}
                className="h-11 rounded-xl flex-1 bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium">
                Continue
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            ) : (
              <Button type="button" onClick={handleRegister} disabled={isLoading}
                className="h-11 rounded-xl flex-1 bg-[#34A853] hover:bg-[#2d9249] text-white font-medium">
                {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : 'Create Account'}
              </Button>
            )}
          </div>

          {/* Back to login */}
          <div className="text-center mt-5">
            <button onClick={() => setAuthView('login')}
              className="text-sm text-[#444746] dark:text-gray-400 hover:text-[#4285F4] transition-colors">
              Already have an account? <span className="font-medium text-[#4285F4]">Sign in</span>
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          &copy; 2025 EzyMail. All rights reserved.
        </p>
    </motion.div>
  )
}
