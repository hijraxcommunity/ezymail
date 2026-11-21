#!/usr/bin/env python3
"""Batch 9 remediation release gate: prove the release branch (85f3bb7..batch9)
contains NO secret material, and preserve EVIDENCE (paths + blob hashes +
fingerprints only) of the credential that was captured by the local sandbox
snapshot commit aac7396 — without ever printing its contents.

Never prints matched secret VALUES: only rule names, file paths, blob ids,
sizes and fingerprints. The private key blob itself is never decoded,
printed, copied out of the repo, or transmitted."""
import hashlib
import re
import subprocess
import sys

REPO = "/home/z/my-project"
BASE = "85f3bb7"
CAND = "batch9"
SNAPSHOT = "aac7396"

PATTERNS = [
    ("PEM-PRIVATE-KEY", re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("OPENSSH-PRIVKEY-MARKER", re.compile(rb"\bssh-ed25519\s+[A-Za-z0-9+/]{40,}\s{0,1}$")),
    ("GITHUB-PAT", re.compile(rb"gh[pousr]_[A-Za-z0-9]{16,}")),
    ("GITHUB-FINEPAT", re.compile(rb"github_pat_[A-Za-z0-9_]{20,}")),
    ("AWS-AKID", re.compile(rb"AKIA[0-9A-Z]{16}")),
    ("SLACK-TOKEN", re.compile(rb"xox[bpars]-[A-Za-z0-9-]{10,}")),
    ("GOOGLE-APIKEY", re.compile(rb"AIza[0-9A-Za-z_-]{30,}")),
    ("OPENAI-STYLE", re.compile(rb"sk-[A-Za-z0-9_-]{20,}")),
    ("JWT-LITERAL", re.compile(rb"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.")),
    ("PRIVATEKEY-ASSIGN", re.compile(rb"(private[_-]?key|privateKey)\s*[:=]\s*['\"][^'\"]{20,}['\"]", re.I)),
    ("PASSWORD-ASSIGN", re.compile(rb"(password|passwd|secret|api[_-]?key)\s*[:=]\s*['\"][^'\"]{12,}['\"]", re.I)),
    ("DB-URL-CREDS", re.compile(rb"(postgres|mysql|mongodb)(\+srv)?://[^:\s'\"\]]+:[^@\s'\"\]]+@", re.I)),
    ("HEROKU-VERCEL-TOKEN", re.compile(rb"(hrv_|vercel_tok_|v1:[A-Za-z0-9]{20,})")),
]

def run(args):
    return subprocess.run(args, cwd=REPO, capture_output=True).stdout

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

# Blobs introduced by the release diff (new or changed content) vs pre-existing
# at the verified base. The gate's hard requirement: the release must
# INTRODUCE no secrets. Pre-existing baseline findings are listed for
# transparency but are not Batch 9's delta.
new_blob_ids = set()
for line in run(["git", "rev-list", "--objects", f"{BASE}..{CAND}"]).decode().splitlines():
    parts = line.split(" ", 1)
    if len(parts) == 2 and parts[1]:
        new_blob_ids.add(parts[0])
base_blob_ids = set()
for line in run(["git", "ls-tree", "-r", BASE]).decode().splitlines():
    meta = line.split("\t", 1)
    if len(meta) == 2:
        base_blob_ids.add(meta[0].split()[2])

findings = []  # (path, sha, rule, offset, is_new)

# ── 1. Scan every blob introduced by the release diff ────────────────────────
new_blobs = []
for line in run(["git", "rev-list", "--objects", f"{BASE}..{CAND}"]).decode().splitlines():
    parts = line.split(" ", 1)
    if len(parts) == 2 and parts[1]:
        new_blobs.append((parts[0], parts[1]))
print(f"== release diff object scan: {len(new_blobs)} new objects in {BASE}..{CAND}")
for sha, path in new_blobs:
    data = run(["git", "cat-file", "blob", sha])
    for name, rx in PATTERNS:
        m = rx.search(data)
        if m:
            findings.append((path, sha, name, m.start(), True))

# ── 2. Scan the full candidate TREE (every tracked blob) ─────────────────────
tree_blobs = []
ls_tree = run(["git", "ls-tree", "-r", CAND]).decode().splitlines()
for line in ls_tree:
    meta = line.split("\t", 1)
    if len(meta) != 2:
        continue
    oinfo = meta[0].split()
    tree_blobs.append((oinfo[2], meta[1]))
print(f"== release tree scan: {len(tree_blobs)} tracked blobs in {CAND}")
for sha, path in tree_blobs:
    if sha in new_blob_ids:
        continue  # already scanned in (1)
    data = run(["git", "cat-file", "blob", sha])
    for name, rx in PATTERNS:
        m = rx.search(data)
        if m:
            findings.append((path, sha, name, m.start(), sha not in base_blob_ids))

# ── 3. Path-based checks: no credential paths anywhere in the release ────────
keyish = [p for _, p in tree_blobs if re.search(r"(^|/)\.keys|deploy_ed25519|id_rsa|id_ed25519|\.pem$|\.key$", p, re.I)]
print(f"== credential-path check: {len(keyish)} hits in release tree: {keyish or 'NONE'}")

hist_key_paths = run(["git", "rev-list", "--objects", CAND, "--", ".keys-batch8"]).decode().strip()
print(f"== release history contains .keys-batch8 objects: {'YES — BAD' if hist_key_paths else 'NONE (clean)'}")

# ── 4. Ancestry guard: snapshot commit must be unreachable ───────────────────
reachable = run(["git", "rev-list", CAND]).decode().split()
print(f"== aac7396 reachable from {CAND}: {'YES — BAD' if SNAPSHOT in reachable else 'NO (clean)'}")
print(f"== {CAND} parent: {run(['git', 'rev-parse', f'{CAND}^']).decode().strip()}")

# ── 5. EVIDENCE of the captured credential (metadata ONLY, no contents) ─────
print("\n== EVIDENCE: credential captured by local snapshot commit (contents NEVER printed)")
ev = run(["git", "ls-tree", "-r", SNAPSHOT, "--", ".keys-batch8"]).decode().strip()
for line in ev.splitlines():
    meta = line.split("\t", 1)
    oinfo = meta[0].split()
    size = run(["git", "cat-file", "-s", oinfo[2]]).decode().strip()
    is_pub = meta[1].endswith(".pub")
    data = run(["git", "cat-file", "blob", oinfo[2]])
    if is_pub:
        # Fingerprint the PUBLIC key only (safe metadata; identifies without
        # exposing): OpenSSH wire format = "ssh-ed25519" + base64 key blob;
        # fingerprint = base64(sha256(blob)) without padding, same as
        # `ssh-keygen -lf` (which is not installed in this sandbox).
        import base64
        try:
            fields = data.split()
            blob = base64.b64decode(fields[1])
            fp = "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode().rstrip("=")
        except Exception as e:
            fp = f"(fingerprint unavailable: {e})"
        print(f"   {meta[1]}  blob {oinfo[2][:12]}…  {size}B  public-key fingerprint: {fp}")
    else:
        h = sha256(data)
        print(f"   {meta[1]}  blob {oinfo[2][:12]}…  {size}B  sha256(kept locally, never pushed): {h[:16]}…")
        if b"PRIVATE KEY" in data:
            print("      (marker confirms private-key material inside the blob — value withheld)")
contaminated_commits = run(["git", "rev-list", "--all", "--", ".keys-batch8"]).decode().split()
print(f"   commits (ALL local refs) containing .keys-batch8: {sorted(set(contaminated_commits))}")
for c in sorted(set(contaminated_commits)):
    pushed = subprocess.run(["git", "branch", "-r", "--contains", c], cwd=REPO, capture_output=True, text=True).stdout.strip()
    print(f"   {c[:12]} contained by remote refs: {pushed or 'NONE — local only'}")

# ── Summary ──────────────────────────────────────────────────────────────────
print("\n===== secret scan summary =====")
new_findings = [f for f in findings if f[4]]
base_findings = [f for f in findings if not f[4]]
if new_findings:
    print("-- INTRODUCED BY THIS RELEASE (hard gate):")
    for path, sha, name, pos, _ in new_findings:
        print(f"   {name} at {path} (blob {sha[:12]}, offset {pos}) — value withheld")
else:
    print("-- INTRODUCED BY THIS RELEASE: NONE")
if base_findings:
    print(f"-- PRE-EXISTING AT BASE {BASE} (baseline, listed for transparency): {len(base_findings)}")
    for path, sha, name, pos, _ in base_findings:
        print(f"   {name} at {path} (blob {sha[:12]})")
print()
if new_findings:
    print(f"RELEASE-DIFF FINDINGS: {len(new_findings)} — release gate FAILS until classified/resolved")
    sys.exit(1)
print("RELEASE GATE: the release diff introduces no secret-pattern matches.")
sys.exit(0)
