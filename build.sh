#!/bin/bash
set -e
echo "=== Starting build ==="
echo "Node: $(node -v)"
echo "npm: $(npm -v)"
echo "=== Running prisma generate ==="
npx prisma generate 2>&1
echo "=== Prisma done, running next build --webpack ==="
npx next build --webpack 2>&1
echo "=== Build complete ==="