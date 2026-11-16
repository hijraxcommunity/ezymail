#!/usr/bin/env python3
"""Batch 4 / F-28: add mode:'insensitive' to every Prisma `contains` filter in
the user- and admin-facing search paths, so PostgreSQL behaves like the SQLite
test harness (case-insensitive). Nested patterns first, then bare ones; each
pattern is applied once so re-runs are idempotent."""
import re
from pathlib import Path

FILES = [
    "src/app/api/search/route.ts",
    "src/app/api/emails/route.ts",
    "src/app/api/contacts/route.ts",
    "src/app/api/admin/logs/route.ts",
]

NESTED = re.compile(r"\{ (\w+): \{ contains: ([\w.]+) \} \}")
BARE = re.compile(r"\{ contains: ([\w.]+) \}")

for rel in FILES:
    p = Path(rel)
    src = p.read_text()
    before = src.count("contains")
    src = NESTED.sub(lambda m: "{ %s: { contains: %s, mode: 'insensitive' } }" % (m.group(1), m.group(2)), src)
    src = BARE.sub(lambda m: "{ contains: %s, mode: 'insensitive' }" % m.group(1), src)
    p.write_text(src)
    after = src.count("mode: 'insensitive'")
    print(f"{rel}: contains={before}, insensitive added={after}")
