# EzyMail Feature Implementation Rules

## Required decision tree
For every requested feature, classify the existing state before changing code:

- **Working:** do not modify unless explicitly requested.
- **Partial:** complete only the missing behavior.
- **Broken:** identify and fix the specific cause.
- **Missing:** implement using existing architecture.
- **Conflicting:** resolve only the conflict with the explicit requirement.

## Reuse first
Search before creating a new:
- component
- hook
- API endpoint
- service
- utility
- form or validation schema
- dialog or menu
- database model or field
- state-management pattern

## Scope
Make the smallest complete change. Do not include unrelated refactors, formatting sweeps, dependency upgrades, or UI redesigns.

## Acceptance criteria
Before coding, identify what observable behavior proves the feature is complete. Test those behaviors afterward. Include relevant failure states and regression checks.

## Completion report
State what was changed, which files changed, what checks ran, and any limitations. Never claim unperformed tests passed.
