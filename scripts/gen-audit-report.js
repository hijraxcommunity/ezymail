/* EzyMail Production Audit Report — docx generator (skill: docx, route create, scene report, recipe R1, palette DM-1). */
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  PageBreak, Header, Footer, PageNumber, NumberFormat, SectionType,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
  TableLayoutType, TableOfContents,
} = require("docx");
const fs = require("fs");
const { P1, P2 } = require("./audit-findings-1.js");
const { P3, suspected, cleared, remediation } = require("./audit-findings-2.js");

const ALL = [...P1, ...P2, ...P3];
const byId = Object.fromEntries(ALL.map(f => [f.id, f]));
const ids = (list) => list.map(i => byId[i]).filter(Boolean);

/* ── Palette DM-1 (Deep Cyan, tech report) ── */
const PAL = {
  bg: "162235", accent: "37DCF2",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078" },
  table: { headerBg: "1B6B7A", headerText: "FFFFFF", accentLine: "1B6B7A", innerLine: "C8DDE2", surface: "EDF3F5" },
  headingColor: "162235", body: "000000", secondary: "5B6B7D",
};
const FONT = { ascii: "Times New Roman", eastAsia: "SimSun" };
const HFONT = { ascii: "Times New Roman", eastAsia: "SimHei" };

const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

/* ── Cover layout helpers (design-system.md; Latin-aware char width) ── */
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..." \t-_/"]);
  const lines = []; let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) { if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; } }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) { const last = lines.pop(); lines[lines.length - 1] += " " + last; }
  return lines;
}
function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 11; // Latin average width
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) { lines = splitTitleLines(title, charsPerLine(minPt)); titlePt = minPt; }
  return { titlePt, titleLines: lines };
}
function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const safeRemaining = Math.max(usableHeight - contentHeight, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45), rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}
function buildCoverR1(config) {
  const P = config.palette; const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: PAL.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: PAL.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: PAL.accent, font: HFONT, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: P.titleColor, font: HFONT })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.subtitleColor, font: FONT })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 }, border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: P.metaColor, font: FONT })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: PAL.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: P.footerColor, font: FONT }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: P.footerColor, font: FONT }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({ shading: { type: ShadingType.CLEAR, fill: PAL.bg }, borders: noBorders, children })],
    })],
  })];
}

/* ── Body builders ── */
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160, line: 312 }, children: [new TextRun({ text: t, bold: true, color: PAL.headingColor, font: HFONT })] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 120, line: 312 }, children: [new TextRun({ text: t, bold: true, color: PAL.headingColor, font: HFONT })] });
const h3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 220, after: 100, line: 312 }, children: [new TextRun({ text: t, bold: true, color: PAL.headingColor, font: HFONT })] });
const body = (t, opts = {}) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED, spacing: { line: 312, after: opts.after ?? 120, before: opts.before ?? 0 },
  children: [new TextRun({ text: t, size: 22, color: PAL.body, font: FONT })],
});
const kv = (label, val) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED, spacing: { line: 312, after: 40 },
  children: [
    new TextRun({ text: label + ": ", bold: true, size: 21, color: PAL.headingColor, font: FONT }),
    new TextRun({ text: val, size: 21, color: PAL.body, font: FONT }),
  ],
});
const bullet = (t) => new Paragraph({
  bullet: { level: 0 }, spacing: { line: 312, after: 60 },
  children: [new TextRun({ text: t, size: 22, color: PAL.body, font: FONT })],
});
function findingBlock(f) {
  const out = [];
  out.push(h3("[" + f.id + "] (" + f.sev + ") " + f.title));
  out.push(kv("Feature", f.area));
  out.push(kv("Files", f.files));
  out.push(kv("Function / route", f.fn));
  out.push(kv("Exact problem", f.problem));
  out.push(kv("Root cause", f.root));
  out.push(kv("Reproduction", f.repro));
  out.push(kv("Expected vs actual", f.expected + " — ACTUAL: " + f.actual));
  out.push(kv("User impact", f.impact));
  out.push(kv("Recommended fix", f.fix));
  out.push(kv("Test required", f.test));
  out.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
  return out;
}
const cell = (text, opts = {}) => new TableCell({
  width: { size: opts.w || 20, type: WidthType.PERCENTAGE },
  shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
  margins: { top: 60, bottom: 60, left: 120, right: 120 },
  children: [new Paragraph({
    spacing: { line: 276 },
    children: [new TextRun({ text, size: 20, bold: !!opts.bold, color: opts.color || PAL.body, font: FONT })],
  })],
});
function dataTable(headers, widths, rows, zebra = true) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: PAL.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: PAL.table.accentLine },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: PAL.table.innerLine },
      insideVertical: NB,
    },
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: headers.map((t, i) => cell(t, { w: widths[i], bold: true, color: PAL.table.headerText, fill: PAL.table.headerBg })),
      }),
      ...rows.map((r, ri) => new TableRow({
        cantSplit: true,
        children: r.map((t, i) => cell(String(t), { w: widths[i], fill: zebra && ri % 2 === 1 ? PAL.table.surface : undefined })),
      })),
    ],
  });
}
const tableTitle = (t) => new Paragraph({
  keepNext: true, spacing: { before: 160, after: 80 },
  children: [new TextRun({ text: t, bold: true, size: 21, color: PAL.headingColor, font: FONT })],
});

/* ── Content assembly ── */
const counts = { P0: 0, P1: P1.length, P2: P2.length, P3: P3.length };
const totalConfirmed = P1.length + P2.length + P3.length;

const frontMatter = [
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 480, after: 300 },
    children: [new TextRun({ text: "Executive Summary", bold: true, size: 32, color: PAL.headingColor, font: HFONT })],
  }),
  body("This report documents a full-stack production audit of EzyMail (hijraxcommunity/ezymail at commit 8a87f6d, 2026-11-13) covering the Personal User, Business User and Admin sections, the complete backend and database layer, and application security. The audit inspected all 67 API routes, 173 TypeScript source files (41,812 lines), 21 database models, the Prisma schema, deployment configuration and the existing test suites, tracing features from frontend to API to database. The audit was read-only: no production data was touched, no migrations or backfills were executed, and no code was changed."),
  body("The recently reworked Delete / Trash / Undo / Restore lifecycle is verified sound: the primitives are conversation-scoped, transactional and hard-mailbox-scoped, the thread-key resolution is fork-proof, and the committed regression suite passes 30/30 on the current tree (plus 18/18 payload tests and a clean production build). No P0-severity defect was confirmed; one claimed P0 (a cross-user data leak in the snoozed view combined with search) was investigated line-by-line and disproven."),
  body("The most serious confirmed problems are concentrated in three areas. First, compose-to-delivery: multi-recipient sending always fails, CC/BCC are silently dropped, and scheduled email is delivered immediately and never actually scheduled — the send path models a single-recipient, send-now world that the UI outgrew. Second, security hardening gaps: two-factor authentication is never enforced at login, session revocation is cosmetic (a stolen 30-day cookie survives logout, password change and remote revoke), and the attachment pipeline can serve attacker-controlled HTML/SVG inline on the application origin. Third, half-built business-tier features: campaigns are never sent or tracked, verification documents are fabricated placeholder URLs, and trial/subscription state is enforced nowhere. The Admin panel authorizes correctly everywhere but its operational surfaces are partly decorative (impersonation does not work end-to-end, login logging never writes, settings toggles change nothing)."),
  body("In total, " + totalConfirmed + " defects are confirmed (" + counts.P1 + " P1, " + counts.P2 + " P2, " + counts.P3 + " P3), 13 suspected items are listed separately, and 8 investigated areas are explicitly cleared with evidence. A prioritized six-group remediation plan is provided in Chapter 12; every group lists dependencies, affected files, and the regression tests required. Groups 1-3 (attachment egress, session/2FA integrity, compose correctness) close the highest-risk gaps and are ready to execute on approval. No fixes were applied in this run, per the agreed execution order."),
  new Paragraph({
    spacing: { before: 200, after: 0 },
    children: [
      new TextRun({ text: "Basis: static multi-pass code audit with line-level evidence, existing test execution, and controlled local verification only. All findings carry file and line citations; no secrets, credentials or private user data appear in this report.", italics: true, size: 20, color: PAL.secondary, font: FONT }),
      new PageBreak(),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 480, after: 360 },
    children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, color: PAL.headingColor, font: HFONT })],
  }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({ text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select \"Update Field.\"", italics: true, size: 18, color: "888888", font: FONT })],
  }),
];

const bodyChildren = [];

/* Chapter 1 — Audit Summary */
bodyChildren.push(h1("1. Audit Summary"));
bodyChildren.push(body("The audit was performed on 2026-11-13 against repository HEAD 8a87f6d (working tree clean, in sync with origin/main). Findings were collected from a lead-auditor deep pass over the authentication, email lifecycle and send paths, four parallel structured audit sweeps (business, admin, backend/API, security, UI/UX), and direct line-by-line verification of every P1 claim before acceptance. One suspected P0 was disproven during verification and is documented in Chapter 3 as cleared."));
bodyChildren.push(tableTitle("Table 1: Finding counts by severity"));
bodyChildren.push(dataTable(["Severity", "Confirmed", "Meaning"], [20, 15, 65], [
  ["P0 — Critical", "0", "No confirmed data loss, cross-user exposure, or exploitable critical vulnerability (one claimed P0 was disproven; see Chapter 3)."],
  ["P1 — High", String(counts.P1), "Major feature broken or serious security/consistency gap."],
  ["P2 — Medium", String(counts.P2), "Partial feature failure, incorrect state handling, or user-affecting performance."],
  ["P3 — Low", String(counts.P3), "Minor defect, dead surface, hygiene or hardening gap."],
]));
bodyChildren.push(tableTitle("Table 2: Checks executed"));
bodyChildren.push(dataTable(["Check", "Result", "Notes"], [30, 18, 52], [
  ["Conversation lifecycle suite (scripts/lifecycle.test.ts)", "30/30 PASS", "Real primitives on a dedicated SQLite harness; includes spam-page delete, snooze-clearing, per-mailbox isolation, fork-proof threading."],
  ["Payload regression suite (scripts/phase2-payload.test.ts)", "18/18 PASS", "Notification payload contract."],
  ["Production build (npm run build)", "PASS", "Next.js 16 production build completes."],
  ["TypeScript (npx tsc --noEmit)", "15 pre-existing errors", "All 15 are the known baseline, none in lifecycle code; hidden in builds by typescript.ignoreBuildErrors=true (finding F-68)."],
  ["ESLint (npx eslint src scripts --quiet)", "45 errors", "Style/quality violations; no blocking runtime defects."],
  ["Full-stack E2E (scripts/spam-trash-e2e.mjs, 32 checks)", "NOT EXECUTED", "Requires embedded-postgres (not in the lockfile after the sandbox recycle) plus a dev server; lifecycle suite covers the same primitives. Listed as a limitation."],
  ["Browser UI automation", "NOT EXECUTED", "No interactive browser available in this environment; UI findings are code-trace based (button to handler to API to response)."],
]));
bodyChildren.push(tableTitle("Table 3: Inventory inspected"));
bodyChildren.push(dataTable(["Item", "Count"], [50, 50], [
  ["API routes (src/app/api/**/route.ts)", "67"],
  ["TypeScript source files / lines (src/)", "173 files / 41,812 lines"],
  ["React components (src/components)", "85"],
  ["Library modules (src/lib)", "13"],
  ["Prisma models / schema lines", "21 models / 421 lines"],
  ["Android shell (Capacitor)", "present; not deep-audited (see S-06)"],
]));

/* Chapter 2 — Scope & Method */
bodyChildren.push(h1("2. Audit Scope, Method and Evidence Basis"));
bodyChildren.push(body("Scope covered the Personal User section (authentication and account, email core functionality with special attention to Delete, Trash, Undo, Restore and threading, contacts, templates, notifications, and UI/UX wiring), the Business User section (dashboard, team, customers, campaigns, analytics, verification, trial and subscription state), the Admin panel (authorization, user and business management, reports, verifications, settings, logs, impersonation), the backend layer (all 67 routes, validation, transactions, pagination, performance), and security (broken access control, IDOR, XSS, CSRF, uploads, secrets, rate limiting, cron authentication)."));
bodyChildren.push(body("Method: every API route was read with attention to its session check, input validation, transaction use and error handling; every finding was traced from the UI element through the handler to the database and back to the response. Critical claims were re-verified line-by-line by the lead auditor before inclusion — one agent-reported P0 cross-user leak was rejected on that basis (Chapter 3). The existing test suites were executed in a controlled local environment (dedicated SQLite harness; no production connection exists in the audit sandbox, and none was used). Constraints honored: no destructive database operations, no production data access, no migrations or backfills, no mock implementations, no code modifications in this run, and no secrets reproduced in this report."));
bodyChildren.push(body("Evidence convention: each finding lists the exact files and line numbers, the affected function or route, the root cause, reproduction steps, expected versus actual behavior, user impact, the recommended minimal fix, and the regression test required. Findings marked as verified in text were additionally confirmed by direct line-by-line reading of every cited location."));

/* Chapter 3 — Cleared */
bodyChildren.push(h1("3. Investigated and Cleared"));
bodyChildren.push(body("The following areas were explicitly investigated and found NOT defective. They are recorded because several were suspected during the audit or in earlier passes, and because a future regression here would be high-impact."));
for (const c of cleared) {
  bodyChildren.push(kv(c.title, c.note));
}
bodyChildren.push(body("Two residual risks adjacent to the lifecycle are NOT lifecycle regressions but are tracked as findings: the send path writes its rows without a transaction (F-22), and the label metadata path allows cross-user writes (F-29). The delete, trash, undo, restore and threading behavior that the owner reported on 2026-11-11 and 2026-11-13 is correct on the current tree.", { after: 200 }));

/* Chapter 4 — Personal User */
bodyChildren.push(h1("4. Personal User Audit — Findings"));
bodyChildren.push(h2("4.1 Authentication and account"));
bodyChildren.push(body("Registration, login, logout, password recovery (WhatsApp OTP plus purpose-scoped single-use reset token) and phone verification are implemented correctly with hashing (bcrypt cost 12), hashed OTP storage, attempt lockouts, resend cooldowns and rate-limited login. The two material gaps are that two-factor enrollment never gates login (F-06) and that session revocation across logout, password change and remote revoke does not evict existing cookies (F-07); suspension of an account likewise does not touch live sessions (F-11, detailed in Chapter 6)."));
bodyChildren.push(...findingBlock(byId["F-06"]));
bodyChildren.push(...findingBlock(byId["F-07"]));
bodyChildren.push(h2("4.2 Email core, delete/trash/undo/restore and threading"));
bodyChildren.push(body("The lifecycle regression audit found the delete, trash, undo, restore and threading behavior sound (Chapter 3). The material defects in the email core are in the send path and its adjacent features: multi-recipient send, CC/BCC, and scheduling are broken end-to-end, send writes are not transactional, drafts leave orphans and a phantom that overwrites later composes, rules can move mail into invisible folders, and search is case-sensitive in production. Each is listed below; findings F-04 and F-05 (attachment XSS) are detailed in Chapter 8."));
for (const id of ["F-01","F-02","F-03","F-22","F-23","F-24","F-25","F-26","F-37","F-17","F-28"]) bodyChildren.push(...findingBlock(byId[id]));
bodyChildren.push(h2("4.3 Contacts and templates"));
bodyChildren.push(body("Contacts CRUD (create, edit, delete, search, favorite, authorization) is correctly wired end-to-end with server-side scoping. Templates CRUD is solid except that a template saved from compose does not appear in the picker until a full reload (F-56). The labels feature has a complete API and store with no UI consumer (F-69) and carries the cross-user write gap F-29 (Chapter 8)."));
bodyChildren.push(...findingBlock(byId["F-56"]));
bodyChildren.push(...findingBlock(byId["F-69"]));
bodyChildren.push(h2("4.4 Notifications"));
bodyChildren.push(body("The push pipeline is in good shape: permission gating on first gesture, master-disable purge, self-healing re-registration, dead-man-switch poll fallback, FCM payload fitting with content shedding, and dead-token cleanup only on true UNREGISTERED. Preference persistence is consistent (single toggle saves both keys immediately; the profile API merges partial preference objects). One rebind hazard exists on token conflicts (F-51, Chapter 8)."));
bodyChildren.push(h2("4.5 UI/UX functionality"));
bodyChildren.push(body("List rendering, infinite scroll, bulk operations, thread detail, undo/restore guards, refresh state and deep links were verified correct end-to-end (the removed-rows guard is thread-aware, cleared on navigation, lifted by undo with server-returned ids). The defects found are optimistic-rollback gaps, dead preferences, wrong-folder undo ghosts, an invisible wordmark, forward dropping attachments, misleading badges and misc label/behavior contradictions."));
for (const id of ["F-57","F-58","F-59","F-60","F-61","F-62","F-63"]) bodyChildren.push(...findingBlock(byId[id]));

/* Chapter 5 — Business */
bodyChildren.push(h1("5. Business User Audit — Findings"));
bodyChildren.push(body("Business data isolation is correct everywhere: the caller's business identity is always resolved server-side from the session, every [id] route compares businessId before reading or writing, no route accepts a client-supplied businessId, and no cross-business path was found. Customer validation and dedupe are enforced at the database level; campaign recipient ownership is validated on create. The problems are that several headline business features are stubs or dead surfaces: campaigns never send or track anything, self-service deletion hits a nonexistent endpoint, verification file uploads fabricate placeholder URLs, trial and subscription state is enforced nowhere, team invitations are inert, and the analytics render invented math."));
bodyChildren.push(h2("5.1 Confirmed findings"));
for (const id of ["F-13","F-14","F-15","F-16","F-19","F-20","F-21"]) bodyChildren.push(...findingBlock(byId[id]));
for (const id of ["F-64","F-65","F-66","F-67"]) bodyChildren.push(...findingBlock(byId[id]));
bodyChildren.push(body("Payment note: there is no HesabPay, receipt or payment code anywhere in the repository — upgrade flow is admin-manual. The user requirement to verify payment-status consistency therefore resolves to the enforcement question F-16: the server never enforces the subscription states it reports, and campaign engagement metrics the UI renders faithfully are permanently zero (F-13).", { before: 120 }));

/* Chapter 6 — Admin */
bodyChildren.push(h1("6. Admin Panel Audit — Findings"));
bodyChildren.push(body("Authorization is solid: all 22 admin handlers begin with an explicit role check before any data access, the JWT fails closed with no fallback secret, the report and verification state machines refuse non-pending transitions, and every mutating admin action writes an AdminLog row. Normal users cannot reach admin APIs. The confirmed defects are operational: impersonation does not actually work (F-08), login logging never writes (F-09), settings toggles are decorative (F-10), suspension does not revoke sessions (F-11), merged log pagination is wrong past page 1 (F-12), and several UI/API contract mismatches block real workflows."));
bodyChildren.push(h2("6.1 Confirmed findings"));
for (const id of ["F-08","F-09","F-10","F-11","F-12"]) bodyChildren.push(...findingBlock(byId[id]));
for (const id of ["F-30","F-31","F-44","F-45"]) bodyChildren.push(...findingBlock(byId[id]));

/* Chapter 7 — Backend */
bodyChildren.push(h1("7. Backend, API and Database Audit — Findings"));
bodyChildren.push(body("Auth gating is universal across the 67 routes; there is no raw SQL anywhere; the lifecycle routes use transactions correctly; the push pipeline, cron authentication and OpenWA sender are hardened beyond the norm. The confirmed defects are concentrated in unvalidated input, response-shape drift, unbounded queries and cost hot spots."));
bodyChildren.push(h2("7.1 Confirmed findings"));
for (const id of ["F-27","F-34","F-35","F-36","F-33","F-38","F-39","F-40","F-41","F-53","F-54","F-55","F-68"]) bodyChildren.push(...findingBlock(byId[id]));

/* Chapter 8 — Security */
bodyChildren.push(h1("8. Security Audit — Findings"));
bodyChildren.push(body("Cleared areas first: no SQL injection surface exists (parameterized Prisma only), the IDOR sweep across every [id] route is clean, email body rendering is protected by a strict allowlist sanitizer at all render sites, uploads enforce size and session checks, secrets are env-only with no server secret in client bundles, and cron endpoints authenticate with timing-safe comparisons. The confirmed weaknesses follow; findings F-06 and F-07 (2FA and session revocation) are detailed in Chapter 4 and are the two highest-impact items in this class together with the attachment egress pair F-04/F-05."));
bodyChildren.push(h2("8.1 Confirmed findings"));
for (const id of ["F-04","F-05","F-18","F-29","F-32","F-42","F-43","F-46","F-47","F-48","F-49","F-50","F-51","F-52"]) bodyChildren.push(...findingBlock(byId[id]));

/* Chapter 9 — Broken register */
bodyChildren.push(h1("9. Broken or Incomplete Functionality Register"));
bodyChildren.push(body("The register below lists every confirmed broken or incomplete function in one table for triage. Full detail for each ID is in Chapters 4 through 8."));
const regRows = ALL.map(f => [f.id, f.sev, f.area, f.title]);
bodyChildren.push(tableTitle("Table 4: Confirmed defect register (" + totalConfirmed + " items)"));
bodyChildren.push(dataTable(["ID", "Sev", "Area", "Title"], [8, 8, 20, 64], regRows));

/* Chapter 10 — Fixes implemented */
bodyChildren.push(h1("10. Fixes Implemented in This Run"));
bodyChildren.push(body("None. Per the agreed execution order (complete the audit, produce the report, propose the remediation plan, then wait for approval before risky changes), no code changes were made in this run. The working tree is exactly at commit 8a87f6d; the only environment work performed was restoring development dependencies and executing the existing test suites locally. The prior session's Spam-page fix remains the last code change on the branch."));

/* Chapter 11 — Suspected & limitations */
bodyChildren.push(h1("11. Suspected Issues and Test Limitations"));
bodyChildren.push(body("The items below are suspected but unconfirmed; they are labeled suspected deliberately and none is counted in the defect totals. Each needs the listed check before it can be promoted to a finding or discarded."));
for (const s of suspected) bodyChildren.push(kv("[" + s.id + "] " + s.title, s.note));
bodyChildren.push(h2("11.1 Test and audit limitations"));
bodyChildren.push(bullet("Full-stack E2E (32-check spam/trash battery) was not executed: embedded-postgres is not in the lockfile after the sandbox recycle and the harness needs a dev server. The lifecycle suite (30/30) covers the same primitives."));
bodyChildren.push(bullet("Browser-based UI automation was not available; all UI findings are code-trace based with repro steps for manual verification."));
bodyChildren.push(bullet("The Neon production dry-run from the previous task remains blocked pending the owner-provided connection string; no production database was contacted in this audit."));
bodyChildren.push(bullet("The Android WebView shell (MainActivity settings, push service) was not deep-audited this pass (S-06)."));
bodyChildren.push(bullet("External integrations (OpenWA WhatsApp gateway, FCM) were reviewed as code only; no live sends were attempted."));

/* Chapter 12 — Remediation plan */
bodyChildren.push(h1("12. Prioritized Remediation Plan"));
bodyChildren.push(body("The plan is ordered by risk-per-effort and dependency order. Groups 1 and 2 require no product decisions and can start immediately on approval; Group 3 is one coherent rework of the send path; Groups 4-6 follow. Every group lands with regression tests added to the existing harness conventions. Schema changes (session tokenVersion in Group 2; cc/bcc columns in Group 3) are migrations and therefore require explicit owner approval before they are applied anywhere."));
for (const g of remediation) {
  bodyChildren.push(h2(g.group));
  bodyChildren.push(kv("Scope", g.items));
  bodyChildren.push(kv("Dependencies", g.deps));
  bodyChildren.push(kv("Affected files", g.files));
  bodyChildren.push(kv("Verification", g.tests));
}
bodyChildren.push(body("Approval gates: any migration, any change to production data, and any new cron deployment require explicit owner approval before execution. All work happens in feature commits with the existing test suites green before each push.", { before: 120 }));

/* Chapter 13 — Readiness */
bodyChildren.push(h1("13. Production Readiness Assessment"));
bodyChildren.push(body("Verdict: NOT production-ready as a whole; usable for the Personal tier with known gaps, not ready for the Business tier's promises, and administrable only with workarounds. This assessment is evidence-based and deliberately not a claim that the application is bug-free."));
bodyChildren.push(bullet("Solid and verified: conversation lifecycle (delete, trash, undo, restore, threading) with regression coverage; authentication primitives (hashing, OTP hygiene, rate-limited login, fail-closed JWT); admin authorization on every handler; business data isolation; email HTML sanitization; cron authentication; push dispatch pipeline."));
bodyChildren.push(bullet("Blocking for the Personal tier: multi-recipient send always fails (F-01); CC/BCC silently dropped (F-02); scheduled mail delivered immediately (F-03). A user hitting any of these loses mail silently today."));
bodyChildren.push(bullet("Blocking for security posture: attachment egress can execute attacker content on the app origin (F-04, F-05); 2FA is inert (F-06); revocation is cosmetic (F-07). These are the first fixes to approve."));
bodyChildren.push(bullet("Blocking for the Business tier: campaigns never send or track (F-13); verification gate accepts fabricated documents (F-15); subscription state never enforced (F-16); trial restart loop (F-19); team invites inert (F-20)."));
bodyChildren.push(bullet("Admin operability: impersonation broken (F-08), login audit trail empty (F-09), settings decorative (F-10) - administrators currently manage the platform with less tooling than the UI suggests."));
bodyChildren.push(body("Recommended posture: approve remediation Groups 1-3 (and the seed guard F-18) as one controlled sequence; treat the Business tier groups (F-13, F-15, F-16, F-19) as the second wave with explicit product decisions on campaigns and team access; schedule Groups 5-6 thereafter. Re-run the lifecycle and payload suites plus new regression tests after each group, and re-run this audit's IDOR and auth sweeps after Group 2.", { after: 200 }));

/* ── Document assembly ── */
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };
const pageFooter = () => new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: FONT })],
  })],
});
const pageHeader = () => new Header({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "EzyMail Production Audit Report", size: 18, color: "808080", font: FONT })],
  })],
});

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: FONT, size: 22, color: PAL.body }, paragraph: { spacing: { line: 312 } } },
      heading1: { run: { font: HFONT, size: 32, bold: true, color: PAL.headingColor }, paragraph: { spacing: { before: 360, after: 160, line: 312 }, outlineLevel: 0 } },
      heading2: { run: { font: HFONT, size: 26, bold: true, color: PAL.headingColor }, paragraph: { spacing: { before: 260, after: 120, line: 312 }, outlineLevel: 1 } },
      heading3: { run: { font: HFONT, size: 23, bold: true, color: PAL.headingColor }, paragraph: { spacing: { before: 220, after: 100, line: 312 }, outlineLevel: 2 } },
    },
  },
  sections: [
    { properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1({
        title: "EzyMail Production Application Audit",
        subtitle: "Full-Stack Quality, Reliability and Security Audit - Personal User, Business, Admin, API and Database",
        englishLabel: "PRODUCTION AUDIT",
        metaLines: [
          "Scope: 67 API routes, 173 source files, 21 database models",
          "Repository: hijraxcommunity/ezymail at commit 8a87f6d",
          "Method: static code audit plus controlled local test execution",
          "Date: November 13, 2026",
        ],
        footerLeft: "EzyMail - ezy.af", footerRight: "CONFIDENTIAL - INTERNAL",
        palette: PAL.cover,
      }) },
    { properties: { type: SectionType.NEXT_PAGE, page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } } },
      footers: { default: pageFooter() },
      children: frontMatter },
    { properties: { type: SectionType.NEXT_PAGE, page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
      headers: { default: pageHeader() }, footers: { default: pageFooter() },
      children: bodyChildren },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("/home/z/my-project/download/EzyMail-Production-Audit-Report.docx", buf);
  console.log("WROTE docx,", buf.length, "bytes; findings:", totalConfirmed, "(P1", P1.length, "P2", P2.length, "P3", P3.length, ") suspected:", suspected.length, "cleared:", cleared.length);
});
