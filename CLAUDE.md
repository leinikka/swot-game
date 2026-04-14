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
- `ANTHROPIC_API_KEY` — required for AI classification and speech bubbles
- `PORT` — server port (default 3000)
- `SESSION_DURATION` — countdown timer in seconds (default 150)

## Architecture

**Single-server, single-page app** — Express serves the same `public/index.html` for both `/` (participant) and `/admin` routes. The client switches UI based on `location.pathname`.

### Server (`server.js`)

- **Session state is in-memory** (no database). Restarting the server loses all data.
- **Timer starts on first submission**, not on session start. The admin's "Start Session" just opens the session for submissions.
- **Two-stage AI pipeline per submission**: (1) `classifySubmission` classifies into SWOT category, subcategory, and confidence (1-10), (2) `generateSpeechBubbles` generates 1-2 short Swedish speech lines for agents based on context (confidence level, consecutive count, submission text). Both use Claude Sonnet.
- **Socket.io** broadcasts all state changes. Key events: `submission:new` (immediate), `submission:classified` (after AI), `speech:bubbles` (after speech generation). New clients receive full state on connect via `session:state`.
- **Consecutive agent tracking** (`session.consecutiveAgent` / `consecutiveCount`) feeds into speech bubble generation so agents react to getting many submissions in a row.
- **Excel export** uses ExcelJS to build a multi-sheet workbook on demand. Filenames auto-increment to avoid overwrites.

### Frontend (`public/index.html`)

- Vanilla JS, no framework, no build tooling. All CSS and JS are inline. **All UI text is in Swedish.**
- **Participant view**: text input form, timer display, session-inactive state. Submissions go via `POST /api/submit`.
- **Admin view**: QR code panel, SVG circular timer ring, 2×2 stats grid, animation panel, scrollable live feed ("Inflöde").
- **Feed items** appear immediately as "pending" on `submission:new`, then get removed from feed when the agent picks up the envelope.

### Animation System (CSS + requestAnimationFrame)

- **Layout**: center mailbox ("Inkorg") with envelope stack; four SWOT agents in corners (S top-left, W top-right, O bottom-left, T bottom-right).
- **Delivery flow**: on `submission:classified`, the target agent's character is hidden, a walking clone walks from the corner to the mailbox (2800ms eased), picks up an envelope (removes from mailbox stack + feed), adds a carrying bob animation, then walks back home. Deliveries are **queued sequentially** via `deliveryQueue`.
- **Home bases** show an envelope stack graphic (visible only when count > 0) and a counter number.
- **Speech bubbles**: white rounded bubbles above agents, animated in/out, auto-fade after 3.5s. Triggered by `speech:bubbles` event, idle timer (10s no activity), and timer-end closing lines.
- Agent characters are CSS pixel-art (head, body with letter, legs with walk animation). `face-left` class flips via `scaleX(-1)`.

### Color Scheme

Consistent across UI, animation, and Excel export:
- S (Styrkor): `#27ae60` green
- W (Svagheter): `#f39c12` orange
- O (Möjligheter): `#2980b9` blue
- T (Hot): `#e74c3c` red

### AI Classification

Uses Claude Sonnet (`claude-sonnet-4-20250514`) for both classification and speech bubbles. Classification returns `{swot, subcategory, reason, confidence}`. Speech bubble generation is fire-and-forget (doesn't block the classification broadcast). Falls back gracefully on errors — classification defaults to `S/other/confidence:3`, speech bubbles silently skip.
