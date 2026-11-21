'use client'

/**
 * D2 (Batch 9): Labels management — create, rename, recolor and delete the
 * caller's own labels through the existing secured /api/labels endpoints
 * (mailbox-scoped since F-29). The Zustand palette is kept in sync so the
 * sidebar list, card chips and the detail "Label as" menu update live.
 * Minimal, professional: the same list → detail language the rest of
 * Settings uses, the product's own accent colors for the dots.
 */

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Tag, Plus, Loader2, Pencil, Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAppStore, type Label as MailLabel } from '@/store/use-app-store'

// Dot palette drawn from accents already used across the product UI
// (Google-style palette the app was built on).
const LABEL_COLORS = [
  '#4285F4', // blue
  '#34A853', // green
  '#FBBC04', // yellow
  '#EA4335', // red
  '#6366F1', // indigo
  '#E37400', // orange
  '#00ACC1', // cyan
  '#AB47BC', // purple
]

const fadeInUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
}

export function LabelsTabContent() {
  const labels = useAppStore((s) => s.labels)
  const setLabels = useAppStore((s) => s.setLabels)
  const addLabel = useAppStore((s) => s.addLabel)
  const updateLabel = useAppStore((s) => s.updateLabel)
  const removeLabel = useAppStore((s) => s.removeLabel)

  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(LABEL_COLORS[0])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<MailLabel | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(LABEL_COLORS[0])
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleting, setDeleting] = useState<MailLabel | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const loadLabels = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/labels')
      if (res.ok) {
        const data = await res.json()
        setLabels(data.data || [])
      }
    } catch {
      toast.error('Failed to load labels')
    } finally {
      setLoading(false)
    }
  }, [setLabels])

  useEffect(() => {
    queueMicrotask(() => void loadLabels())
  }, [loadLabels])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) {
      toast.error('Label name is required')
      return
    }
    if (name.length > 50) {
      toast.error('Label name must be 50 characters or fewer')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: newColor }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.data) {
        addLabel(data.data)
        setNewName('')
        setNewColor(LABEL_COLORS[0])
        toast.success(`Label "${name}" created`)
      } else if (res.status === 400 && data?.details?.length) {
        toast.error(data.details[0]?.message || 'Invalid label')
      } else {
        toast.error(data?.error || 'Failed to create label')
      }
    } catch {
      toast.error('Failed to create label')
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (label: MailLabel) => {
    setEditing(label)
    setEditName(label.name)
    setEditColor(label.color)
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    const name = editName.trim()
    if (!name) {
      toast.error('Label name is required')
      return
    }
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/labels/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: editColor }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.data) {
        updateLabel(editing.id, { name: data.data.name, color: data.data.color })
        toast.success('Label updated')
        setEditing(null)
      } else if (res.status === 409) {
        toast.error(data?.error || 'A label with this name already exists')
      } else {
        toast.error(data?.error || 'Failed to update label')
      }
    } catch {
      toast.error('Failed to update label')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      const res = await fetch(`/api/labels/${deleting.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        removeLabel(deleting.id)
        toast.success(`Label "${deleting.name}" deleted`)
        setDeleting(null)
      } else {
        toast.error(data?.error || 'Failed to delete label')
      }
    } catch {
      toast.error('Failed to delete label')
    } finally {
      setDeletingBusy(false)
    }
  }

  const colorRow = (value: string, onChange: (c: string) => void) => (
    <div className="flex items-center gap-2 flex-wrap">
      {LABEL_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          aria-label={`Use color ${color}`}
          className="w-6 h-6 rounded-full flex items-center justify-center transition-transform active:scale-90"
          style={{ backgroundColor: color }}
        >
          {value === color && <Check className="w-3.5 h-3.5 text-white" />}
        </button>
      ))}
    </div>
  )

  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-6 pb-8">
      <motion.div {...fadeInUp}>
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#4285F4]" />
              <h3 className="text-sm font-semibold text-[#1F1F1F] dark:text-white">New label</h3>
            </div>
            <div className="flex gap-2">
              <Input
                id="new-label-name"
                name="new-label-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Label name (e.g. Work)"
                maxLength={50}
                className="h-10 rounded-xl border-gray-200 dark:border-gray-700"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) void handleCreate()
                }}
              />
              <Button
                onClick={() => void handleCreate()}
                disabled={creating || !newName.trim()}
                className="h-10 rounded-xl bg-[#4285F4] hover:bg-[#4285F4]/90 text-white shrink-0"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create
              </Button>
            </div>
            {colorRow(newColor, setNewColor)}
            <p className="text-[11px] text-gray-400">
              Labels color-code your mail. Assign them from an email&apos;s menu; filter from the sidebar.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div {...fadeInUp} transition={{ ...fadeInUp.transition, delay: 0.05 }}>
        <Card>
          <CardContent className="p-2">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : labels.length === 0 ? (
              <div className="text-center py-10">
                <Tag className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-[13px] text-gray-500">No labels yet</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Create your first label above</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {labels.map((label) => (
                  <div key={label.id} className="flex items-center gap-3 px-2 py-3">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                    <span className="flex-1 min-w-0 text-sm text-[#1F1F1F] dark:text-gray-200 truncate">
                      {label.name}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 text-gray-400 hover:text-[#4285F4]"
                      onClick={() => openEdit(label)}
                      aria-label={`Edit label ${label.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 text-gray-400 hover:text-[#EA4335]"
                      onClick={() => setDeleting(label)}
                      aria-label={`Delete label ${label.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Rename / recolor dialog */}
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-900 dark:text-white">Edit label</DialogTitle>
            <DialogDescription className="text-[13px] text-gray-500">
              Rename or recolor — mail already carrying this label follows automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-label-name" className="text-sm text-gray-600 dark:text-gray-400">Name</Label>
              <Input
                id="edit-label-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={50}
                className="h-10 rounded-xl border-gray-200 dark:border-gray-700"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-600 dark:text-gray-400">Color</Label>
              {colorRow(editColor, setEditColor)}
            </div>
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} className="rounded-xl">Cancel</Button>
            <Button
              onClick={() => void handleSaveEdit()}
              disabled={savingEdit || !editName.trim()}
              className="rounded-xl bg-[#4285F4] hover:bg-[#4285F4]/90 text-white"
            >
              {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Delete label &quot;{deleting?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              The label is removed from every email that carries it. The emails themselves are not touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              className="rounded-xl bg-[#EA4335] hover:bg-[#EA4335]/90"
            >
              {deletingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
