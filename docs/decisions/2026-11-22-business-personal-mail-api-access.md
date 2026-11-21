# Decision: Business accounts may use the personal mail APIs (S-12)

**Date:** 2026-11-22 (Batch 9, decision D3)
**Status:** Accepted — architecture unchanged, documented
**Decided by:** Owner (Batch 9 authorization)

## Context

EzyMail has two account types in one application:

- **Personal accounts** (`User.accountType = 'personal'`) use the mail
  application: `/api/emails`, folders, search, labels, contacts, rules,
  templates, drafts, scheduled mail, push notifications.
- **Business accounts** (`User.accountType = 'business'`) additionally get
  the business suite: `/api/business/*` (customers, campaigns, analytics,
  team, verification) gated by subscription state
  (`requireActiveBusiness`, see the F-16 guards).

`src/app/page.tsx` routes business users to `BusinessApp`
(`page.tsx:483-487`), so the primary UI they see is the business suite.
The API layer, however, has never blocked a business account from calling
the personal mail endpoints: the same session/JWT a business user holds
works on `/api/emails` and friends. Business analytics even counts that
personal traffic (`business/analytics/route.ts:31-37` reads the caller's
own mail rows), which suggests the mixed behavior was observed and accepted
rather than accidental. The original audit recorded this as the open
product question **S-12: "Business accounts can use personal mail APIs —
possibly intended."**

## Decision

The owner decided (Batch 9, D3): **leave the architecture unchanged.**
Business accounts keep full access to the personal mail APIs alongside the
business suite. No architectural rewrite, no endpoint blocking.

Rationale recorded at decision time:

1. A business account is a superset of a personal account in this product:
   the same human registered with a verified WhatsApp number and owns a
   normal mailbox. Blocking their mail would break real user workflows
   (reading their own inbox, sending mail) that the product has always
   allowed, in exchange for no security gain.
2. All personal mail operations remain **owner-scoped** by the existing
   authorization invariants — every query pins `senderId = session.userId`
   or `recipientEmail = session.email`, labels are user-scoped (F-29),
   admin data stays behind `role === 'admin'`. A business user calling
   personal APIs can only ever touch their OWN mailbox, exactly like a
   personal user. There is no cross-tenant surface to close.
3. The analytics overlap is accepted: a business user's personal mail
   activity legitimately belongs to that business's own usage numbers.

## Consequences and limitations (documented, not fixed here)

- **Mail and business quotas are independent.** The per-route rate limits
  (`checkRateLimitKey`, shared PostgreSQL store as of Batch 9 D4) apply per
  user/IP regardless of account type; there is no combined business-level
  quota.
- **A business subscription's trial/active state gates business DATA
  routes only** (`requireActiveBusiness` on `/api/business/*`). Mail
  continues to work for an expired business account, exactly as it does
  for a personal account. This is intentional: mail access must not
  depend on the subscription clock (the 15-day trial is a business-suite
  trial, not a mailbox lock).
- **Campaigns are not mail.** Campaigns (`/api/business/campaigns`) never
  deliver through the personal mail pipeline — recipients are external
  `Customer` contacts and no outbound transport exists (see the D1
  decision in the Batch 9 plan). A campaign's recipients cannot be reached
  by any mail API today.
- **Future tightening, if ever wanted**, is a scoped change: a
  `requirePersonalOrBusiness` guard is already the natural shape
  (`src/lib/business-guard.ts` holds the sibling `requireActiveBusiness`),
  and the route list to touch is the personal mail surface under
  `src/app/api/emails*`, `/api/folders`, `/api/labels`, `/api/rules`,
  `/api/templates`, `/api/drafts`, `/api/contacts`, `/api/user/*`. The
  frontend would need matching UI guards. Nothing in this document
  authorizes that change.

## References

- Audit register: `scripts/audit-findings-2.js`, entry `S-12`.
- Routing: `src/app/page.tsx:483-487` (`BusinessApp` mount).
- Business guard: `src/lib/business-guard.ts` (`requireActiveBusiness`).
- Batch 9 plan (owner decision D3): delivered with the Batch 9 release.
