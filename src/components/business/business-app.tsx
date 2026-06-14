'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '@/store/use-app-store'
import { BusinessLayout } from './business-layout'
import { BusinessDashboard } from './business-dashboard'
import { BusinessEmail } from './business-email'
import { BusinessTeam } from './business-team'
import { BusinessCustomers } from './business-customers'
import { BusinessCampaigns } from './business-campaigns'
import { BusinessSettings } from './business-settings'

/* ─── Main Business App ─── */

export function BusinessApp() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [profile, setProfile] = useState<{ subscriptionStatus: string | null } | null>(null)

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/business/profile')
        if (res.ok) {
          const data = await res.json()
          setProfile(data.user)
        }
      } catch (err) {
        console.error('Failed to fetch business profile:', err)
      }
    }
    fetchProfile()
  }, [])

  function renderActivePage() {
    switch (activeTab) {
      case 'dashboard':
        return <BusinessDashboard />
      case 'email':
        return <BusinessEmail />
      case 'team':
        return <BusinessTeam />
      case 'customers':
        return <BusinessCustomers />
      case 'campaigns':
        return <BusinessCampaigns />
      case 'settings':
        return <BusinessSettings />
      default:
        return <BusinessDashboard />
    }
  }

  return (
    <BusinessLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderActivePage()}
    </BusinessLayout>
  )
}
