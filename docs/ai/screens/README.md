# Approved EzyMail Screen References

Place approved screenshots in this directory. Use screenshots captured from the actual EzyMail application—not generic images—as references for visual consistency.

Suggested filenames:
- `contacts.png`
- `new-contact.png`
- `inbox.png`
- `email-detail.png`
- `compose.png`
- `attachment-viewer.png`
- `settings.png`
- `profile.png`

For each screenshot, optionally add a short note describing:
- screen and viewport size
- whether it represents desktop or mobile
- whether light or dark mode is shown
- what parts are approved and should remain consistent
- any known limitations that are not intended to be copied

A screenshot is a reference, not an instruction to rebuild the screen. Agents must inspect the implementation and modify only what the task requires. Remove or replace references when the UI intentionally changes.

## Current approved screenshots

| File | Screen | Viewport / mode | Approved for | Notes |
|------|--------|-----------------|--------------|-------|
| `settings.png` | Settings panel (Profile, Security, Appearance & Preferences, Filters & Rules, Account, Sign Out) over an open email detail | Mobile (portrait), light mode | Settings list layout, icon+label rows, colored icon chips, section spacing, footer "EzyMail v1.0 From HijraX" | Blue pen annotations on the attachment chip are historical feedback (since resolved) — do not copy the annotations |
| `signup-birthday.png` | Personal signup, step 2 "When's your birthday?" (Month/Day/Year selects + WhatsApp number with `+93` prefix) | Desktop (narrow card), light mode | Stepper (Name/Birthday/Password/Review), card layout, input styling, helper text, primary Continue button | Red box around `+93` marks the default country code decision (shipped) — annotations are feedback, not design |
| `password-reset-country-picker.png` | Password reset with WhatsApp verification; country code dropdown open ("Search country or code", Afghanistan +93 highlighted) | Desktop, light mode | Country picker as a floating portal overlay: rounded search field focus ring, flag + name + code rows, highlight state, no clipping by parent card | Approved after the portal-overlay fix; keep this overlay behavior |
| `email-detail.png` | Email thread "Re: Reply fixes" — collapsed reply preview under sender name, expanded message body, Reply/Reply All/Forward actions | Desktop, light mode | Thread header layout, collapsed-preview alignment, spacing between replies, action button row | Red pen marks the spacing that was subsequently fixed — current shipped spacing is the reference |

Screenshots captured from the real app (production and pre-production builds) between Sep–Oct 2026 by the product owner. External app references (Gmail, Chrome) are intentionally NOT stored here — they are task-specific inspiration, not approved EzyMail UI.
