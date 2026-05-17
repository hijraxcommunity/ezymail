'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  X,
  Search,
  Plus,
  Star,
  Mail,
  Phone,
  StickyNote,
  Calendar,
  Edit3,
  Trash2,
  Send,
  SortAsc,
  Users,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/store/use-app-store'

// ─── Types ────────────────────────────────────────────────────────────────

interface Contact {
  id: string
  name: string
  email: string
  phone: string | null
  notes: string
  isFavorite: boolean
  createdAt: string
  updatedAt: string
}

type SortOption = 'name' | 'email' | 'createdAt'
type FilterOption = 'all' | 'favorites'

// ─── Color palette for avatars ─────────────────────────────────────────────

const avatarColors = [
  'from-[#4285F4] to-[#1a73e8]',
  'from-[#34A853] to-[#1e8e3e]',
  'from-[#EA4335] to-[#c5221f]',
  'from-[#FBBC05] to-[#f9a825]',
  'from-[#8E24AA] to-[#6A1B9A]',
  'from-[#00ACC1] to-[#00838F]',
  'from-[#FF7043] to-[#E64A19]',
  'from-[#5C6BC0] to-[#3949AB]',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ─── Animation variants ────────────────────────────────────────────────────

const containerStagger = {
  animate: {
    transition: { staggerChildren: 0.04 },
  },
}

const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
}

const listItem = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.25, ease: 'easeOut' as const } },
  exit: { opacity: 0, x: -8, transition: { duration: 0.15 } },
}

// ─── Contact Form Dialog ──────────────────────────────────────────────────

interface ContactFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact?: Contact | null
  onSave: (data: { name: string; email: string; phone?: string; notes?: string }) => void
  isEditing: boolean
}

function ContactForm({ open, onOpenChange, contact, onSave, isEditing }: ContactFormProps) {
  const [name, setName] = useState(() => contact?.name || '')
  const [email, setEmail] = useState(() => contact?.email || '')
  const [phone, setPhone] = useState(() => contact?.phone || '')
  const [notes, setNotes] = useState(() => contact?.notes || '')
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})

  const handleSubmit = () => {
    const newErrors: { name?: string; email?: string } = {}
    if (!name.trim()) newErrors.name = 'Name is required'
    if (!email.trim()) newErrors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) newErrors.email = 'Invalid email format'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    onSave({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      notes: notes.trim() || undefined,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-[#1F1F1F] dark:text-white">
            {isEditing ? 'Edit Contact' : 'New Contact'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="contact-name" className="text-sm font-medium text-[#1F1F1F] dark:text-white">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="contact-name"
              placeholder="Full name"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })) }}
              className="rounded-xl"
              autoFocus
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-email" className="text-sm font-medium text-[#1F1F1F] dark:text-white">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="contact-email"
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })) }}
              className="rounded-xl"
            />
            {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-phone" className="text-sm font-medium text-[#1F1F1F] dark:text-white">
              Phone
            </Label>
            <Input
              id="contact-phone"
              type="tel"
              placeholder="93700000000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-notes" className="text-sm font-medium text-[#1F1F1F] dark:text-white">
              Notes
            </Label>
            <Textarea
              id="contact-notes"
              placeholder="Add notes about this contact..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl resize-none"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl min-w-[80px]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            className="rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white min-w-[80px]"
          >
            {isEditing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Contacts Panel ──────────────────────────────────────────────────

export function ContactsPanel() {
  const { setContactsView, setComposeOpen } = useAppStore()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [filterBy, setFilterBy] = useState<FilterOption>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null)

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      params.set('sortBy', sortBy)
      params.set('order', sortBy === 'createdAt' ? 'desc' : 'asc')
      if (filterBy === 'favorites') params.set('favorite', 'true')

      const res = await fetch(`/api/contacts?${params}`)
      const data = await res.json()
      if (data.success) {
        setContacts(data.data)
      }
    } catch {
      toast.error('Failed to load contacts')
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, sortBy, filterBy])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  // Create / Update contact
  const handleSave = async (formData: { name: string; email: string; phone?: string; notes?: string }) => {
    try {
      const url = editingContact ? `/api/contacts/${editingContact.id}` : '/api/contacts'
      const method = editingContact ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const data = await res.json()

      if (data.success) {
        toast.success(editingContact ? 'Contact updated' : 'Contact created')
        setEditingContact(null)
        fetchContacts()
      } else {
        toast.error(data.error || 'Failed to save contact')
      }
    } catch {
      toast.error('Failed to save contact')
    }
  }

  // Delete contact
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' })
      const data = await res.json()

      if (data.success) {
        toast.success('Contact deleted')
        setExpandedId(null)
        setDeletingContact(null)
        fetchContacts()
      } else {
        toast.error(data.error || 'Failed to delete contact')
      }
    } catch {
      toast.error('Failed to delete contact')
    }
  }

  // Toggle favorite
  const handleToggleFavorite = async (contact: Contact) => {
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: !contact.isFavorite }),
      })
      const data = await res.json()

      if (data.success) {
        setContacts((prev) =>
          prev.map((c) => (c.id === contact.id ? { ...c, isFavorite: !contact.isFavorite } : c))
        )
      }
    } catch {
      toast.error('Failed to update favorite')
    }
  }

  // Compose to contact
  const handleCompose = (contact: Contact) => {
    setContactsView(false)
    setTimeout(() => {
      setComposeOpen(true)
      // Pre-fill the compose "to" field isn't directly supported by store,
      // but user can type the email. We store a reference in sessionStorage.
      sessionStorage.setItem('compose_prefill_to', contact.email)
    }, 200)
  }

  // Edit contact
  const handleEdit = (contact: Contact) => {
    setEditingContact(contact)
    setFormOpen(true)
  }

  const sortLabels: Record<SortOption, string> = {
    name: 'Name A-Z',
    email: 'Email',
    createdAt: 'Recently added',
  }

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 z-10">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#4285F4]" />
            <h2 className="text-lg font-semibold text-[#1F1F1F] dark:text-white">Contacts</h2>
            {!isLoading && (
              <Badge variant="secondary" className="text-xs font-medium ml-1">
                {contacts.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={() => { setFormOpen(true); setEditingContact(null) }}
            >
              <Plus className="w-5 h-5 text-[#4285F4]" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setContactsView(false)} className="h-9 w-9">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      <motion.div
        className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4"
        variants={containerStagger}
        initial="initial"
        animate="animate"
      >
        {/* Search + Filter bar */}
        <motion.div className="space-y-3" variants={fadeInUp}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl h-11 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1.5 text-xs font-medium">
                  <SortAsc className="w-3.5 h-3.5" />
                  {sortLabels[sortBy]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={() => setSortBy('name')}>
                  Name A-Z
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('email')}>
                  Email
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('createdAt')}>
                  Recently added
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Filter toggle */}
            <Button
              variant={filterBy === 'favorites' ? 'default' : 'outline'}
              size="sm"
              className={`h-9 rounded-xl gap-1.5 text-xs font-medium ${
                filterBy === 'favorites'
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : ''
              }`}
              onClick={() => setFilterBy(filterBy === 'all' ? 'favorites' : 'all')}
            >
              <Star className={`w-3.5 h-3.5 ${filterBy === 'favorites' ? 'fill-current' : ''}`} />
              {filterBy === 'favorites' ? 'Favorites' : 'All'}
            </Button>
          </div>
        </motion.div>

        {/* New Contact Button (mobile-friendly) */}
        {!isLoading && contacts.length === 0 && !searchQuery && filterBy === 'all' && (
          <motion.div variants={fadeInUp} className="text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-[#D3E3FD] dark:bg-[#4285F4]/10 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-[#4285F4]" />
            </div>
            <h3 className="text-base font-semibold text-[#1F1F1F] dark:text-white mb-1">No contacts yet</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Add your first contact to get started
            </p>
            <Button
              onClick={() => { setFormOpen(true); setEditingContact(null) }}
              className="rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white gap-2"
            >
              <Plus className="w-4 h-4" />
              New Contact
            </Button>
          </motion.div>
        )}

        {/* Empty state for search/filter */}
        {!isLoading && contacts.length === 0 && (searchQuery || filterBy === 'favorites') && (
          <motion.div variants={fadeInUp} className="text-center py-12">
            <Search className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-[#1F1F1F] dark:text-white mb-1">
              No contacts found
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {filterBy === 'favorites' ? 'No favorite contacts yet' : 'Try a different search term'}
            </p>
          </motion.div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl animate-pulse">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-32" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-48" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Contact list */}
        {!isLoading && contacts.length > 0 && (
          <AnimatePresence mode="popLayout">
            <div className="space-y-1">
              {contacts.map((contact) => (
                <motion.div
                  key={contact.id}
                  variants={listItem}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  layout
                  className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden"
                >
                  {/* Contact row */}
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpandedId(expandedId === contact.id ? null : contact.id) }}
                    onClick={() => setExpandedId(expandedId === contact.id ? null : contact.id)}
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                  >
                    {/* Avatar */}
                    <div
                      className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(contact.name)} flex items-center justify-center shrink-0`}
                    >
                      <span className="text-white text-xs font-bold">
                        {getInitials(contact.name)}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-[#1F1F1F] dark:text-white truncate">
                          {contact.name}
                        </p>
                        {contact.isFavorite && (
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {contact.email}
                      </p>
                    </div>

                    {/* Chevron indicator */}
                    <motion.div
                      animate={{ rotate: expandedId === contact.id ? 90 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </motion.div>
                  </div>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {expandedId === contact.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 space-y-3">
                          <Separator className="bg-gray-100 dark:bg-gray-800" />

                          {/* Email with compose button */}
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                            <span className="text-sm text-gray-600 dark:text-gray-300 truncate flex-1">
                              {contact.email}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2.5 rounded-lg text-xs text-[#4285F4] hover:bg-[#D3E3FD] dark:hover:bg-[#4285F4]/10 gap-1.5 shrink-0"
                              onClick={(e) => { e.stopPropagation(); handleCompose(contact) }}
                            >
                              <Send className="w-3 h-3" />
                              Compose
                            </Button>
                          </div>

                          {/* Phone */}
                          {contact.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                              <span className="text-sm text-gray-600 dark:text-gray-300">
                                {contact.phone}
                              </span>
                            </div>
                          )}

                          {/* Notes */}
                          {contact.notes && (
                            <div className="flex items-start gap-2">
                              <StickyNote className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                              <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                                {contact.notes}
                              </p>
                            </div>
                          )}

                          {/* Created date */}
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                            <span className="text-xs text-gray-400">
                              Added {formatDate(contact.createdAt)}
                            </span>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-3 rounded-lg text-xs gap-1.5"
                              onClick={(e) => { e.stopPropagation(); handleToggleFavorite(contact) }}
                            >
                              <Star className={`w-3.5 h-3.5 ${contact.isFavorite ? 'text-amber-400 fill-amber-400' : ''}`} />
                              {contact.isFavorite ? 'Unfavorite' : 'Favorite'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-3 rounded-lg text-xs gap-1.5"
                              onClick={(e) => { e.stopPropagation(); handleEdit(contact) }}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-3 rounded-lg text-xs gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900"
                              onClick={(e) => { e.stopPropagation(); setDeletingContact(contact) }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}

        {/* Bottom padding for mobile */}
        <div className="h-20 md:h-4" />
      </motion.div>

      {/* Contact Form Dialog */}
      <ContactForm
        key={editingContact?.id ?? 'new'}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingContact(null)
        }}
        contact={editingContact}
        onSave={handleSave}
        isEditing={!!editingContact}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingContact} onOpenChange={() => setDeletingContact(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#1F1F1F] dark:text-white">
              Delete Contact
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Are you sure you want to delete{' '}
            <span className="font-medium text-[#1F1F1F] dark:text-white">{deletingContact?.name}</span>?
            This action cannot be undone.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingContact(null)}
              className="rounded-xl min-w-[80px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deletingContact && handleDelete(deletingContact.id)}
              className="rounded-xl min-w-[80px]"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
