# EzyMail Change Safety Rules

1. Inspect repository status before edits when Git is available.
2. Preserve existing user changes.
3. Identify the smallest set of relevant files.
4. Do not change unrelated features or files.
5. Do not replace working implementations just to use a preferred coding style.
6. Do not remove existing behavior, API contracts, or data without explicit justification.
7. Do not run destructive database, Git, or deployment commands without authorization.
8. Review the final diff for unrelated changes.
9. Run relevant checks and report exactly what was verified.
10. If a broader change appears necessary, explain the dependency and seek approval when the impact is significant.

Protected areas by default include authentication, password recovery, 2FA, personal email, business email, sending/receiving, threading, notifications, admin functionality, shared navigation, global styling, and unrelated database models. A task may touch these only when it explicitly requires it or a necessary dependency is identified.
