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
  Pencil,
  Crown,
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

/* ─── Avatar Color from Email Hash ─── */

function getAvatarColor(email: string) {
  const colors = ['#DBEAFE', '#CFD8DC', '#F3E5F5', '#FFF3E0', '#E8F5E9', '#E0F7FA', '#FCE4EC', '#F3E5F5']
  let hash = 0
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

/* ─── Role Badge ─── */

function RoleBadge({ role }: { role: string }) {
  if (role === 'admin') {
    return (
      <Badge className="bg-gradient-to-r from-[#4285F4]/10 to-[#6366F1]/10 text-[#4285F4] border-[#4285F4]/20 text-[10px] px-2.5 py-0.5 hover:from-[#4285F4]/15 hover:to-[#6366F1]/15">
        <Shield className="w-3 h-3 mr-1" />
        Admin
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="text-[10px] px-2.5 py-0.5">
      Member
    </Badge>
  )
}

/* ─── Status Badge ─── */

function StatusBadge({ acceptedAt }: { acceptedAt: string | null }) {
  if (acceptedAt) {
    return (
      <Badge className="bg-[#34A853]/10 text-[#34A853] border-[#34A853]/20 text-[10px] px-2.5 py-0.5 hover:bg-[#34A853]/20">
        <CheckCircle className="w-3 h-3 mr-1" />
        Accepted
      </Badge>
    )
  }
  return (
    <Badge className="bg-[#FBBC05]/10 text-[#FBBC05] border-[#FBBC05]/20 text-[10px] px-2.5 py-0.5 hover:bg-[#FBBC05]/20">
      <Clock className="w-3 h-3 mr-1" />
      Invited
    </Badge>
  )
}

/* ─── Loading Skeleton ─── */

function TeamSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-28 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
      <div className="h-24 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
      <div className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="w-9 h-9 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-28 animate-pulse" />
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
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState('')
  const [updatingRole, setUpdatingRole] = useState(false)

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

  async function handleChangeRole(id: string) {
    if (!editRole) return

    setUpdatingRole(true)
    try {
      const res = await fetch(`/api/business/team/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: editRole }),
      })

      if (res.ok) {
        toast.success('Role updated successfully')
        setTeamMembers((prev) =>
          prev.map((m) => (m.id === id ? { ...m, role: editRole } : m))
        )
        setEditingRoleId(null)
        setEditRole('')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to update role')
      }
    } catch (err) {
      console.error('Failed to update role:', err)
      toast.error('Failed to update role')
    } finally {
      setUpdatingRole(false)
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

  const acceptedMembers = teamMembers.filter((m) => m.acceptedAt)
  const pendingInvites = teamMembers.filter((m) => !m.acceptedAt)

  if (loading) return <TeamSkeleton />

  return (
    <div className="space-y-8">
      {/* ─── Hero Header ─── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4285F4]/10 via-[#6366F1]/5 to-transparent ring-1 ring-[#4285F4]/10 p-8"
      >
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-[#4285F4]/5" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#4285F4]/10 to-[#4285F4]/5 flex items-center justify-center">
                <Crown className="w-6 h-6 text-[#4285F4]" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">Team Management</h2>
                <p className="text-[13px] text-gray-500 dark:text-gray-400">
                  Manage your team members and permissions
                </p>
              </div>
            </div>
            <div className="ml-14 mt-1">
              <Badge className="bg-[#4285F4]/10 text-[#4285F4] text-[11px] font-medium px-2.5 py-0.5 border-[#4285F4]/15">
                {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </div>
          <Button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="rounded-xl bg-[#4285F4] hover:bg-[#4285F4]/90 text-white"
          >
            <UserPlus className="w-4 h-4" />
            Invite Team Member
          </Button>
        </div>
      </motion.div>

      {/* ─── Pending Invites Section ─── */}
      {pendingInvites.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="rounded-2xl ring-1 ring-[#FBBC04]/20 bg-gradient-to-r from-[#FBBC04]/5 to-transparent p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-[#FBBC04]" />
            <h3 className="text-sm font-semibold text-[#FBBC04]">Pending Invites</h3>
            <Badge className="bg-[#FBBC04]/10 text-[#FBBC04] text-[10px] px-2 py-0 ml-1">{pendingInvites.length}</Badge>
          </div>
          <div className="space-y-2">
            {pendingInvites.map((member) => (
              <div key={member.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/60 dark:bg-gray-800/40">
                <div
                  className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-bold text-gray-600 dark:text-gray-300"
                  style={{ backgroundColor: getAvatarColor(member.memberEmail) }}
                >
                  {member.memberEmail.charAt(0).toUpperCase()}
                </div>
                <span className="text-[13px] text-gray-700 dark:text-gray-300 truncate flex-1">{member.memberEmail}</span>
                <span className="text-[11px] text-gray-400">
                  Invited {new Date(member.invitedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ─── Invite Form ─── */}
      <AnimatePresence>
        {showInviteForm && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <div className="rounded-2xl ring-1 ring-[#4285F4]/20 bg-gradient-to-br from-white to-[#4285F4]/[0.02] dark:from-gray-900 dark:to-[#4285F4]/[0.02] p-6 shadow-lg shadow-[#4285F4]/5 border-l-4 border-l-[#4285F4]">
              <h4 className="text-[15px] font-semibold text-gray-900 dark:text-white mb-1">
                Invite a New Team Member
              </h4>
              <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-4">
                Invite a team member to collaborate on your business email account.
              </p>
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
                    className="rounded-xl dark:bg-gray-800"
                  />
                </div>
                <div className="w-36">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
                    Role
                  </label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className="rounded-xl dark:bg-gray-800">
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
      <div className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Member</TableHead>
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</TableHead>
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Invited</TableHead>
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teamMembers.length > 0 ? (
              teamMembers.map((member, index) => {
                return (
                  <motion.tr
                    key={member.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                    className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-all duration-150 border-l-2 border-l-transparent hover:border-l-[#4285F4]"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300 shrink-0"
                          style={{ backgroundColor: getAvatarColor(member.memberEmail) }}
                        >
                          {member.memberEmail.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[13px] font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                          {member.memberEmail}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {editingRoleId === member.id ? (
                        <div className="flex items-center gap-1.5">
                          <Select value={editRole} onValueChange={setEditRole}>
                            <SelectTrigger className="h-7 w-28 rounded-lg text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            onClick={() => handleChangeRole(member.id)}
                            disabled={updatingRole}
                            className="h-7 w-7 p-0 rounded-lg bg-[#4285F4] hover:bg-[#4285F4]/90 text-white"
                          >
                            {updatingRole ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3 h-3" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingRoleId(null)}
                            className="h-7 w-7 p-0 rounded-lg"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <RoleBadge role={member.role} />
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge acceptedAt={member.acceptedAt} />
                    </TableCell>
                    <TableCell className="text-[13px] text-gray-500 dark:text-gray-400">
                      {new Date(member.invitedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingRoleId === member.id ? null : confirmRemoveId === member.id ? (
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
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingRoleId(member.id)
                              setEditRole(member.role === 'admin' ? 'member' : 'admin')
                            }}
                            className="h-7 text-[11px] rounded-lg"
                            title="Change Role"
                          >
                            <Pencil className="w-3 h-3" />
                            Role
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmRemoveId(member.id)}
                            className="h-7 text-[11px] text-[#EA4335] hover:text-[#EA4335] hover:bg-[#EA4335]/10 rounded-lg"
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </motion.tr>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-20">
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#4285F4]/10 to-[#6366F1]/5 flex items-center justify-center mb-5">
                      <Users className="w-10 h-10 text-[#4285F4]/40" />
                    </div>
                    <p className="text-[15px] font-semibold text-gray-700 dark:text-gray-300">No team members yet</p>
                    <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-2 max-w-md text-center leading-relaxed">
                      Invite your first team member to start collaborating on campaigns, emails, and customer management together.
                    </p>
                    <Button
                      onClick={() => setShowInviteForm(true)}
                      className="mt-5 rounded-xl bg-[#4285F4] hover:bg-[#4285F4]/90 text-white"
                    >
                      <UserPlus className="w-4 h-4" />
                      Invite First Member
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}