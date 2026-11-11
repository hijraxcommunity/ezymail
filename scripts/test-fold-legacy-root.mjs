// Sanity test: the EXACT fold logic from src/app/api/emails/route.ts (GET)
// after the union-find rewrite — against the owner's 2026-11-11 scenarios.
function fold(rows) {
  const emails = rows
  const parentOf = new Array(emails.length)
  for (let i = 0; i < emails.length; i++) parentOf[i] = i
  const find = (x) => {
    let root = x
    while (parentOf[root] !== root) root = parentOf[root]
    while (parentOf[x] !== root) { const next = parentOf[x]; parentOf[x] = root; x = next }
    return root
  }
  const union = (a, b) => {
    const ra = find(a); const rb = find(b)
    if (ra < rb) parentOf[rb] = ra; else parentOf[ra] = rb
  }
  const indexById = new Map()
  emails.forEach((e, i) => indexById.set(e.id, i))
  const keyIndex = new Map()
  emails.forEach((e, i) => {
    if (!e.threadId) return
    const first = keyIndex.get(e.threadId)
    if (first === undefined) keyIndex.set(e.threadId, i)
    else union(first, i)
  })
  emails.forEach((e, i) => {
    if (!e.parentEmailId) return
    const p = indexById.get(e.parentEmailId)
    if (p !== undefined) union(p, i)
  })
  const seenGroups = new Set()
  const filtered = []
  const threadCounts = {}
  for (let i = 0; i < emails.length; i++) {
    const root = find(i)
    if (seenGroups.has(root)) {
      const rep = emails[root]
      const key = rep.threadId || rep.id
      threadCounts[key] = (threadCounts[key] || 0) + 1
      continue
    }
    seenGroups.add(root)
    filtered.push(emails[i])
  }
  return { visible: filtered.map(e => e.label), threadCounts }
}
const assert = (name, cond) => { console.log(cond ? `PASS  ${name}` : `FAIL  ${name}`); if (!cond) process.exitCode = 1 }

// S1 — FULLY LEGACY conversation: root AND replies all threadId=null, linked
// only by parentEmailId. Delete moved all to trash → trash must show ONE row.
const legacyRoot = { id: 'R', threadId: null, parentEmailId: null, label: 'legacy-root' }
const legacyR1 = { id: 'L1', threadId: null, parentEmailId: 'R', label: 'legacy-reply1' }
const legacyR2 = { id: 'L2', threadId: null, parentEmailId: 'L1', label: 'legacy-reply2' }
let r = fold([legacyR2, legacyR1, legacyRoot])
assert('S1 fully-legacy conversation folds to ONE row', r.visible.length === 1 && r.visible[0] === 'legacy-reply2')
assert('S1 hidden members counted under representative key', r.threadCounts['L2'] === 2)

// S2 — FORKED legacy conversation: replies to null-threadId parents forked a
// fresh key each (threadId = replyToId). Scattered keys, one conversation.
const forkR1 = { id: 'L1', threadId: 'L1', parentEmailId: 'R', label: 'forked-reply1' }
const forkR2 = { id: 'L2', threadId: 'L2', parentEmailId: 'L1', label: 'forked-reply2' }
r = fold([forkR2, forkR1, legacyRoot])
assert('S2 forked-key legacy conversation folds to ONE row', r.visible.length === 1 && r.visible[0] === 'forked-reply2')

// S3 — modern thread (root threadId = own id, replies inherit): one row.
const modernRoot = { id: 'M', threadId: 'M', parentEmailId: null, label: 'modern-root' }
const modernReply = { id: 'B1', threadId: 'M', parentEmailId: 'M', label: 'modern-reply' }
r = fold([modernReply, modernRoot])
assert('S3 modern thread still ONE row', r.visible.length === 1 && r.visible[0] === 'modern-reply')

// S4 — mixed page: legacy conv + modern conv + standalone → 3 rows.
r = fold([forkR2, modernReply, { id: 'X', threadId: null, parentEmailId: null, label: 'solo' }, forkR1, legacyRoot, modernRoot])
assert('S4 mixed page = 3 rows (forked-reply2, modern-reply, solo)', r.visible.length === 3 && r.visible.join(',') === 'forked-reply2,modern-reply,solo')

// S5 — legacy root WITHOUT its children on the page: renders alone.
r = fold([legacyRoot])
assert('S5 root without children on page renders', r.visible.length === 1 && r.visible[0] === 'legacy-root')

// S6 — sent copies (threadId=null, parentEmailId=null): all render, unchanged.
r = fold([
  { id: 'S1', threadId: null, parentEmailId: null, label: 'sent1' },
  { id: 'S2', threadId: null, parentEmailId: null, label: 'sent2' },
])
assert('S6 standalone rows unchanged (2 rows)', r.visible.length === 2)

// S7 — cross-folder safety: only PART of a conversation in this folder —
// present members render without inventing links to absent ones.
r = fold([forkR2]) // parent chain not on page
assert('S7 partial conversation renders its member', r.visible.length === 1 && r.visible[0] === 'forked-reply2')

// S8 — ordering robustness: even in artificial (non-newest-first) array order
// the group collapses to ONE row; the real API always sends newest-first, so
// the newest member wins the representative slot in production.
r = fold([legacyRoot, legacyR1, legacyR2])
assert('S8 reversed order still ONE row', r.visible.length === 1)
