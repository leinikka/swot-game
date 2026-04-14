# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start            # Start the server (node server.js)
npm run dev          # Start with auto-reload (node --watch server.js)
```

No test framework, linter, or build step is configured. The app is plain Node.js with no compilation.

## Environment

Configured via `.env`:
- `ANTHROPIC_API_KEY` — required for AI classification
- `PORT` — server port (default 3000)
- `SESSION_DURATION` — countdown timer in seconds (default 150)

## Architecture

**Single-server, single-page app** — Express serves the same `public/index.html` for both `/` (participant) and `/admin` routes. The client switches UI based on `location.pathname`.

### Server (`server.js`)

- **Session state is in-memory** (no database). Restarting the server loses all data.
- **Timer starts on first submission**, not on session start. The admin's "Start Session" just opens the session for submissions.
- **Classification is async**: the `/api/submit` endpoint returns immediately, then classifies via Claude API in the background. Results are broadcast via Socket.io `submission:classified` event.
- **Socket.io** broadcasts all state changes (timer ticks, new submissions, classifications) to every connected client. New clients receive full state on connect via `session:state`.
- **Excel export** uses ExcelJS to build a multi-sheet workbook on demand. Filenames auto-increment (`swotgame.xlsx`, `swotgame(1).xlsx`, ...) to avoid overwrites. Color codes in Excel match the UI.

### Frontend (`public/index.html`)

- Vanilla JS, no framework, no build tooling. All CSS and JS are inline.
- **Participant view**: text input form, timer display, session-inactive state. Submissions go via `POST /api/submit`.
- **Admin view**: QR code panel, SVG circular timer ring, 2x2 stats grid, canvas animation panel, scrollable live feed.
- **Feed items** appear immediately as "pending" on `submission:new`, then update with classification badge on `submission:classified`.

### Animation Engine (Canvas 2D)

- 60fps `requestAnimationFrame` loop drawing pixel-art characters on `#agent-canvas`.
- Four SWOT agents are positioned evenly across the canvas. A purple postman character carries each classified submission to the correct agent.
- Animations are **queued sequentially** (`postmanQueue` array) — only one postman active at a time.
- Agent `pile` counts accumulate visually as letters are delivered.
- Agent positions recalculate on every frame to handle canvas resize.

### Color Scheme

Consistent across UI, animation, and Excel export:
- S (Styrkor): `#27ae60` green
- W (Svagheter): `#f39c12` orange
- O (Möjligheter): `#2980b9` blue
- T (Hot): `#e74c3c` red

### AI Classification

Uses Claude Sonnet (`claude-sonnet-4-20250514`) to classify each submission into one SWOT category and one subcategory (capacity, competence, economy, culture, technology, market, or other). Falls back to `{swot: "S", subcategory: "other"}` on any error.
