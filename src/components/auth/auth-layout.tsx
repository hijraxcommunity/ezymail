'use client'

import { useAppStore } from '@/store/use-app-store'
import { LoginForm } from '@/components/auth/login-form'
import { RegisterForm } from '@/components/auth/register-form'
import { BusinessRegisterForm } from '@/components/auth/business-register-form'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'
import { BusinessLoginForm } from '@/components/auth/business-login-form'

/**
 * Split auth layout for desktop (lg+).
 * Left: illustration panel.  Right: active auth form.
 * Mobile: renders forms full-screen as before (no illustration).
 */
export function AuthLayout() {
  const { authView } = useAppStore()

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-[#D3E3FD] via-white to-[#E6F4EA]">
      {/* ─── Left panel: illustration (hidden on mobile/tablet) ─── */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-gradient-to-br from-[#4285F4] via-[#5B9BF7] to-[#34A853]">
        {/* Decorative shapes */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-12 right-12 w-72 h-72 rounded-full bg-[#34A853]/20 blur-2xl" />
        <div className="absolute top-1/3 left-1/2 w-48 h-48 rounded-full bg-[#FBBC04]/10 blur-2xl" />

        <div className="relative z-10 flex flex-col justify-center items-center w-full px-12 text-white">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-10">
            <img src="/favicon-32.png" alt="EzyMail" className="w-12 h-12 rounded-2xl shadow-lg" />
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="text-white">Ezy</span>
              <span className="text-[#B8E6B8]">Mail</span>
            </h1>
          </div>

          {/* Illustration — email envelope with floating elements */}
          <div className="relative w-64 h-48 mb-10">
            {/* Main envelope */}
            <div className="absolute inset-0 flex items-end justify-center">
              <svg className="w-full h-full drop-shadow-2xl" viewBox="0 0 280 200" fill="none">
                <rect x="30" y="50" width="220" height="140" rx="12" fill="white" fillOpacity="0.95" />
                <path d="M30 62 L140 130 L250 62" stroke="#4285F4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M30 50 L140 120 L250 50" stroke="#4285F4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            {/* Floating check */}
            <div className="absolute -top-2 right-8 w-10 h-10 rounded-full bg-[#34A853] flex items-center justify-center shadow-lg animate-bounce" style={{ animationDuration: '3s' }}>
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            {/* Floating mail icon */}
            <div className="absolute top-6 left-4 w-8 h-8 rounded-lg bg-[#FBBC04] flex items-center justify-center shadow-lg" style={{ animation: 'float 4s ease-in-out infinite' }}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            {/* Floating star */}
            <div className="absolute bottom-10 left-12 w-6 h-6 rounded-full bg-[#EA4335] flex items-center justify-center shadow" style={{ animation: 'float 5s ease-in-out infinite 1s' }}>
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
            {/* Floating shield */}
            <div className="absolute bottom-4 right-6 w-8 h-8 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center" style={{ animation: 'float 4.5s ease-in-out infinite 0.5s' }}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
          </div>

          {/* Tagline */}
          <h2 className="text-2xl font-bold text-center leading-tight mb-3">
            Email made <span className="text-[#B8E6B8]">Ezy</span>
          </h2>
          <p className="text-white/75 text-center text-sm leading-relaxed max-w-xs">
            Simple, secure, and professional email for everyone.
            Personal or business — we&apos;ve got you covered.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {['Free forever', 'End-to-end encrypted', 'Business tools'].map((label) => (
              <span
                key={label}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/15 backdrop-blur-sm border border-white/20"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Right panel: auth forms ─── */}
      <div className="flex-1 flex items-center justify-center p-0 lg:p-8">
        <div className="w-full max-w-md lg:max-w-lg">
          {/* Mobile-only logo (shown on mobile/tablet, hidden on desktop since left panel has it) */}
          <div className="flex lg:hidden items-center justify-center gap-2 mb-6 pt-6 sm:pt-0">
            <img src="/favicon-32.png" alt="EzyMail" className="w-10 h-10 rounded-xl" />
            <h1 className="text-2xl font-bold">
              <span className="text-[#4285F4]">Ezy</span>
              <span className="text-[#34A853]">Mail</span>
            </h1>
          </div>

          {authView === 'login' && <LoginForm />}
          {authView === 'register' && <RegisterForm />}
          {authView === 'business-register' && <BusinessRegisterForm />}
          {authView === 'business-login' && <BusinessLoginForm />}
          {authView === 'forgot-password' && <ForgotPasswordForm />}
        </div>
      </div>
    </div>
  )
}
