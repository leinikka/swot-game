# SWOT Game — Interactive Workshop Tool

A real-time SWOT analysis workshop game with AI-powered classification, pixel-art agent animations, and Excel export.

## Features

- **Real-time submissions** via WebSocket (Socket.io)
- **AI classification** of each submission into S/W/O/T + subcategory using Claude API
- **Countdown timer** starts on first submission (configurable duration)
- **Pixel-agent animation** — a postman character delivers each submission to the correct SWOT agent
- **QR code** for easy participant access
- **Excel export** with summary, detail, and per-category sheets
- **Admin dashboard** with live feed, timer ring, and category counters

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env` and add your Anthropic API key:

```bash
cp .env.example .env
```

Edit `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
SESSION_DURATION=150
```

| Variable | Description | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | (required) |
| `PORT` | Server port | `3000` |
| `SESSION_DURATION` | Timer duration in seconds | `150` |

### 3. Start the server

```bash
npm start
```

Or with auto-reload during development:

```bash
npm run dev
```

### 4. Open in browser

- **Admin panel:** [http://localhost:3000/admin](http://localhost:3000/admin)
- **Participant page:** [http://localhost:3000/](http://localhost:3000/)

Share the QR code shown on the admin page with participants.

## How It Works

1. Admin clicks **Start Session**
2. Participants scan the QR code and submit their ideas
3. The first submission starts the countdown timer
4. Each submission is classified by Claude AI into a SWOT category and subcategory
5. The admin sees a pixel-art postman deliver each submission to the correct agent in real time
6. When the timer ends, no more submissions are accepted
7. Admin clicks **Download Excel** to export all classified results

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Participant page |
| `GET` | `/admin` | Admin dashboard |
| `GET` | `/api/qr` | Get QR code data URL |
| `GET` | `/api/session` | Get session status |
| `POST` | `/api/session/start` | Start a new session |
| `POST` | `/api/session/stop` | Stop the current session |
| `POST` | `/api/submit` | Submit a text entry |
| `GET` | `/api/submissions` | Get all submissions |
| `GET` | `/api/export` | Download Excel file |

## WebSocket Events

| Event | Direction | Description |
|---|---|---|
| `session:state` | Server → Client | Full state on connect |
| `session:started` | Server → Client | Session started |
| `session:stopped` | Server → Client | Session stopped |
| `timer:started` | Server → Client | Timer began |
| `timer:tick` | Server → Client | Timer update (every second) |
| `timer:ended` | Server → Client | Timer finished |
| `submission:new` | Server → Client | New submission received |
| `submission:classified` | Server → Client | Submission classified by AI |
