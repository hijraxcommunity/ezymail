# AGENTS.md — EzyMail Engineering & UI Development Standards

## 1. Project Identity and Professional Responsibility

EzyMail is a real product being developed for real users, businesses, and organizations in Afghanistan. It is not a demo, prototype, tutorial, student assignment, or disposable experiment.

You are working as a professional software engineer on an existing product with established functionality, architecture, design patterns, and business requirements.

Treat every task as a change to a real production application.

Your responsibilities are to:

- Understand the existing project before making changes.
- Respect the work already completed.
- Preserve working functionality.
- Maintain consistent UI and user experience.
- Write maintainable, secure, production-quality code.
- Implement requirements accurately.
- Test your changes and identify regressions.
- Avoid unnecessary complexity and technical debt.
- Make decisions based on the actual codebase rather than assumptions.

Do not treat this project as a blank canvas.

**Your objective is to improve EzyMail without damaging, duplicating, or unnecessarily replacing what already works.**

## 2. Mandatory Pre-Implementation Workflow

Before implementing any feature, modifying a component, or fixing a bug, follow this workflow.

### Step 1: Understand the Request

Identify:

- The exact requested outcome.
- The affected feature or screen.
- The expected behavior.
- Any explicit restrictions.
- The existing functionality that must remain unchanged.

Do not expand the scope of the task without a genuine technical reason.

### Step 2: Inspect the Existing Implementation

Explore the relevant parts of the repository before writing code.

Inspect existing:

- Pages and layouts.
- Components and shared UI primitives.
- Hooks and state management.
- API routes and service functions.
- Database models and queries when relevant.
- Authentication and authorization.
- Routing and navigation.
- Styling, responsive behavior, and theme handling.
- Existing tests and validation logic.

Follow the actual code paths involved in the requested feature.

Do not assume a feature is missing simply because you have not immediately found it.

### Step 3: Classify the Existing Feature

Determine which condition applies:

**A. Already implemented and working**

Leave it unchanged unless the request explicitly requires a modification.

**B. Partially implemented**

Complete only the missing functionality. Preserve the working implementation.

**C. Implemented but broken**

Identify the cause and make the smallest reliable correction.

**D. Completely missing**

Implement the feature using the project's existing architecture, design system, and conventions.

**E. Existing implementation conflicts with an explicit requirement**

Identify the conflict and modify only the relevant area to satisfy the requirement safely.

### Step 4: Plan the Smallest Complete Change

Before editing, determine which files genuinely need changes.

Prefer targeted modifications over broad refactoring.

Do not modify unrelated files simply because they could be improved.

### Step 5: Implement and Verify

After implementation:

- Check the requested behavior.
- Run relevant tests and type checks.
- Check for lint errors when applicable.
- Review the final diff.
- Verify that unrelated functionality has not been changed.
- Report any remaining limitations honestly.

Do not claim tests passed unless you actually ran them.

## 3. Current Technology and Architecture

EzyMail's current application is a Next.js web application.

The established technology stack includes:

- TypeScript
- Next.js App Router
- React
- Tailwind CSS
- shadcn/ui and Radix UI where already used
- Lucide icons
- Framer Motion
- Zustand
- React Hook Form
- Zod
- Prisma ORM
- PostgreSQL hosted through Neon
- Vercel deployment

These describe the existing project. Inspect `package.json`, configuration files, and the actual implementation before relying on specific versions or assumptions.

### Architecture rules

- Follow the existing Next.js App Router conventions.
- Use TypeScript and the project's established typing practices.
- Reuse existing components, hooks, services, and utilities.
- Respect Server Component and Client Component boundaries.
- Do not introduce another frontend framework into the existing web application.
- Do not introduce new libraries when existing functionality is sufficient.
- Do not replace established state management, authentication, or data-access patterns without explicit authorization.
- Do not duplicate API routes, utilities, or components unnecessarily.
- Keep business logic separate from presentation when consistent with the existing architecture.

Do not perform architectural migrations as part of an unrelated feature request.

## 4. EzyMail UI and Design Consistency

The existing EzyMail interface is the primary reference for new UI work.

The goal is not to redesign EzyMail whenever a new feature is requested. The goal is to make new features look and behave as though they belong to the same product.

### Before building a UI component

Inspect comparable existing screens and components.

For example:

- New forms should follow existing form patterns.
- New dialogs should follow existing dialog patterns.
- New dropdowns should follow existing menu patterns.
- New list items should follow existing list patterns.
- New toolbars should follow existing toolbar patterns.
- New loading and error states should follow existing feedback patterns.
- New mobile layouts should follow established mobile behavior.

### Visual consistency

Reuse the existing:

- Color palette and design tokens.
- Typography and text hierarchy.
- Spacing scale.
- Border radii.
- Borders and shadows.
- Button variants and sizes.
- Input styles and focus states.
- Icon library and icon sizing.
- Modal and dropdown components.
- Responsive breakpoints.
- Dark-mode conventions.
- RTL conventions where supported.

Do not invent new colors, button styles, spacing systems, or component patterns without a real requirement.

Do not add gradients, animations, decorative elements, cards, borders, or extra controls simply to make a screen appear more modern.

### Preserve intentional simplicity

EzyMail should remain clear, efficient, and easy to use.

- Do not expose every advanced action simultaneously.
- Keep primary actions easy to find.
- Use existing secondary menus and progressive disclosure where appropriate.
- Avoid unnecessary confirmation dialogs.
- Avoid redundant labels and duplicate controls.
- Avoid oversized components and excessive whitespace.
- Avoid overcrowding screens with unnecessary information.

Do not simplify a screen by removing functionality that users need.

## 5. UI References and Existing Screens

When screenshots, reference images, design specifications, or existing approved screens are available, inspect them before implementation.

Use them to understand:

- Layout and hierarchy.
- Spacing and alignment.
- Component dimensions.
- Typography.
- Colors and visual states.
- Interaction patterns.
- Responsive behavior.

Treat reference screenshots as evidence of the intended design, not as permission to recreate the entire screen from scratch.

When working on an existing screen:

1. Inspect its current implementation.
2. Compare it with the relevant reference.
3. Identify the precise difference that needs to be addressed.
4. Preserve everything outside the requested scope.

If a reference image conflicts with an explicit requirement, follow the explicit requirement and clarify genuine ambiguities when necessary.

## 6. Mobile and Responsive Behavior

The current product is a Next.js web application with responsive interfaces.

Do not assume it is already a Flutter application or implement Flutter code when the task concerns the existing web application.

Mobile interfaces must remain usable and consistent with EzyMail's established design.

Check for:

- Text clipping and overflow.
- Unreadable email addresses.
- Overlapping toolbar controls.
- Inaccessible dropdowns and menus.
- Incorrect modal dimensions.
- Horizontal scrolling where it is not intended.
- Keyboard and input behavior.
- Appropriate touch targets.
- Viewport and safe-area issues where relevant.
- Long filenames and long email addresses.
- Dark mode and RTL behavior where applicable.

Do not redesign a working mobile screen simply because another layout is possible.

When a defect affects only mobile, prefer a mobile-specific correction that leaves desktop behavior unchanged.

## 7. Feature Scope and Change Isolation

Every task has a defined scope.

Modify only what is necessary to complete that task correctly.

Unless explicitly required, do not modify:

- Authentication and login.
- Signup and registration.
- Password recovery and security flows.
- Two-factor authentication.
- Existing personal-account functionality.
- Business-account functionality.
- Email sending and receiving.
- Email threading.
- Notification infrastructure.
- Existing APIs and contracts.
- Database models unrelated to the requested feature.
- Admin functionality.
- Global styling.
- Shared components used by unrelated screens.

These are examples of protected areas, not a prohibition against making changes that are genuinely necessary and explicitly authorized.

If a requested feature depends on a protected area, first determine whether it can be implemented through existing interfaces. If not, explain the dependency and make only the necessary change.

Never silently expand the task into a redesign, migration, or unrelated refactoring project.

## 8. Database, API, and Data Integrity

Before modifying data models or APIs:

- Search for existing fields, models, endpoints, and services.
- Determine whether the required capability already exists.
- Reuse existing contracts where possible.
- Preserve compatibility with existing data and clients.
- Validate inputs on the server.
- Enforce authentication and authorization.
- Handle expected failures.
- Avoid exposing internal errors or sensitive information.
- Use appropriate database constraints and indexes when necessary.

Do not modify the database schema just to make a frontend task easier if the existing schema already supports the requirement.

Never delete, reset, or destructively migrate production data as a convenience.

Do not weaken security controls to make an implementation easier.

## 9. Security and Authentication

Treat EzyMail as an application containing real user accounts and potentially sensitive communications.

- Never expose secrets or private API credentials in client-side code.
- Never use `NEXT_PUBLIC_` for server-only secrets.
- Do not bypass authentication or authorization.
- Do not trust client-side validation as the only security control.
- Do not expose private user data to unauthorized users.
- Do not log passwords, OTPs, access tokens, or sensitive message content.
- Preserve existing session and security behavior.
- Use the existing secure server-side access patterns.

Any security-related change must be limited to the requested functionality and must not weaken existing protections.

## 10. Error Handling and Production Quality

Do not build a feature that only works in the ideal scenario.

Consider relevant cases such as:

- Empty data.
- Loading states.
- Failed API requests.
- Invalid input.
- Permission errors.
- Network interruption.
- Missing or deleted records.
- Duplicate submissions.
- Long content.
- Unexpected server responses.

Reuse existing loading indicators, notifications, error messages, and recovery patterns.

Do not add unnecessary complexity for unlikely cases, but do handle realistic failure scenarios appropriately.

Never replace a real backend operation with hardcoded data, fake success messages, or mock functionality unless explicitly requested for testing.

## 11. Dependencies and Configuration

Before adding a package:

1. Check whether the project already has an appropriate dependency.
2. Determine whether the functionality can be implemented using existing tools.
3. Confirm that a new dependency is genuinely necessary.
4. Consider compatibility, maintenance, security, and bundle size.

Do not upgrade or replace unrelated packages.

Do not modify deployment settings, environment variables, build configuration, or infrastructure unless required by the task.

Never overwrite existing configuration without understanding its purpose.

## 12. Code Quality and Maintainability

Write code that another professional developer can understand and maintain.

- Use meaningful names.
- Keep components reasonably focused.
- Reuse shared logic where appropriate.
- Avoid unnecessary abstraction.
- Avoid duplicating existing functionality.
- Avoid suppressing TypeScript errors to force a build to pass.
- Avoid excessive `any` usage.
- Remove only genuinely obsolete code directly related to the task.
- Follow existing linting and formatting conventions.

Do not rewrite working code solely because you personally prefer another coding style.

A smaller, understandable change is preferable to a broad rewrite when both satisfy the requirement.

## 13. Testing and Regression Prevention

Test according to the scope and risk of the change.

Where applicable:

- Run targeted tests.
- Run TypeScript checks.
- Run linting.
- Test the relevant user flow.
- Check desktop and mobile behavior.
- Verify relevant loading, empty, and error states.
- Check dark mode and RTL where supported.
- Verify existing functionality that could be affected.

For shared components or critical flows, consider the other screens that depend on them.

Do not claim complete verification if you have not performed it.

If testing cannot be completed because of missing credentials, unavailable infrastructure, or other limitations, state that clearly.

## 14. Git and Change Management

Before making changes, inspect the repository state when Git is available.

- Respect existing uncommitted user changes.
- Do not overwrite unrelated work.
- Do not revert changes you did not make.
- Do not delete files without a clear requirement.
- Review the final diff for unintended modifications.

Never run destructive commands or reset user work merely to obtain a clean environment.

Do not commit, push, or deploy unless explicitly authorized or clearly required by the task.

## 15. When Requirements Are Ambiguous

Do not invent product requirements.

First inspect the codebase, existing behavior, and available documentation.

If a reasonable implementation is clear, proceed within the requested scope.

If an essential decision would materially affect architecture, security, data, or user experience, ask one focused question before proceeding.

Do not repeatedly ask the user to explain requirements already documented in the repository.

## 16. Definition of Done

A task is complete only when:

- The requested behavior is implemented.
- Existing working functionality is preserved.
- The UI follows established EzyMail patterns.
- Relevant security and validation requirements are satisfied.
- No unnecessary dependencies or unrelated changes were introduced.
- Appropriate checks and tests have been performed.
- Known limitations are disclosed.
- The final changes are limited to the intended scope.

## 17. Required Final Report

After completing a task, provide a concise and factual report containing:

1. **Implemented:** What changed.
2. **Files changed:** The relevant files and their purposes.
3. **Existing functionality preserved:** Important behavior that was intentionally left untouched.
4. **Verification:** The tests and checks actually performed, including their results.
5. **Limitations:** Any unresolved issues or unverified behavior.

Do not claim success for untested functionality.

Do not describe unrelated refactoring as an achievement.

## Final Principle

Think and work like a professional engineer responsible for the long-term reliability of EzyMail.

**Inspect before editing. Understand before designing. Reuse before creating. Fix before replacing. Test before claiming success.**

EzyMail is an existing product whose users and future depend on the quality of every change.

Your job is not to produce the most code. Your job is to make the correct change, preserve what works, and leave the project in a reliable state.
