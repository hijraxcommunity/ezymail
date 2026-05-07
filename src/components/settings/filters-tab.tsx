'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Filter, Plus, Trash2, Edit, ChevronUp, ChevronDown,
  GripVertical, Play, X, Loader2, FolderInput, Mail,
  FileText, Paperclip, Star, Archive, Trash,
  MailOpen, Tag, Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

// ─── Types ──────────────────────────────────────────────────────────────────

interface RuleCondition {
  field: string
  operator: string
  value: string
}

interface RuleAction {
  type: string
  value?: string
}

interface Rule {
  id: string
  name: string
  conditions: string
  actions: string
  isEnabled: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

interface FolderOption {
  id: string
  name: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CONDITION_FIELDS = [
  { value: 'from', label: 'From' },
  { value: 'to', label: 'To' },
  { value: 'subject', label: 'Subject' },
  { value: 'body', label: 'Body' },
  { value: 'hasAttachment', label: 'Has Attachment' },
] as const

const CONDITION_OPERATORS = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'startsWith', label: 'Starts with' },
  { value: 'endsWith', label: 'Ends with' },
] as const

const ACTION_TYPES = [
  { value: 'moveToFolder', label: 'Move to Folder' },
  { value: 'markAsRead', label: 'Mark as Read' },
  { value: 'star', label: 'Star' },
  { value: 'delete', label: 'Delete' },
  { value: 'archive', label: 'Archive' },
] as const

const FIELD_ICONS: Record<string, React.ReactNode> = {
  from: <Mail className="w-3.5 h-3.5" />,
  to: <Mail className="w-3.5 h-3.5" />,
  subject: <FileText className="w-3.5 h-3.5" />,
  body: <FileText className="w-3.5 h-3.5" />,
  hasAttachment: <Paperclip className="w-3.5 h-3.5" />,
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  moveToFolder: <FolderInput className="w-3.5 h-3.5" />,
  markAsRead: <MailOpen className="w-3.5 h-3.5" />,
  star: <Star className="w-3.5 h-3.5" />,
  delete: <Trash className="w-3.5 h-3.5" />,
  archive: <Archive className="w-3.5 h-3.5" />,
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseConditions(raw: string): RuleCondition[] {
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function parseActions(raw: string): RuleAction[] {
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function summarizeCondition(cond: RuleCondition): string {
  if (cond.field === 'hasAttachment') {
    return cond.value === 'true' ? 'Has attachment' : 'No attachment'
  }
  const fieldLabel = CONDITION_FIELDS.find(f => f.value === cond.field)?.label || cond.field
  const opLabel = CONDITION_OPERATORS.find(o => o.value === cond.operator)?.label || cond.operator
  return `${fieldLabel} ${opLabel.toLowerCase()} "${cond.value}"`
}

function summarizeAction(action: RuleAction): string {
  const typeLabel = ACTION_TYPES.find(a => a.value === action.type)?.label || action.type
  if (action.type === 'moveToFolder' && action.value) {
    return `${typeLabel} → ${action.value}`
  }
  return typeLabel
}

function getActionTypeColor(type: string): string {
  switch (type) {
    case 'moveToFolder': return 'bg-[#4285F4]/10 text-[#4285F4] border-[#4285F4]/20'
    case 'markAsRead': return 'bg-[#34A853]/10 text-[#34A853] border-[#34A853]/20'
    case 'star': return 'bg-[#FBBC04]/10 text-[#B8860B] border-[#FBBC04]/20'
    case 'delete': return 'bg-[#EA4335]/10 text-[#EA4335] border-[#EA4335]/20'
    case 'archive': return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
    default: return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
  }
}

// ─── Animation variants ─────────────────────────────────────────────────────

const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
}

const containerStagger = {
  animate: { transition: { staggerChildren: 0.06 } },
}

const itemFadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' as const } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15 } },
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function FiltersTab() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [folders, setFolders] = useState<FolderOption[]>([])

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<Rule | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [ruleName, setRuleName] = useState('')
  const [conditions, setConditions] = useState<RuleCondition[]>([{ field: 'from', operator: 'contains', value: '' }])
  const [actions, setActions] = useState<RuleAction[]>([{ type: 'moveToFolder', value: '' }])
  const [ruleEnabled, setRuleEnabled] = useState(true)

  // Running state
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null)

  // Load rules and folders
  const loadRules = useCallback(async () => {
    try {
      const res = await fetch('/api/rules')
      if (res.ok) {
        const data = await res.json()
        setRules(data.data || [])
      }
    } catch {
      toast.error('Failed to load filters')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/folders')
      if (res.ok) {
        const data = await res.json()
        const folderList = (data.folders || []).map((f: { id: string; name: string }) => ({
          id: f.id,
          name: f.name,
        }))
        setFolders(folderList)
      }
    } catch {
      // Non-critical
    }
  }, [])

  useEffect(() => {
    loadRules()
    loadFolders()
  }, [loadRules, loadFolders])

  // ─── Dialog handlers ────────────────────────────────────────────────────

  const openCreateDialog = () => {
    setEditingRule(null)
    setRuleName('')
    setConditions([{ field: 'from', operator: 'contains', value: '' }])
    setActions([{ type: 'moveToFolder', value: '' }])
    setRuleEnabled(true)
    setDialogOpen(true)
  }

  const openEditDialog = (rule: Rule) => {
    setEditingRule(rule)
    setRuleName(rule.name)
    setConditions(parseConditions(rule.conditions))
    setActions(parseActions(rule.actions))
    setRuleEnabled(rule.isEnabled)
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingRule(null)
  }

  // ─── Condition handlers ─────────────────────────────────────────────────

  const updateCondition = (index: number, field: keyof RuleCondition, value: string) => {
    setConditions(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      // Reset value when switching to/from hasAttachment
      if (field === 'field') {
        if (value === 'hasAttachment') {
          updated[index].value = 'true'
          updated[index].operator = 'equals'
        } else if (prev[index].field === 'hasAttachment') {
          updated[index].value = ''
          updated[index].operator = 'contains'
        }
      }
      return updated
    })
  }

  const addCondition = () => {
    setConditions(prev => [...prev, { field: 'from', operator: 'contains', value: '' }])
  }

  const removeCondition = (index: number) => {
    setConditions(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)
  }

  // ─── Action handlers ────────────────────────────────────────────────────

  const updateAction = (index: number, field: keyof RuleAction, value: string) => {
    setActions(prev => {
      const updated = [...prev]
      if (field === 'type') {
        updated[index] = { type: value, value: value === 'moveToFolder' ? '' : undefined }
      } else {
        updated[index] = { ...updated[index], [field]: value }
      }
      return updated
    })
  }

  const addAction = () => {
    setActions(prev => [...prev, { type: 'markAsRead' }])
  }

  const removeAction = (index: number) => {
    setActions(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)
  }

  // ─── Save handler ───────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!ruleName.trim()) {
      toast.error('Rule name is required')
      return
    }

    const hasEmptyCondition = conditions.some(c => c.field !== 'hasAttachment' && !c.value.trim())
    if (hasEmptyCondition) {
      toast.error('All condition values are required')
      return
    }

    const moveToFolderAction = actions.find(a => a.type === 'moveToFolder')
    if (moveToFolderAction && !moveToFolderAction.value?.trim()) {
      toast.error('Please select a folder for the "Move to Folder" action')
      return
    }

    setSaving(true)
    try {
      const body = {
        name: ruleName.trim(),
        conditions: JSON.stringify(conditions),
        actions: JSON.stringify(actions),
        isEnabled: ruleEnabled,
      }

      let res: Response
      if (editingRule) {
        res = await fetch(`/api/rules/${editingRule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        res = await fetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }

      if (res.ok) {
        toast.success(editingRule ? 'Filter updated' : 'Filter created')
        closeDialog()
        loadRules()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save filter')
      }
    } catch {
      toast.error('Failed to save filter')
    } finally {
      setSaving(false)
    }
  }

  // ─── Delete handler ─────────────────────────────────────────────────────

  const handleDelete = async (ruleId: string) => {
    try {
      const res = await fetch(`/api/rules/${ruleId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Filter deleted')
        loadRules()
      } else {
        toast.error('Failed to delete filter')
      }
    } catch {
      toast.error('Failed to delete filter')
    }
  }

  // ─── Toggle handler ─────────────────────────────────────────────────────

  const handleToggle = async (rule: Rule) => {
    try {
      const res = await fetch(`/api/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !rule.isEnabled }),
      })
      if (res.ok) {
        loadRules()
      } else {
        toast.error('Failed to update filter')
      }
    } catch {
      toast.error('Failed to update filter')
    }
  }

  // ─── Run handler ────────────────────────────────────────────────────────

  const handleRun = async (ruleId: string) => {
    setRunningRuleId(ruleId)
    try {
      const res = await fetch(`/api/rules/${ruleId}/run`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        const d = data.data
        toast.success(`Rule applied: ${d.matchingEmails} email(s) matched, ${d.totalAffected} action(s) taken`)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to run filter')
      }
    } catch {
      toast.error('Failed to run filter')
    } finally {
      setRunningRuleId(null)
    }
  }

  // ─── Reorder handlers ───────────────────────────────────────────────────

  const handleMoveUp = async (index: number) => {
    if (index === 0) return
    const reordered = [...rules]
    ;[reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]]

    // Optimistic update
    setRules(reordered)

    try {
      await Promise.all([
        fetch(`/api/rules/${reordered[index].id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: index }),
        }),
        fetch(`/api/rules/${reordered[index - 1].id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: index - 1 }),
        }),
      ])
    } catch {
      loadRules() // Revert on error
    }
  }

  const handleMoveDown = async (index: number) => {
    if (index >= rules.length - 1) return
    const reordered = [...rules]
    ;[reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]]

    setRules(reordered)

    try {
      await Promise.all([
        fetch(`/api/rules/${reordered[index].id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: index }),
        }),
        fetch(`/api/rules/${reordered[index + 1].id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: index + 1 }),
        }),
      ])
    } catch {
      loadRules()
    }
  }

  // ─── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-4 pb-8">
        {[1, 2, 3].map(i => (
          <Card key={i} className="rounded-xl border-gray-100 dark:border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-5 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 animate-pulse" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-2/3 animate-pulse" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-4 pb-8">
        {/* Header */}
        <motion.div className="flex items-center justify-between" {...fadeInUp}>
          <div>
            <h3 className="text-base font-semibold text-[#1F1F1F] dark:text-white flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#4285F4]" />
              Email Filters
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Automatically organize your inbox with rules
            </p>
          </div>
          <Button
            onClick={openCreateDialog}
            size="sm"
            className="h-9 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium gap-1.5"
          >
            <Plus className="w-4 h-4" />
            New Filter
          </Button>
        </motion.div>

        <Separator />

        {/* Rules List */}
        <motion.div
          variants={containerStagger}
          initial="initial"
          animate="animate"
          className="space-y-3"
        >
          <AnimatePresence mode="popLayout">
            {rules.length === 0 ? (
              <motion.div
                key="empty"
                variants={itemFadeIn}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col items-center justify-center py-12 text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                  <Filter className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-[#1F1F1F] dark:text-white">
                  No filters yet
                </p>
                <p className="text-xs text-gray-500 mt-1 max-w-[240px]">
                  Create one to automatically organize your emails.
                </p>
                <Button
                  onClick={openCreateDialog}
                  size="sm"
                  variant="outline"
                  className="mt-4 h-9 rounded-xl gap-1.5 border-[#4285F4]/30 text-[#4285F4] hover:bg-[#4285F4]/5"
                >
                  <Plus className="w-4 h-4" />
                  Create Filter
                </Button>
              </motion.div>
            ) : (
              rules.map((rule, index) => {
                const parsedConditions = parseConditions(rule.conditions)
                const parsedActions = parseActions(rule.actions)

                return (
                  <motion.div
                    key={rule.id}
                    layout
                    variants={itemFadeIn}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <Card className={`rounded-xl border transition-colors ${
                      rule.isEnabled
                        ? 'border-gray-100 dark:border-gray-800'
                        : 'border-gray-100 dark:border-gray-800 opacity-60'
                    }`}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {/* Drag handle & reorder */}
                          <div className="flex flex-col items-center gap-0.5 pt-1">
                            <button
                              type="button"
                              onClick={() => handleMoveUp(index)}
                              disabled={index === 0}
                              className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-20 transition-colors cursor-pointer"
                              aria-label="Move up"
                            >
                              <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                            <GripVertical className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
                            <button
                              type="button"
                              onClick={() => handleMoveDown(index)}
                              disabled={index === rules.length - 1}
                              className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-20 transition-colors cursor-pointer"
                              aria-label="Move down"
                            >
                              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-sm font-medium text-[#1F1F1F] dark:text-white truncate">
                                {rule.name}
                              </h4>
                              <Switch
                                checked={rule.isEnabled}
                                onCheckedChange={() => handleToggle(rule)}
                                className="shrink-0 scale-90"
                              />
                            </div>

                            {/* Conditions summary */}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {parsedConditions.map((cond, ci) => (
                                <Badge
                                  key={ci}
                                  variant="outline"
                                  className="text-[11px] px-2 py-0.5 rounded-md bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 gap-1"
                                >
                                  {FIELD_ICONS[cond.field]}
                                  {summarizeCondition(cond).length > 30
                                    ? summarizeCondition(cond).slice(0, 30) + '...'
                                    : summarizeCondition(cond)}
                                </Badge>
                              ))}
                            </div>

                            {/* Actions summary */}
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {parsedActions.map((action, ai) => (
                                <Badge
                                  key={ai}
                                  variant="outline"
                                  className={`text-[11px] px-2 py-0.5 rounded-md gap-1 border ${getActionTypeColor(action.type)}`}
                                >
                                  {ACTION_ICONS[action.type]}
                                  {summarizeAction(action).length > 25
                                    ? summarizeAction(action).slice(0, 25) + '...'
                                    : summarizeAction(action)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRun(rule.id)}
                            disabled={runningRuleId === rule.id || !rule.isEnabled}
                            className="h-8 px-2.5 text-xs text-gray-500 hover:text-[#34A853] gap-1"
                          >
                            {runningRuleId === rule.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Play className="w-3.5 h-3.5" />
                            }
                            Run
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(rule)}
                            className="h-8 px-2.5 text-xs text-gray-500 hover:text-[#4285F4] gap-1"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(rule.id)}
                            className="h-8 px-2.5 text-xs text-gray-500 hover:text-[#EA4335] gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })
            )}
          </AnimatePresence>
        </motion.div>

        {/* Hint */}
        {rules.length > 0 && (
          <motion.div {...fadeInUp} className="text-center">
            <p className="text-[11px] text-gray-400">
              Rules are evaluated in order from top to bottom
            </p>
          </motion.div>
        )}
      </div>

      {/* ─── Create/Edit Dialog ────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent className="sm:max-w-[540px] max-h-[85vh] overflow-y-auto custom-scrollbar rounded-xl p-0">
          <div className="p-5 sm:p-6 space-y-5">
            <DialogHeader>
              <DialogTitle className="text-lg">
                {editingRule ? 'Edit Filter' : 'Create New Filter'}
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-500">
                {editingRule
                  ? 'Update your email filter rules and actions.'
                  : 'Set conditions and actions to automatically organize incoming emails.'}
              </DialogDescription>
            </DialogHeader>

            {/* Rule Name */}
            <div className="space-y-1.5">
              <Label htmlFor="rule-name" className="text-sm font-medium">Filter Name</Label>
              <Input
                id="rule-name"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="e.g., Spam Filter"
                className="h-10 rounded-xl"
              />
            </div>

            <Separator />

            {/* Conditions Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Tag className="w-4 h-4 text-[#4285F4]" />
                  Conditions
                  <span className="text-[11px] text-gray-400 font-normal">(all must match)</span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCondition}
                  className="h-7 text-xs rounded-lg gap-1 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:text-[#4285F4] hover:border-[#4285F4]"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {conditions.map((cond, index) => (
                    <motion.div
                      key={index}
                      layout
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800"
                    >
                      {/* Field */}
                      <Select
                        value={cond.field}
                        onValueChange={(v) => updateCondition(index, 'field', v)}
                      >
                        <SelectTrigger size="sm" className="w-[120px] rounded-lg h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITION_FIELDS.map(f => (
                            <SelectItem key={f.value} value={f.value} className="text-xs">
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Operator (hidden for hasAttachment) */}
                      {cond.field !== 'hasAttachment' ? (
                        <Select
                          value={cond.operator}
                          onValueChange={(v) => updateCondition(index, 'operator', v)}
                        >
                          <SelectTrigger size="sm" className="w-[120px] rounded-lg h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITION_OPERATORS.map(o => (
                              <SelectItem key={o.value} value={o.value} className="text-xs">
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="w-[120px] h-8 flex items-center px-3 text-xs text-gray-400 rounded-lg bg-gray-100 dark:bg-gray-800">
                          is
                        </div>
                      )}

                      {/* Value */}
                      {cond.field === 'hasAttachment' ? (
                        <Switch
                          checked={cond.value === 'true'}
                          onCheckedChange={(checked) => updateCondition(index, 'value', checked ? 'true' : 'false')}
                          className="scale-90"
                        />
                      ) : (
                        <Input
                          value={cond.value}
                          onChange={(e) => updateCondition(index, 'value', e.target.value)}
                          placeholder="Value..."
                          className="flex-1 h-8 rounded-lg text-xs min-w-0"
                        />
                      )}

                      {/* Remove */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCondition(index)}
                        disabled={conditions.length <= 1}
                        className="h-7 w-7 shrink-0 text-gray-400 hover:text-[#EA4335] disabled:opacity-20"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <Separator />

            {/* Actions Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Play className="w-4 h-4 text-[#34A853]" />
                  Actions
                  <span className="text-[11px] text-gray-400 font-normal">(all are applied)</span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addAction}
                  className="h-7 text-xs rounded-lg gap-1 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:text-[#34A853] hover:border-[#34A853]"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {actions.map((action, index) => (
                    <motion.div
                      key={index}
                      layout
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800"
                    >
                      {/* Action type */}
                      <Select
                        value={action.type}
                        onValueChange={(v) => updateAction(index, 'type', v)}
                      >
                        <SelectTrigger size="sm" className="w-[160px] rounded-lg h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACTION_TYPES.map(a => (
                            <SelectItem key={a.value} value={a.value} className="text-xs">
                              {a.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Value (only for moveToFolder) */}
                      {action.type === 'moveToFolder' ? (
                        <Select
                          value={action.value || ''}
                          onValueChange={(v) => updateAction(index, 'value', v)}
                        >
                          <SelectTrigger size="sm" className="flex-1 rounded-lg h-8 text-xs min-w-0">
                            <SelectValue placeholder="Select folder..." />
                          </SelectTrigger>
                          <SelectContent>
                            {folders.length > 0 ? (
                              folders.map(f => (
                                <SelectItem key={f.id} value={f.id} className="text-xs">
                                  {f.name}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="inbox" className="text-xs">Inbox</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex-1" />
                      )}

                      {/* Remove */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeAction(index)}
                        disabled={actions.length <= 1}
                        className="h-7 w-7 shrink-0 text-gray-400 hover:text-[#EA4335] disabled:opacity-20"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <Separator />

            {/* Enable Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Enable this filter</Label>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Disabled filters are skipped during email processing
                </p>
              </div>
              <Switch
                checked={ruleEnabled}
                onCheckedChange={setRuleEnabled}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 dark:border-gray-800 px-5 sm:px-6 py-4 flex items-center justify-between gap-3">
            {editingRule && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleRun(editingRule.id)}
                disabled={runningRuleId === editingRule.id || !ruleEnabled}
                className="h-9 rounded-xl gap-1.5 text-xs border-[#34A853]/30 text-[#34A853] hover:bg-[#34A853]/5 hover:text-[#34A853]"
              >
                {runningRuleId === editingRule.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Play className="w-3.5 h-3.5" />
                }
                Run on Existing Emails
              </Button>
            )}
            {!editingRule && <div />}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={closeDialog}
                className="h-9 rounded-xl text-sm"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="h-9 rounded-xl bg-[#4285F4] hover:bg-[#1a73e8] text-white font-medium text-sm gap-1.5"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
                ) : (
                  <><Save className="w-4 h-4" />Save Filter</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
