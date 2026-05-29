'use client'

import { useState } from 'react'
import { Filter, X, Bookmark, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { useAppStore, type SavedSearch } from '@/store/use-app-store'

interface AdvancedSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SearchFormState {
  query: string
  from: string
  to: string
  subject: string
  body: string
  hasAttachment: boolean
  isUnread: boolean
  isStarred: boolean
  before: string
  after: string
  folder: string
  label: string
}

const defaultForm: SearchFormState = {
  query: '',
  from: '',
  to: '',
  subject: '',
  body: '',
  hasAttachment: false,
  isUnread: false,
  isStarred: false,
  before: '',
  after: '',
  folder: '',
  label: '',
}

function hasActiveFilters(form: SearchFormState): boolean {
  return !!(
    form.from ||
    form.to ||
    form.subject ||
    form.body ||
    form.hasAttachment ||
    form.isUnread ||
    form.isStarred ||
    form.before ||
    form.after ||
    form.folder ||
    form.label ||
    form.query
  )
}

function buildQueryDescription(form: SearchFormState): string {
  const parts: string[] = []
  if (form.from) parts.push(`from:${form.from}`)
  if (form.to) parts.push(`to:${form.to}`)
  if (form.subject) parts.push(`subject:${form.subject}`)
  if (form.body) parts.push(`body: ${form.body}`)
  if (form.hasAttachment) parts.push('has:attachment')
  if (form.isUnread) parts.push('is:unread')
  if (form.isStarred) parts.push('is:starred')
  if (form.before) parts.push(`before:${form.before}`)
  if (form.after) parts.push(`after:${form.after}`)
  if (form.folder) parts.push(`folder:${form.folder}`)
  if (form.label) parts.push(`label:${form.label}`)
  return parts.join(' ')
}

export function AdvancedSearchDialog({ open, onOpenChange }: AdvancedSearchDialogProps) {
  const { setSearchQuery, addRecentSearch, addSavedSearch } = useAppStore()
  const [form, setForm] = useState<SearchFormState>({ ...defaultForm })
  const [saveName, setSaveName] = useState('')
  const [showSave, setShowSave] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  const updateField = (key: keyof SearchFormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleReset = () => {
    setForm({ ...defaultForm })
    setSaveName('')
    setShowSave(false)
  }

  const executeAdvancedSearch = async (searchForm: SearchFormState) => {
    setIsSearching(true)
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchForm),
      })
      const data = await res.json()
      if (res.ok) {
        useAppStore.getState().setSearchResults(data.results || [])
        useAppStore.getState().setSearchTotal(data.total || 0)
        useAppStore.getState().setSearchOperators(data.operators || null)
        useAppStore.getState().setCurrentFolder('search')

        // Build a readable query for the search bar
        const desc = searchForm.query || buildQueryDescription(searchForm) || 'Advanced Search'
        setSearchQuery(desc)
        addRecentSearch(desc)

        onOpenChange(false)
        toast.success(`Found ${data.total} result${data.total !== 1 ? 's' : ''}`)
      } else {
        toast.error(data.error || 'Search failed')
      }
    } catch {
      toast.error('Search failed')
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearch = () => {
    if (!hasActiveFilters(form)) {
      toast.error('Please enter at least one search criteria')
      return
    }
    executeAdvancedSearch(form)
  }

  const handleSave = () => {
    if (!saveName.trim()) {
      toast.error('Please enter a name for the saved search')
      return
    }
    if (!hasActiveFilters(form)) {
      toast.error('Please enter at least one search criteria to save')
      return
    }
    const saved: SavedSearch = {
      id: crypto.randomUUID(),
      name: saveName.trim(),
      query: form.query,
      from: form.from,
      to: form.to,
      subject: form.subject,
      body: form.body,
      hasAttachment: form.hasAttachment,
      isUnread: form.isUnread,
      isStarred: form.isStarred,
      before: form.before,
      after: form.after,
      folder: form.folder,
      label: form.label,
      createdAt: new Date().toISOString(),
    }
    addSavedSearch(saved)
    setSaveName('')
    setShowSave(false)
    toast.success(`Search saved as "${saved.name}"`)
  }

  // Count active filters for badge display
  const activeCount = [
    form.from, form.to, form.subject, form.body, form.before, form.after,
    form.folder, form.label, form.hasAttachment, form.isUnread, form.isStarred, form.query,
  ].filter(Boolean).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-[#1F1F1F] dark:text-white flex items-center gap-2">
              <Filter className="w-5 h-5 text-[#4285F4]" />
              Advanced Search
            </DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-gray-500 h-7 px-2"
              onClick={handleReset}
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset
            </Button>
          </div>
        </DialogHeader>

        <div className="px-6 space-y-4 pb-6">
          {/* General query */}
          <div className="space-y-1.5">
            <Label htmlFor="adv-query" className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Search Query
            </Label>
            <Input
              id="adv-query"
              placeholder='e.g. "from:ahmad is:unread" or plain text'
              value={form.query}
              onChange={(e) => updateField('query', e.target.value)}
              className="h-9 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch()
              }}
            />
          </div>

          <Separator className="my-2" />

          {/* From / To row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adv-from" className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                From
              </Label>
              <Input
                id="adv-from"
                placeholder="sender name or email"
                value={form.from}
                onChange={(e) => updateField('from', e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adv-to" className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                To
              </Label>
              <Input
                id="adv-to"
                placeholder="recipient name or email"
                value={form.to}
                onChange={(e) => updateField('to', e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Subject / Body row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adv-subject" className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Subject contains
              </Label>
              <Input
                id="adv-subject"
                placeholder="in subject line..."
                value={form.subject}
                onChange={(e) => updateField('subject', e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adv-body" className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Body contains
              </Label>
              <Input
                id="adv-body"
                placeholder="in email body..."
                value={form.body}
                onChange={(e) => updateField('body', e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Date range row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adv-after" className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                After
              </Label>
              <Input
                id="adv-after"
                type="date"
                value={form.after}
                onChange={(e) => updateField('after', e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adv-before" className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Before
              </Label>
              <Input
                id="adv-before"
                type="date"
                value={form.before}
                onChange={(e) => updateField('before', e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Folder / Label row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adv-folder" className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Folder
              </Label>
              <Input
                id="adv-folder"
                placeholder="inbox, sent, drafts..."
                value={form.folder}
                onChange={(e) => updateField('folder', e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adv-label" className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Label
              </Label>
              <Input
                id="adv-label"
                placeholder="label name..."
                value={form.label}
                onChange={(e) => updateField('label', e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <Separator className="my-2" />

          {/* Boolean toggles */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="adv-attachment"
                checked={form.hasAttachment}
                onCheckedChange={(checked) => updateField('hasAttachment', !!checked)}
                className="size-4"
              />
              <Label htmlFor="adv-attachment" className="text-sm cursor-pointer">
                Has attachment
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="adv-unread"
                checked={form.isUnread}
                onCheckedChange={(checked) => updateField('isUnread', !!checked)}
                className="size-4"
              />
              <Label htmlFor="adv-unread" className="text-sm cursor-pointer">
                Is unread
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="adv-starred"
                checked={form.isStarred}
                onCheckedChange={(checked) => updateField('isStarred', !!checked)}
                className="size-4"
              />
              <Label htmlFor="adv-starred" className="text-sm cursor-pointer">
                Is starred
              </Label>
            </div>
          </div>

          {/* Active filter badges */}
          {activeCount > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {form.from && (
                <Badge variant="secondary" className="text-xs gap-1 bg-[#D3E3FD] dark:bg-[#4285F4]/20 text-[#4285F4]">
                  from:{form.from}
                  <button type="button" onClick={() => updateField('from', '')} className="ml-0.5 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {form.to && (
                <Badge variant="secondary" className="text-xs gap-1 bg-[#D3E3FD] dark:bg-[#4285F4]/20 text-[#4285F4]">
                  to:{form.to}
                  <button type="button" onClick={() => updateField('to', '')} className="ml-0.5 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {form.subject && (
                <Badge variant="secondary" className="text-xs gap-1 bg-[#D3E3FD] dark:bg-[#4285F4]/20 text-[#4285F4]">
                  subject:{form.subject}
                  <button type="button" onClick={() => updateField('subject', '')} className="ml-0.5 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {form.body && (
                <Badge variant="secondary" className="text-xs gap-1 bg-[#D3E3FD] dark:bg-[#4285F4]/20 text-[#4285F4]">
                  body:{form.body}
                  <button type="button" onClick={() => updateField('body', '')} className="ml-0.5 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {form.hasAttachment && (
                <Badge variant="secondary" className="text-xs gap-1 bg-[#D3E3FD] dark:bg-[#4285F4]/20 text-[#4285F4]">
                  has:attachment
                  <button type="button" onClick={() => updateField('hasAttachment', false)} className="ml-0.5 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {form.isUnread && (
                <Badge variant="secondary" className="text-xs gap-1 bg-[#D3E3FD] dark:bg-[#4285F4]/20 text-[#4285F4]">
                  is:unread
                  <button type="button" onClick={() => updateField('isUnread', false)} className="ml-0.5 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {form.isStarred && (
                <Badge variant="secondary" className="text-xs gap-1 bg-[#D3E3FD] dark:bg-[#4285F4]/20 text-[#4285F4]">
                  is:starred
                  <button type="button" onClick={() => updateField('isStarred', false)} className="ml-0.5 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {form.after && (
                <Badge variant="secondary" className="text-xs gap-1 bg-[#D3E3FD] dark:bg-[#4285F4]/20 text-[#4285F4]">
                  after:{form.after}
                  <button type="button" onClick={() => updateField('after', '')} className="ml-0.5 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {form.before && (
                <Badge variant="secondary" className="text-xs gap-1 bg-[#D3E3FD] dark:bg-[#4285F4]/20 text-[#4285F4]">
                  before:{form.before}
                  <button type="button" onClick={() => updateField('before', '')} className="ml-0.5 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {form.folder && (
                <Badge variant="secondary" className="text-xs gap-1 bg-[#D3E3FD] dark:bg-[#4285F4]/20 text-[#4285F4]">
                  folder:{form.folder}
                  <button type="button" onClick={() => updateField('folder', '')} className="ml-0.5 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {form.label && (
                <Badge variant="secondary" className="text-xs gap-1 bg-[#D3E3FD] dark:bg-[#4285F4]/20 text-[#4285F4]">
                  label:{form.label}
                  <button type="button" onClick={() => updateField('label', '')} className="ml-0.5 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}

          <Separator className="my-2" />

          {/* Save search section */}
          {!showSave ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-gray-500 h-8"
              onClick={() => setShowSave(true)}
            >
              <Bookmark className="w-3.5 h-3.5 mr-1.5" />
              Save this search
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search name..."
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="h-8 text-sm flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') setShowSave(false)
                }}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                onClick={handleSave}
              >
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-gray-500"
                onClick={() => { setShowSave(false); setSaveName('') }}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              className="flex-1 h-10 bg-[#4285F4] hover:bg-[#1a73e8] text-white"
              onClick={handleSearch}
              disabled={isSearching || !hasActiveFilters(form)}
            >
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
