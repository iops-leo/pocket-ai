

## WORKING MEMORY
[2026-02-24T12:49:09.867Z] 2026-02-24: fixed PWA new-session modal placeholder by implementing POST /api/sessions call with generated ECDH public key and metadata. Updated server GET /api/sessions to return online+offline sessions (online first) so newly created offline sessions are visible.

[2026-02-24T12:56:07.557Z] Added recent-paths UX: server endpoint GET /api/sessions/recent-paths dedupes cwd from DB sessions metadata, dashboard fetches and passes recentPaths to NewSessionModal, modal renders clickable recent path chips.
[2026-02-24T13:30:59.061Z] Implemented structured transcript watchers for codex and gemini in packages/cli/src/utils/session-watcher.ts; start command now selects watcher by engine (claude/codex/gemini) and only uses PTY text relay fallback when no watcher exists. Session key storage now keyed by cwd+engine.