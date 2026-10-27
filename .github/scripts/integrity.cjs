// EzyMail integrity guard (Tier 2 protection)
// Catches files silently lost to snapshot-revert + auto-commit sweeps
// (e.g. src/app/api/upload/route.ts vanished 5x, causing "upload fails (404)").
// Fails CI when: any relative import in src/ points to a missing file,
// or a critical file is missing from the tree.
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = 'src';

// Files that MUST exist for the app to work. Add future critical files here.
const CRITICAL_FILES = [
  'package.json',
  'prisma/schema.prisma',
  'src/lib/auth.ts',
  'src/lib/db.ts',
  'src/app/api/upload/route.ts',
  'src/app/api/attachments/[path]/route.ts',
  'src/app/api/emails/route.ts',
  'public/firebase-messaging-sw.js',
  '.github/workflows/ci.yml',
];

const TS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css'];
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](\.\.?\/[^'"]+)['"]/g;

const brokenImports = [];
const tsFiles = [];

(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(entry.name)) tsFiles.push(p);
  }
})(SRC);

for (const file of tsFiles) {
  const src = fs.readFileSync(file, 'utf8');
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const base = path.resolve(path.dirname(file), m[1]);
    const candidates = path.extname(base)
      ? [base]
      : TS_EXTS.map((x) => base + x).concat([
          path.join(base, 'index.ts'),
          path.join(base, 'index.tsx'),
        ]);
    if (!candidates.some((c) => fs.existsSync(c))) {
      brokenImports.push(`${path.relative('.', file)}  ->  ${m[1]}`);
    }
  }
}

const missingCritical = CRITICAL_FILES.filter((f) => !fs.existsSync(f));

if (brokenImports.length || missingCritical.length) {
  if (missingCritical.length) {
    console.error('MISSING CRITICAL FILES:');
    for (const f of missingCritical) console.error('  ' + f);
  }
  if (brokenImports.length) {
    console.error('BROKEN IMPORTS:');
    for (const b of brokenImports) console.error('  ' + b);
  }
  process.exit(1);
}

console.log(
  `Integrity OK: ${tsFiles.length} TS files checked, all imports resolve, ` +
  `${CRITICAL_FILES.length} critical files present`
);
