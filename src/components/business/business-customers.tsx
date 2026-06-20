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
  FileSpreadsheet,
  CheckCircle,
  UserCircle,
  TrendingUp,
  Filter,
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

/* ─── Avatar Color from Email Hash ─── */

function getAvatarColor(email: string) {
  const colors = ['#DBEAFE', '#CFD8DC', '#F3E5F5', '#FFF3E0', '#E8F5E9', '#E0F7FA', '#FCE4EC', '#F3E5F5']
  let hash = 0
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

/* ─── Loading Skeleton ─── */

function CustomersSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-28 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
      <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse w-full" />
      <div className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="w-9 h-9 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-52 animate-pulse" />
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
  const [showCSVImport, setShowCSVImport] = useState(false)
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

  // Stats
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const addedRecently = customers.filter((c) => new Date(c.createdAt) > sevenDaysAgo).length
  const totalCustomers = customers.length

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
    <div className="space-y-8">
      {/* ─── Hero Header ─── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#34A853]/10 via-[#06B6D4]/5 to-transparent ring-1 ring-[#34A853]/10 p-8"
      >
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-[#34A853]/5" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#34A853]/10 to-[#34A853]/5 flex items-center justify-center">
                <Users className="w-6 h-6 text-[#34A853]" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">Customer Management</h2>
                <p className="text-[13px] text-gray-500 dark:text-gray-400">
                  Manage your customer audience and contact lists
                </p>
              </div>
            </div>
            <div className="ml-14 mt-1">
              <Badge className="bg-[#34A853]/10 text-[#34A853] text-[11px] font-medium px-2.5 py-0.5 border-[#34A853]/15">
                {customers.length} customer{customers.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setShowCSVImport(!showCSVImport)}
              variant="outline"
              className="rounded-xl border-gray-300 dark:border-gray-700 hover:border-[#34A853] hover:text-[#34A853] hover:bg-[#34A853]/5"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </Button>
            <Button
              onClick={() => setShowAddForm(!showAddForm)}
              className="rounded-xl bg-[#34A853] hover:bg-[#34A853]/90 text-white"
            >
              <UserPlus className="w-4 h-4" />
              Add Customer
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ─── Stats Row ─── */}
      <div className="grid grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4285F4]/10 to-[#4285F4]/5 flex items-center justify-center mb-3">
            <Users className="w-4 h-4 text-[#4285F4]" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalCustomers}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Total Customers</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#34A853]/10 to-[#34A853]/5 flex items-center justify-center mb-3">
            <TrendingUp className="w-4 h-4 text-[#34A853]" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{addedRecently}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Added Recently</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FBBC04]/10 to-[#FBBC04]/5 flex items-center justify-center mb-3">
            <Filter className="w-4 h-4 text-[#FBBC04]" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{searchQuery ? filteredCustomers.length : 'All'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Search Results</p>
        </motion.div>
      </div>

      {/* ─── Search Bar ─── */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <Input
          placeholder="Search customers by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-12 pr-4 py-3 rounded-xl text-[13px] dark:bg-gray-800 h-12"
        />
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleCSVImport}
        className="hidden"
      />

      {/* ─── CSV Import Dropzone ─── */}
      <AnimatePresence>
        {showCSVImport && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <div
              onClick={() => !importing && fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-8 hover:border-[#4285F4]/50 transition-colors cursor-pointer group"
            >
              <div className="flex flex-col items-center justify-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#4285F4]/10 to-[#4285F4]/5 flex items-center justify-center mb-4 group-hover:from-[#4285F4]/15 group-hover:to-[#4285F4]/10 transition-colors">
                  {importing ? (
                    <Loader2 className="w-7 h-7 text-[#4285F4] animate-spin" />
                  ) : (
                    <Upload className="w-7 h-7 text-[#4285F4]" />
                  )}
                </div>
                <p className="text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {importing ? 'Importing...' : 'Click to upload CSV'}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  Supports CSV files with email and name columns
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Add Customer Form ─── */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <div className="rounded-2xl ring-1 ring-[#34A853]/20 bg-gradient-to-br from-white to-[#34A853]/[0.02] dark:from-gray-900 dark:to-[#34A853]/[0.02] p-6 shadow-lg shadow-[#34A853]/5 border-l-4 border-l-[#34A853]">
              <h4 className="text-[15px] font-semibold text-gray-900 dark:text-white mb-1">
                Add New Customer
              </h4>
              <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-4">
                Add a customer to your audience list manually.
              </p>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
                    Name (optional)
                  </label>
                  <Input
                    placeholder="John Doe"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    className="rounded-xl dark:bg-gray-800"
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
                    className="rounded-xl dark:bg-gray-800"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleAddCustomer}
                    disabled={adding}
                    className="rounded-xl bg-[#34A853] hover:bg-[#34A853]/90 text-white"
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

      {/* ─── Customers Table ─── */}
      <div className="rounded-2xl ring-1 ring-gray-200/80 dark:ring-gray-800/80 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</TableHead>
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</TableHead>
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Custom Fields</TableHead>
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Added</TableHead>
              <TableHead className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</TableHead>
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
                    className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-all duration-150 border-l-2 border-l-transparent hover:border-l-[#34A853]"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300 shrink-0"
                          style={{ backgroundColor: getAvatarColor(customer.email) }}
                        >
                          {(customer.name || customer.email).charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[13px] font-medium text-gray-900 dark:text-white">
                          {customer.name || '—'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-[13px] text-gray-600 dark:text-gray-400">{customer.email}</span>
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
                    <TableCell className="text-[13px] text-gray-500 dark:text-gray-400">
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
                <TableCell colSpan={5} className="text-center py-20">
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#34A853]/10 to-[#06B6D4]/5 flex items-center justify-center mb-5">
                      <UserCircle className="w-10 h-10 text-[#34A853]/40" />
                    </div>
                    <p className="text-[15px] font-semibold text-gray-700 dark:text-gray-300">
                      {searchQuery ? 'No customers match your search' : 'No customers yet'}
                    </p>
                    <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-2 max-w-md text-center leading-relaxed">
                      {searchQuery
                        ? 'Try adjusting your search terms or clearing the filter to find what you need.'
                        : 'Start building your audience by adding customers individually or importing from a CSV file.'}
                    </p>
                    {!searchQuery && (
                      <div className="flex gap-3 mt-5">
                        <Button
                          onClick={() => setShowAddForm(true)}
                          className="rounded-xl bg-[#34A853] hover:bg-[#34A853]/90 text-white"
                        >
                          <UserPlus className="w-4 h-4" />
                          Add Customer
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowCSVImport(true)}
                          className="rounded-xl"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          Import CSV
                        </Button>
                      </div>
                    )}
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