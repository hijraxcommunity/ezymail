'use client'

/**
 * WhatsApp/Google-style country code picker for the signup WhatsApp number.
 * Click the flag+code button -> searchable list of every country with its
 * flag and dial code -> picking one sets the dial code.
 * Flags render as images (flagcdn) so they appear on every OS — Windows
 * cannot render flag emoji natively; if the image fails we fall back to
 * the emoji derived from the ISO code.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { COUNTRIES, findCountryByDial, isoToFlagEmoji, type Country } from '@/lib/countries'

function Flag({ iso2, size = 20 }: { iso2: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed || !iso2) {
    return (
      <span
        className="shrink-0 leading-none select-none"
        style={{ fontSize: Math.round(size * 0.85) }}
        aria-hidden="true"
      >
        {isoToFlagEmoji(iso2) || '🌐'}
      </span>
    )
  }
  return (
    <img
      src={`https://flagcdn.com/w40/${iso2.toLowerCase()}.png`}
      srcSet={`https://flagcdn.com/w80/${iso2.toLowerCase()}.png 2x`}
      width={size}
      height={Math.round(size * 0.75)}
      alt={iso2}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-[2px] object-cover border border-black/10 dark:border-white/10"
    />
  )
}

interface CountryCodePickerProps {
  /** Current dial code digits, e.g. "93" */
  value: string
  /** Called with the picked country's dial code digits */
  onChange: (dial: string) => void
  /** Disable the trigger (e.g. while the form is submitting) */
  disabled?: boolean
}

export function CountryCodePicker({ value, onChange, disabled = false }: CountryCodePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = findCountryByDial(value) ?? COUNTRIES.find((c) => c.dial === '93')!

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COUNTRIES
    const qDigits = q.replace(/\D/g, '')
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.iso2.toLowerCase() === q ||
        (qDigits.length > 0 && c.dial.startsWith(qDigits))
    )
  }, [query])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    // Fresh list state on every open (search + highlight), no effect needed
    setQuery('')
    setHighlight(0)
    setOpen(true)
  }

  // Keep the highlighted row visible while arrowing through the list
  useEffect(() => {
    const el = listRef.current?.children[highlight] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const pick = (c: Country) => {
    onChange(c.dial)
    setOpen(false)
  }

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && filtered[highlight]) {
      e.preventDefault()
      pick(filtered[highlight])
    }
  }

  return (
    <div ref={rootRef} className="relative w-28 shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        title={`${selected.name} (+${selected.dial}) — change country`}
        className="h-11 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 flex items-center justify-center gap-1.5 text-sm hover:border-[#4285F4]/50 focus:border-[#4285F4] focus:ring-[#4285F4]/20 focus:outline-none transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-gray-200 dark:disabled:hover:border-gray-700"
      >
        <Flag iso2={selected.iso2} size={20} />
        <span className="text-gray-700 dark:text-gray-200 tabular-nums">+{value}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                ref={searchRef}
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setHighlight(0)
                }}
                onKeyDown={onListKeyDown}
                placeholder="Search country or code"
                aria-label="Search country or code"
                className="w-full h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-8 pr-2 text-sm text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:border-[#4285F4]"
              />
            </div>
          </div>
          <div ref={listRef} role="listbox" aria-label="Countries" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-gray-400">No country found</div>
            )}
            {filtered.map((c, i) => {
              const active = i === highlight
              const isSelected = c.dial === value && c.iso2 === selected.iso2
              return (
                <button
                  key={c.iso2}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(c)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
                    active ? 'bg-[#4285F4]/10' : ''
                  }`}
                >
                  <Flag iso2={c.iso2} size={18} />
                  <span
                    className={`flex-1 truncate ${
                      isSelected
                        ? 'text-[#4285F4] font-medium'
                        : 'text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    {c.name}
                  </span>
                  <span className="text-gray-400 tabular-nums">+{c.dial}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
