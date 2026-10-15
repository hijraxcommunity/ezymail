# EzyMail — AI Engineering Instructions

## 1. Product context
EzyMail is a real product intended for real users, businesses, and organizations in Afghanistan. It is not a demo, tutorial, student assignment, or disposable prototype. Work as a responsible engineer maintaining an existing product.

The current application is a Next.js web application. Do not assume Flutter or another frontend framework is part of the current implementation unless the user explicitly requests a separate project.

## 2. Mandatory workflow
Before changing code:
1. Understand the requested outcome and explicit scope.
2. Inspect the relevant existing pages, components, hooks, services, API routes, data models, tests, and design patterns.
3. Determine whether the feature is already working, partial, broken, missing, or in conflict with an explicit requirement.
4. Plan the smallest complete change.
5. Implement using existing architecture and components wherever possible.
6. Test the change and inspect the final diff for unrelated edits.

Decision rules:
- Already implemented and working: leave it unchanged unless the request explicitly requires a change.
- Partially implemented: complete only the missing part.
- Broken: fix the cause with a targeted change.
- Missing: implement it using existing project conventions.
- Conflicting with an explicit requirement: resolve only the relevant conflict.

Never assume a feature is missing because it was not immediately obvious. Search before creating.

## 3. Technology and architecture
The known stack includes TypeScript, Next.js App Router, React, Tailwind CSS, shadcn/ui/Radix where already used, Lucide icons, Framer Motion, Zustand, React Hook Form, Zod, Prisma, PostgreSQL/Neon, and Vercel. Verify actual package versions and project conventions from the repository before relying on this list.

- Follow the existing App Router structure and Server/Client Component boundaries.
- Reuse existing components, hooks, API routes, services, utilities, and data-access patterns.
- Do not introduce another frontend framework or state-management library for a single feature.
- Do not migrate architecture or upgrade unrelated dependencies as part of a feature task.
- Do not duplicate existing functionality.

## 4. UI consistency
The existing EzyMail UI is the source of truth for new UI work.

Before building a screen or component, inspect similar existing screens and components. Follow `docs/ai/UI_DESIGN_SYSTEM.md` and `docs/ai/UI_PATTERNS.md` where relevant.

- Reuse the existing design tokens, typography, spacing, radii, buttons, inputs, dialogs, dropdowns, icons, loading states, and feedback patterns.
- Derive actual values from the codebase. Do not invent a new palette or design system based on assumptions.
- Do not redesign a working screen unless explicitly requested.
- Do not add decorative gradients, animations, cards, borders, controls, or extra steps without a user or product need.
- Preserve the product's intentional simplicity and existing interaction patterns.
- When reference screenshots exist, compare them with the implementation and change only what the task requires.

## 5. Responsive, theme, and direction support
EzyMail is a responsive Next.js application.

For relevant changes, check mobile and desktop behavior, long text, overflow, keyboard interaction, touch targets, loading/error/empty states, and existing dark-mode or RTL support. If a defect is mobile-only, prefer a mobile-specific fix that leaves desktop behavior unchanged.

Do not assume unsupported themes, languages, or behaviors exist; inspect the project.

## 6. Scope protection
Change only what is necessary for the requested task. Unless explicitly required, do not modify unrelated:
- authentication, login, signup, password recovery, or 2FA
- personal-account functionality
- business-account functionality
- email sending/receiving, threading, or notifications
- API contracts, database models, admin features, or global styling
- navigation and shared components used by unrelated screens

These are protected by default, not absolutely immutable. If a requested feature genuinely depends on one of them, inspect the dependency and make only the necessary, justified change. Explain significant scope dependencies rather than silently expanding the task.

## 7. Data, API, and security
- Search for existing models, fields, endpoints, and services before creating new ones.
- Preserve existing data and API compatibility where possible.
- Validate input server-side and enforce authorization server-side.
- Never expose secrets or private API keys in client-side code. Do not use `NEXT_PUBLIC_` for server-only secrets.
- Do not bypass authentication, weaken access controls, or expose private user data.
- Do not log passwords, OTPs, tokens, or sensitive message contents.
- Never reset, delete, or destructively migrate production data for convenience.
- Use real backend operations; do not replace them with hardcoded data or fake success states unless explicitly asked to create a mock.

## 8. Code quality and dependencies
- Follow existing naming, formatting, typing, lint, and testing conventions.
- Prefer clear, maintainable code over unnecessary abstraction.
- Avoid `any`, ignored type errors, and broad suppressions unless genuinely justified.
- Check existing dependencies before adding packages.
- Do not overwrite configuration or user changes without understanding them.
- Inspect Git status when available; preserve pre-existing uncommitted changes.
- Do not commit, push, deploy, or run destructive commands unless authorized.

## 9. Verification
Run relevant tests and checks available in the repository, such as targeted tests, type checks, and linting. Do not claim a check passed unless it was actually run. If a check cannot be run, say why.

Review the final diff and verify that changes are limited to the intended scope. Test likely regressions when shared components or critical flows are affected.

## 10. Clarification
Inspect the project before asking the user to repeat information already available in the code or docs. If an essential product, data, security, or architecture decision cannot be inferred safely, ask one focused question. Otherwise, proceed with the smallest reasonable implementation.

## 11. Final report
After a task, briefly report:
1. What changed.
2. Files changed and why.
3. Relevant tests/checks actually run and their results.
4. Existing functionality intentionally preserved.
5. Known limitations or unverified behavior.

## Final principle
Inspect before editing. Understand before designing. Reuse before creating. Fix before replacing. Test before claiming success.

Your job is not to produce the most code. Your job is to make the correct change and leave EzyMail in a reliable state.
