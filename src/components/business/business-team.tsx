'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  UserPlus,
  Trash2,
  Loader2,
  Mail,
  Shield,
  Clock,
  CheckCircle,
  X,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/* ─── Types ─── */

interface TeamMember {
  id: string
  memberEmail: string
  role: string
  invitedAt: string
  acceptedAt: string | null
}

/* ─── Role Badge ─── */

function RoleBadge({ role }: { role: string }) {
  if (role === 'admin') {
    return (
      <Badge className="bg-[#4285F4]/10 text-[#4285F4] border-[#4285F4]/20 text-[10px] px-2 py-0 hover:bg-[#4285F4]/20">
        <Shield className="w-3 h-3 mr-1" />
        Admin
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="text-[10px] px-2 py-0">
      Member
    </Badge>
  )
}

/* ─── Status Badge ─── */

function StatusBadge({ acceptedAt }: { acceptedAt: string | null }) {
  if (acceptedAt) {
    return (
      <Badge className="bg-[#34A853]/10 text-[#34A853] border-[#34A853]/20 text-[10px] px-2 py-0 hover:bg-[#34A853]/20">
        <CheckCircle className="w-3 h-3 mr-1" />
        Accepted
      </Badge>
    )
  }
  return (
    <Badge className="bg-[#FBBC05]/10 text-[#FBBC05] border-[#FBBC05]/20 text-[10px] px-2 py-0 hover:bg-[#FBBC05]/20">
      <Clock className="w-3 h-3 mr-1" />
      Invited
    </Badge>
  )
}

/* ─── Loading Skeleton ─── */

function TeamSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div className="space-y-2">
          <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg w-48 animate-pulse" />
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-lg w-32 animate-pulse" />
        </div>
        <div className="h-9 w-40 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-40 animate-pulse" />
              <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-28 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Main Component ─── */

export function BusinessTeam() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviting, setInviting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch('/api/business/team')
      if (res.ok) {
        const data = await res.json()
        setTeamMembers(data.teamMembers || [])
      } else {
        toast.error('Failed to load team members')
      }
    } catch (err) {
      console.error('Failed to fetch team:', err)
      toast.error('Failed to load team members')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTeam()
  }, [fetchTeam])

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      toast.error('Please enter an email address')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(inviteEmail.trim())) {
      toast.error('Please enter a valid email address')
      return
    }

    setInviting(true)
    try {
      const res = await fetch('/api/business/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })

      if (res.ok) {
        toast.success(`Invitation sent to ${inviteEmail.trim()}`)
        setInviteEmail('')
        setInviteRole('member')
        setShowInviteForm(false)
        fetchTeam()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to send invitation')
      }
    } catch (err) {
      console.error('Failed to invite team member:', err)
      toast.error('Failed to send invitation')
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id)
    try {
      const res = await fetch(`/api/business/team/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        toast.success('Team member removed')
        setTeamMembers((prev) => prev.filter((m) => m.id !== id))
        setConfirmRemoveId(null)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to remove team member')
      }
    } catch (err) {
      console.error('Failed to remove team member:', err)
      toast.error('Failed to remove team member')
    } finally {
      setRemovingId(null)
    }
  }

  if (loading) return <TeamSkeleton />

  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Team</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {teamMembers.length} team member{teamMembers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          onClick={() => setShowInviteForm(!showInviteForm)}
          className="rounded-xl bg-[#4285F4] hover:bg-[#4285F4]/90 text-white"
        >
          <UserPlus className="w-4 h-4" />
          Invite Team Member
        </Button>
      </div>

      {/* ─── Invite Form ─── */}
      <AnimatePresence>
        {showInviteForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                Invite a New Team Member
              </h4>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                    className="rounded-xl"
                  />
                </div>
                <div className="w-36">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
                    Role
                  </label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleInvite}
                    disabled={inviting}
                    className="rounded-xl bg-[#4285F4] hover:bg-[#4285F4]/90 text-white"
                  >
                    {inviting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                    Send Invite
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowInviteForm(false)}
                    className="rounded-xl"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Team Members Table ─── */}
      <div className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-200 dark:border-gray-800">
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Member</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Role</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Status</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Invited</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teamMembers.length > 0 ? (
              teamMembers.map((member, index) => (
                <motion.tr
                  key={member.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#4285F4]/10 flex items-center justify-center shrink-0">
                        <span className="text-[#4285F4] text-xs font-semibold">
                          {member.memberEmail.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                        {member.memberEmail}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={member.role} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge acceptedAt={member.acceptedAt} />
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(member.invitedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {confirmRemoveId === member.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[11px] text-[#EA4335]">Remove?</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRemove(member.id)}
                          disabled={!!removingId}
                          className="h-7 text-[11px] px-2 rounded-lg"
                        >
                          {removingId === member.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCircle className="w-3 h-3" />
                          )}
                          Yes
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmRemoveId(null)}
                          className="h-7 text-[11px] px-2 rounded-lg"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmRemoveId(member.id)}
                        className="h-7 text-[11px] text-[#EA4335] hover:text-[#EA4335] hover:bg-[#EA4335]/10 rounded-lg"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </Button>
                    )}
                  </TableCell>
                </motion.tr>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <Users className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No team members yet</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Invite team members to collaborate
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
