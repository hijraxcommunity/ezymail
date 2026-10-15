# EzyMail UI Patterns

## How to use this document
This file records reusable patterns observed in the existing product. It must be updated based on actual screens and code—not on assumptions. If a pattern is not documented yet, inspect a comparable screen before implementing it.

## Contacts page reference pattern
The available Contacts reference shows a restrained, clean layout with a page header, search, compact filters, and contact rows/cards.

When extending Contacts:
- Preserve the current page hierarchy and established header actions.
- Keep search visually and functionally consistent with other EzyMail search fields.
- Reuse the existing filter/control styles.
- Keep contact identity information readable and visually hierarchical.
- Reuse the existing avatar, row/card, icon, and navigation patterns where available.
- Ensure long names and email addresses do not overlap action icons or become unreadable.
- Do not redesign the Contacts page to add a related feature such as groups, import, or bulk actions.

## New Contact form reference pattern
The available New Contact reference shows a form with a clear title, close control, labeled fields, required-field indicators, and Create/Cancel actions.

When extending this form or building a similar form:
- Reuse the existing dialog and field components.
- Preserve established field order, spacing, validation, and footer-action conventions unless the task explicitly changes them.
- Keep required-field indicators and error messages clear.
- Prevent the dialog from overflowing on small screens.
- Do not introduce a different modal style for a related feature without a reason.

## Pattern for new feature screens
1. Find the closest existing screen with a similar purpose.
2. Identify its reusable components and interaction conventions.
3. Reuse them rather than copying and independently restyling them.
4. Implement only the requested difference.
5. Verify responsive behavior and related existing flows.

## Pattern inventory to complete over time
Add notes and approved references as screens are reviewed:
- Inbox and folders
- Email detail and conversation/thread
- Compose and reply
- Search and filters
- Attachment/document viewer
- Settings and profile
- Authentication and recovery
- Business workspace
- Notifications and permission prompts
- Empty, loading, error, and confirmation states

Do not claim a pattern is approved until it has been checked against the current implementation and product intent.
