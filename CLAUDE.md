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

**Single-server, single-page app** — Express serves the same `public/index.html` for both `/` (participant) and `/admin` routes. The client switches UI based on `location.pathname`. Static files under `public/audio/` are served via `express.static`.

### Server (`server.js`)

- **Session state is in-memory** (no database). Restarting the server loses all data.
- **Timer starts on first submission**, not on session start. The admin's "Start Session" just opens the session for submissions.
- **Three AI calls per submission** (all Claude Sonnet, all fire-and-forget after classification):
  1. `classifySubmission` — classifies into SWOT category, Swedish subcategory (kapacitet/kompetens/ekonomi/kultur/teknik/marknad/övrigt), confidence (1-10), and Swedish reason. Prompt and response are entirely in Swedish.
  2. `generateSpeechBubbles` — 1-2 humorous Swedish speech lines, context-aware (consecutive count, confidence). Used when confidence ≥ 6.
  3. `generateArgument` — 4-line argument between the winning agent and a random rival. Used when confidence < 6.
- **Socket.io events**: `submission:new` (immediate), `submission:classified` (after AI), `speech:bubbles` (normal), `speech:argument` (low confidence). New clients receive full state on connect via `session:state`.
- **Consecutive agent tracking** (`session.consecutiveAgent` / `consecutiveCount`) feeds into speech bubble generation so agents react to getting many submissions in a row.
- **Excel export** uses ExcelJS to build a multi-sheet workbook on demand. All content is in Swedish. Filenames auto-increment to avoid overwrites.

### Frontend (`public/index.html`)

- Vanilla JS, no framework, no build tooling. All CSS and JS are inline. **All UI text is in Swedish.**
- **Participant view**: text input form, timer display, session-inactive state. Submissions go via `POST /api/submit`.
- **Admin view**: header (title left, service URL center, buttons right), compact top stats row (QR, timer ring, 4 SWOT counters — all equal-width), animation panel, scrollable live feed ("Inflöde").
- **Feed items** appear immediately as "pending" on `submission:new`, then get removed from feed when the agent picks up the envelope.
- **Background music** (`/audio/music.mp3`): auto-plays on first submission (timer start), stops and resets on session stop. No visible controls.

### Animation System (CSS + requestAnimationFrame)

- **Layout**: center mailbox ("Inkorg") with envelope stack; four SWOT agents positioned inward from corners (S top-left, W top-right, O bottom-left, T bottom-right) with generous margins to prevent overflow.
- **Concurrent delivery**: each agent has its own queue (`agentQueues`) and busy flag (`agentBusy`). Multiple agents can walk simultaneously. If a new submission arrives for an agent already walking home, the current walk is aborted (via `agentAbort` callback) and the agent redirects to the mailbox.
- **Walk phases**: agent walks to mailbox (4500ms eased), picks up envelope (removes from mailbox stack + feed), adds carrying bob animation, walks back home. Walker elements are reused when aborting.
- **Home bases** show an envelope stack graphic (visible only when count > 0) and a counter number.
- **Speech bubbles**: white rounded bubbles positioned above agents, follow walking agents via `activeWalkers` tracking, auto-fade after 3.5s. Sources: `speech:bubbles` event, `speech:argument` event (staggered 1.2s), idle chatter (10s no activity), timer-end closing lines.
- Agent characters are CSS pixel-art (head, body with letter, legs with walk animation). `face-left` class flips via `scaleX(-1)`.

### Color Scheme

Consistent across UI, animation, and Excel export:
- S (Styrkor): `#27ae60` green
- W (Svagheter): `#f39c12` orange
- O (Möjligheter): `#2980b9` blue
- T (Hot): `#e74c3c` red
