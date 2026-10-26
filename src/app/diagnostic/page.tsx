'use client'

import { useState } from 'react'

/**
 * TEMPORARY diagnostic page (Task 78 — remove together with /api/push/diag
 * once the notification issue is resolved).
 *
 * Shows the push-pipeline status for the logged-in user and can fire one real
 * test notification per registered device, printing the exact FCM responses.
 */
export default function DiagnosticPage() {
  const [output, setOutput] = useState('Press a button to run a check.')
  const [busy, setBusy] = useState<'none' | 'check' | 'test'>('none')

  async function run(kind: 'check' | 'test') {
    setBusy(kind)
    setOutput(kind === 'check' ? 'Checking…' : 'Sending test notification…')
    try {
      const res = await fetch('/api/push/diag', {
        method: kind === 'check' ? 'GET' : 'POST',
      })
      const data = await res.json()
      setOutput(JSON.stringify(data, null, 2))
    } catch (err) {
      setOutput('Request failed: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy('none')
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 16px', fontFamily: 'monospace' }}>
      <h1 style={{ fontSize: 20 }}>EzyMail push diagnostic</h1>
      <p style={{ color: '#555', fontSize: 13 }}>
        Temporary page. Check status = env vars + saved tokens. Test = sends one real
        notification to each of your devices and shows Google&apos;s exact answer.
      </p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <button
          onClick={() => run('check')}
          disabled={busy !== 'none'}
          style={{ padding: '10px 16px', cursor: 'pointer' }}
        >
          {busy === 'check' ? 'Checking…' : '1. Check status'}
        </button>
        <button
          onClick={() => run('test')}
          disabled={busy !== 'none'}
          style={{ padding: '10px 16px', cursor: 'pointer' }}
        >
          {busy === 'test' ? 'Sending…' : '2. Send test notification'}
        </button>
      </div>
      <pre
        style={{
          background: '#f6f6f6',
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: 16,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 12,
        }}
      >
        {output}
      </pre>
    </div>
  )
}
