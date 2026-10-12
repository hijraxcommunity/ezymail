# EzyMail Architecture Rules

## Existing architecture is authoritative
Inspect the current repository and `package.json` before relying on assumed versions, directory layouts, or library APIs.

## Frontend
- Follow the existing Next.js App Router conventions.
- Respect Server Component and Client Component boundaries.
- Reuse existing styling and component libraries.
- Keep client-side code free of server-only secrets and privileged operations.

## State and forms
- Reuse the project's established state-management and form-validation patterns.
- Do not add another library for a single feature without a strong reason.
- Preserve current validation and error-handling behavior.

## APIs and data
- Search existing API routes and services before creating endpoints.
- Reuse Prisma models and existing data relationships when suitable.
- Validate and authorize on the server.
- Preserve API compatibility and existing data.
- Avoid schema changes unless the requirement genuinely needs new persisted data.

## Configuration and deployment
- Do not modify environment configuration, deployment settings, build configuration, or dependencies unless required.
- Never print or expose secret values.
- Do not deploy or change production infrastructure without authorization.
