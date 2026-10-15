# EzyMail UI Design System

## Purpose
This document defines how AI agents should preserve and extend EzyMail's existing visual language. It is a governance document, not permission to redesign the product.

## Source of truth
1. Existing implementation and shared design tokens.
2. Approved screen references in `docs/ai/screens/`.
3. Existing screens/components with the same interaction pattern.
4. Explicit requirements in the current task.

If these sources disagree, do not silently invent a new direction. Follow explicit task requirements and flag meaningful conflicts.

## Inspect before specifying
Before changing UI, inspect:
- global CSS and Tailwind configuration
- theme variables and color tokens
- shared button, input, dialog, dropdown, tooltip, and toast components
- typography and spacing conventions
- breakpoints and responsive utilities
- dark-mode and RTL implementation, if present

Record actual values from the code. Do not invent hex colors, spacing scales, radii, or font sizes from memory or from generic design examples.

## Design principles
- Clear hierarchy: primary information and actions should be easy to identify.
- Simplicity: avoid unnecessary decoration, duplicate controls, and excessive visual noise.
- Consistency: similar controls should look and behave alike across screens.
- Readability: handle long names, email addresses, filenames, and error messages gracefully.
- Predictability: reuse familiar interaction patterns.
- Accessibility: preserve visible focus, semantic controls, usable contrast, and keyboard interaction.
- Responsive quality: adapt layouts to the viewport rather than merely shrinking desktop content.

## Component reuse
Before creating a component, search for an existing one that serves the same purpose. Prefer extending a shared component only when the change is backward-compatible and does not unintentionally alter other screens.

Use existing components for:
- buttons and icon buttons
- text fields and validation
- dialogs and sheets
- dropdown/action menus
- cards and list rows
- loading, empty, success, and error states
- navigation and toolbars

Do not create a second design system for a single feature.

## Forms and dialogs
Follow existing form/dialog patterns for title hierarchy, labels, required-field indicators, validation, spacing, footer actions, dismissal, loading, and errors. Do not change dialog dimensions or convert a dialog to a page unless the task calls for it or the current pattern is demonstrably unsuitable.

## Responsive behavior
Check relevant UI at desktop and mobile widths. Prevent:
- clipped or overlapping text
- inaccessible controls
- unintended horizontal overflow
- buttons pushed outside the viewport
- fixed-height containers hiding content
- menus opening outside the visible viewport

Long content should wrap or truncate according to the established pattern; do not apply ellipsis or nowrap indiscriminately.

## Themes and direction
Reuse existing dark-mode and RTL behavior if implemented. Avoid hard-coded left/right assumptions where logical properties or established direction-aware utilities are used elsewhere.

## Motion
Use existing motion patterns only where they improve feedback or continuity. Avoid adding animation merely for decoration. Respect reduced-motion support if the application already handles it.

## Change policy
A UI task is not an invitation to redesign the surrounding screen. Preserve everything outside the requested scope. If the current design is already consistent and works correctly, leave it alone.
