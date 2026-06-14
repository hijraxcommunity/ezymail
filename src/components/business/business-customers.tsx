'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UserPlus,
  Upload,
  Search,
  Trash2,
  Edit3,
  Loader2,
  X,
  Users,
  Mail,
  FileSpreadsheet,
  CheckCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/* ─── Types ─── */

interface Customer {
  id: string
  email: string
  name: string | null
  customFields: string | null
  createdAt: string
}

/* ─── Loading Skeleton ─── */

function CustomersSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div className="space-y-2">
          <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg w-48 animate-pulse" />
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-lg w-32 animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
          <div className="h-9 w-28 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
        </div>
      </div>
      <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse w-80" />
      <div className="rounded-xl border border-gray-200 dark:border-gray-800">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-40 animate-pulse" />
              <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-52 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Main Component ─── */

export function BusinessCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/business/customers')
      if (res.ok) {
        const data = await res.json()
        setCustomers(data.customers || [])
      } else {
        toast.error('Failed to load customers')
      }
    } catch (err) {
      console.error('Failed to fetch customers:', err)
      toast.error('Failed to load customers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  // Filter customers by search
  const filteredCustomers = customers.filter((c) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      c.email.toLowerCase().includes(q) ||
      (c.name && c.name.toLowerCase().includes(q))
    )
  })

  async function handleAddCustomer() {
    if (!addEmail.trim()) {
      toast.error('Email is required')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(addEmail.trim())) {
      toast.error('Please enter a valid email address')
      return
    }

    setAdding(true)
    try {
      const res = await fetch('/api/business/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: addEmail.trim(),
          name: addName.trim() || null,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        toast.success(`Customer "${data.customer.email}" added`)
        setAddEmail('')
        setAddName('')
        setShowAddForm(false)
        fetchCustomers()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to add customer')
      }
    } catch (err) {
      console.error('Failed to add customer:', err)
      toast.error('Failed to add customer')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/business/customers/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        toast.success('Customer deleted')
        setCustomers((prev) => prev.filter((c) => c.id !== id))
        setConfirmDeleteId(null)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete customer')
      }
    } catch (err) {
      console.error('Failed to delete customer:', err)
      toast.error('Failed to delete customer')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleCSVImport() {
    if (!fileInputRef.current?.files?.length) return

    const file = fileInputRef.current.files[0]
    setImporting(true)

    try {
      const text = await file.text()
      const res = await fetch('/api/business/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text }),
      })

      if (res.ok) {
        const data = await res.json()
        toast.success(`Imported ${data.imported} customers (${data.skipped || 0} skipped)`)
        if (data.errors?.length) {
          toast.warning(`${data.errors.length} rows had errors`)
        }
        fetchCustomers()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to import CSV')
      }
    } catch (err) {
      console.error('Failed to import CSV:', err)
      toast.error('Failed to import CSV')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function parseCustomFields(fieldsStr: string | null): Record<string, string> {
    if (!fieldsStr) return {}
    try {
      return JSON.parse(fieldsStr)
    } catch {
      return {}
    }
  }

  if (loading) return <CustomersSkeleton />

  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Customers</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {customers.length} customer{customers.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="rounded-xl"
          >
            {importing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Import CSV
          </Button>
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            className="rounded-xl bg-[#4285F4] hover:bg-[#4285F4]/90 text-white"
          >
            <UserPlus className="w-4 h-4" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleCSVImport}
        className="hidden"
      />

      {/* ─── Add Customer Form ─── */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                Add New Customer
              </h4>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
                    Name (optional)
                  </label>
                  <Input
                    placeholder="John Doe"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
                    Email
                  </label>
                  <Input
                    type="email"
                    placeholder="customer@example.com"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomer()}
                    className="rounded-xl"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleAddCustomer}
                    disabled={adding}
                    className="rounded-xl bg-[#4285F4] hover:bg-[#4285F4]/90 text-white"
                  >
                    {adding ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    Add
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setShowAddForm(false); setAddName(''); setAddEmail('') }}
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

      {/* ─── Search ─── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search customers by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 rounded-xl max-w-sm"
        />
      </div>

      {/* ─── Customers Table ─── */}
      <div className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-200 dark:border-gray-800">
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Name</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Email</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Custom Fields</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400">Added</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((customer, index) => {
                const customFields = parseCustomFields(customer.customFields)
                const fieldEntries = Object.entries(customFields)

                return (
                  <motion.tr
                    key={customer.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#34A853]/10 flex items-center justify-center shrink-0">
                          <span className="text-[#34A853] text-xs font-semibold">
                            {(customer.name || customer.email).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {customer.name || '—'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600 dark:text-gray-300">{customer.email}</span>
                    </TableCell>
                    <TableCell>
                      {fieldEntries.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {fieldEntries.slice(0, 3).map(([key, val]) => (
                            <Badge
                              key={key}
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {key}: {String(val).length > 12 ? String(val).slice(0, 12) + '...' : val}
                            </Badge>
                          ))}
                          {fieldEntries.length > 3 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              +{fieldEntries.length - 3}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(customer.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {confirmDeleteId === customer.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-[11px] text-[#EA4335]">Delete?</span>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(customer.id)}
                            disabled={deletingId === customer.id}
                            className="h-7 text-[11px] px-2 rounded-lg"
                          >
                            {deletingId === customer.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3 h-3" />
                            )}
                            Yes
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteId(null)}
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
                              setAddName(customer.name || '')
                              setAddEmail(customer.email)
                              setShowAddForm(true)
                            }}
                            className="h-7 text-[11px] rounded-lg"
                          >
                            <Edit3 className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteId(customer.id)}
                            className="h-7 text-[11px] text-[#EA4335] hover:text-[#EA4335] hover:bg-[#EA4335]/10 rounded-lg"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </motion.tr>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <Users className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {searchQuery ? 'No customers match your search' : 'No customers yet'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {searchQuery
                      ? 'Try a different search term'
                      : 'Add customers individually or import from CSV'}
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
