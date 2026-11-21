'use client'

import { useState } from 'react'
import { Loader2, LogOut, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useAppStore } from '@/store/use-app-store'

/**
 * F-08 (client affordance): while an admin is inside an impersonation
 * session, the cookie is a victim JWT signed with the admin's id (`imp`)
 * and /api/auth/me reports `impersonating: true`. The server side — POST to
 * enter, DELETE to exit and restore the admin's original session — already
 * exists; this banner adds the missing UI so the state is obvious and
 * escapable in both victim contexts (personal mail shell, business
 * dashboard).
 *
 * Fixed top bar (h-11) so it stays reachable even in the mobile
 * "header hidden while reading" mode; the impersonated shells compensate
 * with a matching pt-11 so nothing is overlaid.
 */
export function ImpersonationBanner() {
  const user = useAppStore((s) => s.user)
  const impersonating = useAppStore((s) => s.impersonating)
  const setImpersonating = useAppStore((s) => s.setImpersonating)
  const [exiting, setExiting] = useState(false)

  if (!impersonating || !user) return null

  const exit = async () => {
    setExiting(true)
    try {
      // The DELETE handler ignores the URL id and resolves the admin to
      // restore from the signed `imp` claim — the id here only satisfies
      // the route shape.
      const res = await fetch(`/api/admin/users/${user.id}/impersonate`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        setImpersonating(false)
        // Full reload: the restored admin cookie re-resolves through
        // /api/auth/me and every victim-context slice (mail, folders,
        // selected email, admin view) rebuilds from the admin identity.
        window.location.reload()
        return
      }
      toast.error(data?.error || 'Failed to exit impersonation')
    } catch {
      toast.error('Failed to exit impersonation')
    } finally {
      setExiting(false)
    }
  }

  return (
    <div className="fixed top-0 inset-x-0 z-[60] h-11 flex items-center justify-center gap-3 px-4 bg-amber-50 dark:bg-amber-950/80 border-b border-amber-500/30">
      <UserCog className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <p className="text-sm text-amber-800 dark:text-amber-200 truncate">
        You are impersonating <span className="font-semibold">{user.firstName} {user.lastName}</span> ({user.email})
      </p>
      <Button
        variant="outline"
        size="sm"
        className="h-7 shrink-0 border-amber-500/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900"
        onClick={exit}
        disabled={exiting}
      >
        {exiting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
        Exit impersonation
      </Button>
    </div>
  )
}
