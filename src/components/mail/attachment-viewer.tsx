'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft, MoreVertical, Download, Share2, Printer,
  FileText, FileWarning, Loader2, RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAppStore, type AttachmentFile } from '@/store/use-app-store'
import { formatFileSize } from '@/components/mail/email-detail'

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

// Which preview strategy to use. Only browser-renderable types are previewed;
// everything else gets the professional unsupported state (never fake rendering).
function viewerKind(att: AttachmentFile): 'image' | 'pdf' | 'other' {
  const name = att.name || ''
  const type = (att.type || '').toLowerCase()
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf'
  const imageByType = type.startsWith('image/')
  const imageByName = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(name)
  // Formats browsers cannot reliably render — show the unsupported state instead
  const notRenderable =
    /\.(heic|heif|avif|tiff?)$/i.test(name) ||
    ['image/heic', 'image/heif', 'image/avif', 'image/tiff'].includes(type)
  if ((imageByType || imageByName) && !notRenderable) return 'image'
  return 'other'
}

function extLabel(att: AttachmentFile) {
  const match = (att.name || '').match(/\.([a-z0-9]+)$/i)
  if (match) return `${match[1].toUpperCase()} file`
  return att.type || 'File'
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  )
}

// Reuses the existing secure attachment access: embedded base64 data when
// present (no extra network request), otherwise the authenticated
// same-origin /api/attachments route. Never fetches twice.
async function attachmentToBlob(att: AttachmentFile): Promise<Blob | null> {
  try {
    if (att.data) {
      const res = await fetch(att.data)
      return await res.blob()
    }
    if (att.url) {
      const res = await fetch(att.url, { credentials: 'same-origin' })
      if (!res.ok) return null
      return await res.blob()
    }
  } catch {
    return null
  }
  return null
}

/* ─── Actions (Download / Share / Print) ──────────────────────────────────── */

export async function handleDownload(att: AttachmentFile) {
  const blob = await attachmentToBlob(att)
  if (!blob) {
    toast.error('Download failed. Please try again.')
    return
  }
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = att.name || 'attachment'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000)
  toast.success(`${att.name} downloaded`)
}

async function handleShare(att: AttachmentFile) {
  const blob = await attachmentToBlob(att)
  if (!blob) {
    toast.error('Could not prepare the file for sharing.')
    return
  }
  const file = new File([blob], att.name || 'attachment', {
    type: blob.type || att.type || 'application/octet-stream',
  })
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: att.name })
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') toast.error('Could not share this file.')
    }
  } else {
    toast('Sharing is not supported here — downloading instead.')
    handleDownload(att)
  }
}

function handlePrint(att: AttachmentFile) {
  const kind = viewerKind(att)
  if (kind === 'image') {
    const src = att.data || att.url
    const win = window.open('', '_blank', 'width=820,height=680')
    if (!win) {
      toast.error('Please allow pop-ups to print this image.')
      return
    }
    win.document.write(
      `<!doctype html><html><head><title>${escapeHtml(att.name || 'Image')}</title>` +
      `<style>@page{margin:12mm}html,body{margin:0;padding:0}` +
      `body{display:flex;align-items:center;justify-content:center}` +
      `img{max-width:100%;max-height:96vh}` +
      `@media print{body{display:block}img{width:100%;height:auto}}</style></head>` +
      `<body><img src="${src}" alt=""></body></html>`
    )
    win.document.close()
    win.focus()
    setTimeout(() => {
      try {
        win.print()
      } catch {
        // The image stays open in the tab so the user can print manually
      }
    }, 350)
  } else if (kind === 'pdf') {
    // Print the actual PDF via the browser's built-in PDF plugin
    const frame = document.createElement('iframe')
    frame.src = att.url
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;'
    document.body.appendChild(frame)
    frame.onload = () => {
      try {
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
      } catch {
        toast.error("Printing isn't available for this file on this device. Download it instead.")
      }
      setTimeout(() => frame.remove(), 60000)
    }
  } else {
    toast.error("This file type can't be printed directly. Download it to print with another app.")
  }
}

/* ─── Error / Unsupported states ──────────────────────────────────────────── */

function ViewerError({ onRetry, onDownload }: { onRetry: () => void; onDownload: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
        <FileWarning className="w-7 h-7 text-red-500" />
      </div>
      <div>
        <p className="text-base font-medium text-[#1F1F1F] dark:text-white">Unable to open document</p>
        <p className="text-sm text-gray-500 mt-1">The file could not be loaded.</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="h-9 px-4 rounded-lg bg-[#4285F4] hover:bg-[#3367D6] text-white text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
        <button
          type="button"
          onClick={onDownload}
          className="h-9 px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-[#1F1F1F] dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" /> Download
        </button>
      </div>
    </div>
  )
}

function UnsupportedState({ att }: { att: AttachmentFile }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <FileText className="w-8 h-8 text-[#4285F4]" />
      </div>
      <div>
        <p className="text-base font-medium text-[#1F1F1F] dark:text-white">File preview not supported</p>
        <p className="text-sm text-gray-500 mt-1 max-w-[280px] truncate mx-auto">{att.name}</p>
      </div>
      <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">
        {extLabel(att)}
        {att.size ? ` · ${formatFileSize(att.size)}` : ''}
      </span>
      <div className="flex items-center gap-2 mt-1">
        <button
          type="button"
          onClick={() => handleDownload(att)}
          className="h-9 px-4 rounded-lg bg-[#4285F4] hover:bg-[#3367D6] text-white text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" /> Download
        </button>
        <button
          type="button"
          onClick={() => handleShare(att)}
          className="h-9 px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-[#1F1F1F] dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Share2 className="w-4 h-4" /> Share
        </button>
      </div>
    </div>
  )
}

function LoadingOverlay({ label = 'Loading document...' }: { label?: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
      <Loader2 className="w-8 h-8 text-[#4285F4] animate-spin" />
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  )
}

/* ─── Zoomable image preview ──────────────────────────────────────────────── */

function ZoomableImage({ src, alt, onDownload }: { src: string; alt: string; onDownload: () => void }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 })
  const [animating, setAnimating] = useState(true)
  const tRef = useRef(t)
  const boxRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinch = useRef<{ dist: number; scale: number; mx: number; my: number; ox: number; oy: number } | null>(null)
  const pan = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  const clamp = useCallback((v: number, min: number, max: number) => Math.min(max, Math.max(min, v)), [])

  // Single mutation path for the transform — keeps the ref in sync for gesture handlers
  const applyTransform = useCallback((next: { scale: number; x: number; y: number }) => {
    tRef.current = next
    setT(next)
  }, [])

  const clampOffset = useCallback(
    (x: number, y: number, scale: number) => {
      const box = boxRef.current
      if (!box) return { x, y }
      const maxX = (box.clientWidth * (scale - 1)) / 2 + 4
      const maxY = (box.clientHeight * (scale - 1)) / 2 + 4
      return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) }
    },
    [clamp]
  )

  const zoomAt = useCallback(
    (nextScale: number, clientX: number, clientY: number) => {
      const box = boxRef.current
      if (!box) return
      const rect = box.getBoundingClientRect()
      const px = clientX - rect.left - rect.width / 2
      const py = clientY - rect.top - rect.height / 2
      const prev = tRef.current
      const s = clamp(nextScale, 1, 8)
      if (s === prev.scale) return
      const next = {
        scale: s,
        x: prev.x + (prev.scale - s) * px,
        y: prev.y + (prev.scale - s) * py,
      }
      applyTransform(s === 1 ? { scale: 1, x: 0, y: 0 } : { ...next, ...clampOffset(next.x, next.y, s) })
    },
    [clamp, clampOffset, applyTransform]
  )

  // Non-passive wheel zoom (desktop)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setAnimating(true)
      zoomAt(tRef.current.scale * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const retry = () => {
    setAttempt((n) => n + 1)
    setStatus('loading')
    pointers.current.clear()
    pinch.current = null
    pan.current = null
    applyTransform({ scale: 1, x: 0, y: 0 })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    try {
      boxRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // Pointer already gone (synthetic/edge cases) — gesture tracking still works
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const cur = tRef.current
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()]
      const box = boxRef.current
      const rect = box?.getBoundingClientRect()
      const mx = rect ? (p1.x + p2.x) / 2 - rect.left - rect.width / 2 : 0
      const my = rect ? (p1.y + p2.y) / 2 - rect.top - rect.height / 2 : 0
      pinch.current = {
        dist: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1,
        scale: cur.scale,
        mx,
        my,
        ox: cur.x,
        oy: cur.y,
      }
      pan.current = null
      setAnimating(false)
    } else if (pointers.current.size === 1 && cur.scale > 1) {
      pan.current = { px: e.clientX, py: e.clientY, ox: cur.x, oy: cur.y }
      setAnimating(false)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && pointers.current.size >= 2) {
      const [p1, p2] = [...pointers.current.values()]
      const box = boxRef.current
      const rect = box?.getBoundingClientRect()
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1
      const mx = rect ? (p1.x + p2.x) / 2 - rect.left - rect.width / 2 : 0
      const my = rect ? (p1.y + p2.y) / 2 - rect.top - rect.height / 2 : 0
      const start = pinch.current
      const s = clamp((start.scale * dist) / start.dist, 1, 8)
      const next = {
        scale: s,
        x: start.ox + (start.scale - s) * start.mx + (mx - start.mx),
        y: start.oy + (start.scale - s) * start.my + (my - start.my),
      }
      applyTransform(s === 1 ? { scale: 1, x: 0, y: 0 } : { ...next, ...clampOffset(next.x, next.y, s) })
    } else if (pan.current) {
      const p = pan.current
      const next = { x: p.ox + (e.clientX - p.px), y: p.oy + (e.clientY - p.py) }
      applyTransform({ ...tRef.current, ...clampOffset(next.x, next.y, tRef.current.scale) })
    }
  }

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) {
      pan.current = null
      setAnimating(true)
      if (tRef.current.scale <= 1) applyTransform({ scale: 1, x: 0, y: 0 })
    }
  }

  return (
    <div
      ref={boxRef}
      className="absolute inset-0 flex items-center justify-center overflow-hidden touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={(e) => {
        if (tRef.current.scale > 1) {
          setAnimating(true)
          applyTransform({ scale: 1, x: 0, y: 0 })
        } else {
          setAnimating(true)
          zoomAt(2.5, e.clientX, e.clientY)
        }
      }}
    >
      <img
        key={`${src}#${attempt}`}
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={() => setStatus('ok')}
        onError={() => setStatus('error')}
        className="max-w-full max-h-full object-contain"
        style={{
          transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
          transition: animating ? 'transform 0.2s ease-out' : 'none',
          willChange: 'transform',
        }}
      />
      {status === 'loading' && <LoadingOverlay />}
      {status === 'error' && <ViewerError onRetry={retry} onDownload={onDownload} />}
    </div>
  )
}

/* ─── PDF preview (pdf.js canvas rendering — works on every browser/device.
       Native <iframe> PDFs are NOT rendered by iOS Safari or Android Chrome
       (users just saw a blank box and could only download); pdf.js draws the
       pages to canvas exactly like Gmail's mobile viewer. ──────────────────── */

function PdfFrame({ att, onDownload }: { att: AttachmentFile; onDownload: () => void }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [progress, setProgress] = useState('')
  const [attempt, setAttempt] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)

  useEffect(() => {
    let cancelled = false
    let pdfDoc: { destroy: () => Promise<void> } | null = null
    setStatus('loading')
    setProgress('')

    // Fail-safe: surface the error state if the document never finishes
    const failSafe = setTimeout(() => {
      if (!cancelled) setStatus((s) => (s === 'loading' ? 'error' : s))
    }, 30000)

    const render = async () => {
      try {
        const blob = await attachmentToBlob(att)
        if (cancelled) return
        if (!blob) throw new Error('Attachment could not be loaded')
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const data = new Uint8Array(await blob.arrayBuffer())
        const doc = await pdfjs.getDocument({ data }).promise
        if (cancelled) {
          doc.destroy().catch(() => {})
          return
        }
        pdfDoc = doc

        const container = containerRef.current
        if (!container) return
        container.replaceChildren()

        // Fit page to container width, render at device pixel ratio for crisp text
        const pageWidth = Math.max(container.clientWidth - 24, 200)
        const dpr = Math.min(window.devicePixelRatio || 1, 2)

        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return
          setProgress(`page ${n} of ${doc.numPages}`)
          const page = await doc.getPage(n)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: (pageWidth / base.width) * dpr })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.cssText =
            `display:block;margin:0 auto 12px;width:${pageWidth}px;height:auto;max-width:100%;` +
            'border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,0.25);background:#fff'
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          container.appendChild(canvas)
          const task = page.render({ canvasContext: ctx, viewport })
          renderTaskRef.current = task
          await task.promise
        }
        if (!cancelled) setStatus('ok')
      } catch {
        // Cancelled renders (unmount/retry) reject here too — only real
        // failures flip the state, cancellation is handled by `cancelled`
        if (!cancelled) setStatus('error')
      }
    }

    render()

    return () => {
      cancelled = true
      clearTimeout(failSafe)
      try {
        renderTaskRef.current?.cancel()
      } catch {
        // Already finished
      }
      try {
        pdfDoc?.destroy()
      } catch {
        // Never opened
      }
    }
  }, [att, attempt])

  if (status === 'error') {
    return <ViewerError onRetry={() => setAttempt((n) => n + 1)} onDownload={onDownload} />
  }

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-y-auto overscroll-contain px-3 py-4"
      />
      {status === 'loading' && (
        <LoadingOverlay label={`Loading document${progress ? ` — ${progress}` : '...'}`} />
      )}
    </>
  )
}

/* ─── Main viewer ─────────────────────────────────────────────────────────── */

export function AttachmentViewer() {
  const attachmentViewer = useAppStore((s) => s.attachmentViewer)
  const setAttachmentViewer = useAppStore((s) => s.setAttachmentViewer)
  const att = attachmentViewer
  const kind = att ? viewerKind(att) : 'other'

  // Escape closes the viewer (desktop)
  useEffect(() => {
    if (!att) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAttachmentViewer(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [att, setAttachmentViewer])

  return (
    <AnimatePresence>
      {att && (
        <motion.div
          key="attachment-viewer"
          role="dialog"
          aria-label={`Document viewer: ${att.name}`}
          className="fixed inset-0 z-[100] bg-white dark:bg-gray-950 flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Toolbar */}
          <header
            className="shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <div className="h-14 flex items-center gap-1 px-2 sm:px-3">
              <button
                type="button"
                onClick={() => setAttachmentViewer(null)}
                aria-label="Back to email"
                className="h-9 w-9 shrink-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300 rtl-flip" />
              </button>
              {/* Filename sits next to the back arrow (Gmail-style), actions stay on the right */}
              <div className="flex-1 min-w-0 px-1">
                <p className="text-sm font-medium text-[#1F1F1F] dark:text-white truncate" title={att.name}>
                  {att.name}
                </p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(att.size) || extLabel(att)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDownload(att)}
                aria-label="Download"
                className="h-9 w-9 shrink-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Download className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="More actions"
                    className="h-9 w-9 shrink-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  </button>
                </DropdownMenuTrigger>
                {/* z-[110]: portal content must sit ABOVE the z-[100] viewer overlay,
                    otherwise the menu opens invisibly behind it */}
                <DropdownMenuContent align="end" className="w-44 z-[110]">
                  <DropdownMenuLabel>Document actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => handleDownload(att)}>
                    <Download className="mr-2 h-4 w-4" /> Download
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleShare(att)}>
                    <Share2 className="mr-2 h-4 w-4" /> Share
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handlePrint(att)}>
                    <Printer className="mr-2 h-4 w-4" /> Print
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Document body */}
          <div className="flex-1 min-h-0 relative bg-gray-100 dark:bg-gray-950 overflow-hidden">
            {kind === 'image' && (
              <ZoomableImage key={att.url} src={att.data || att.url} alt={att.name} onDownload={() => handleDownload(att)} />
            )}
            {kind === 'pdf' && (
              <PdfFrame key={att.url} att={att} onDownload={() => handleDownload(att)} />
            )}
            {kind === 'other' && <UnsupportedState att={att} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
