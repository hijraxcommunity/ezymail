'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, KeyRound, Mail } from 'lucide-react'
import { useAppStore } from '@/store/use-app-store'

export function ForgotPasswordForm() {
  const { setAuthView } = useAppStore()
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('Please enter your email address')
      return
    }
    setIsLoading(true)
    try {
      // Simulate — real backend integration can be added later
      await new Promise((r) => setTimeout(r, 1500))
      setSent(true)
      toast.success('Reset link sent! Check your inbox.')
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
        <h2 className="text-xl font-semibold text-[#1F1F1F] dark:text-white text-center mb-2">
          Reset your password
        </h2>
        <p className="text-sm text-[#444746] dark:text-gray-400 text-center mb-6">
          {sent
            ? `We've sent a reset link to ${email}. Check your inbox.`
            : 'Enter your email and we\'ll send you a reset link.'}
        </p>

        {!sent ? (
          <form onSubmit={handleSubmit} className="space-y-4">
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
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium text-sm transition-all duration-200"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </Button>
          </form>
        ) : (
          <Button
            onClick={() => setAuthView('login')}
            className="w-full h-11 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium text-sm transition-all duration-200"
          >
            Back to Sign In
          </Button>
        )}

        <div className="text-center mt-6">
          <button
            onClick={() => setAuthView('login')}
            className="text-sm text-[#4285F4] hover:text-[#1a73e8] font-medium transition-colors"
          >
            {sent ? 'Resend link' : 'Back to sign in'}
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
