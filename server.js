require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const ExcelJS = require('exceljs');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SESSION_DURATION = parseInt(process.env.SESSION_DURATION, 10) || 150;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- Session State ---
let session = {
  active: false,
  timerStarted: false,
  timerEnd: null,
  submissions: [],
  timerId: null,
};

function resetSession() {
  if (session.timerId) clearTimeout(session.timerId);
  session = {
    active: false,
    timerStarted: false,
    timerEnd: null,
    submissions: [],
    timerId: null,
  };
}

function getTimeRemaining() {
  if (!session.timerStarted || !session.timerEnd) return SESSION_DURATION;
  return Math.max(0, Math.round((session.timerEnd - Date.now()) / 1000));
}

function isAcceptingSubmissions() {
  if (!session.active) return false;
  if (!session.timerStarted) return true;
  return Date.now() < session.timerEnd;
}

// --- AI Classification ---
async function classifySubmission(text) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `You are a SWOT analysis expert. Classify the following text into exactly one SWOT category and one subcategory.

SWOT categories: S (Strength), W (Weakness), O (Opportunity), T (Threat)
Subcategories: capacity, competence, economy, culture, technology, market, other

Text: "${text}"

Respond with ONLY valid JSON, no markdown:
{"swot": "S", "subcategory": "competence", "reason": "brief reason"}`,
        },
      ],
    });

    const content = response.content[0].text.trim();
    const parsed = JSON.parse(content);
    const swot = ['S', 'W', 'O', 'T'].includes(parsed.swot) ? parsed.swot : 'S';
    const validSubs = ['capacity', 'competence', 'economy', 'culture', 'technology', 'market', 'other'];
    const subcategory = validSubs.includes(parsed.subcategory) ? parsed.subcategory : 'other';
    return { swot, subcategory, reason: parsed.reason || '' };
  } catch (err) {
    console.error('Classification error:', err.message);
    return { swot: 'S', subcategory: 'other', reason: 'Classification failed' };
  }
}

// --- Excel Export ---
function getExportPath() {
  const dir = __dirname;
  let name = 'swotgame.xlsx';
  let fullPath = path.join(dir, name);
  let counter = 1;
  while (fs.existsSync(fullPath)) {
    name = `swotgame(${counter}).xlsx`;
    fullPath = path.join(dir, name);
    counter++;
  }
  return { fullPath, name };
}

async function exportToExcel() {
  const workbook = new ExcelJS.Workbook();

  // Summary sheet
  const summary = workbook.addWorksheet('Summary');
  summary.columns = [
    { header: 'Category', key: 'cat', width: 15 },
    { header: 'Count', key: 'count', width: 10 },
  ];
  const counts = { S: 0, W: 0, O: 0, T: 0 };
  session.submissions.forEach((s) => {
    if (s.classification) counts[s.classification.swot]++;
  });
  summary.addRow({ cat: 'Strengths', count: counts.S });
  summary.addRow({ cat: 'Weaknesses', count: counts.W });
  summary.addRow({ cat: 'Opportunities', count: counts.O });
  summary.addRow({ cat: 'Threats', count: counts.T });
  summary.addRow({ cat: 'Total', count: session.submissions.length });

  // Style summary header
  summary.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  });

  // Detail sheet
  const detail = workbook.addWorksheet('Submissions');
  detail.columns = [
    { header: '#', key: 'num', width: 5 },
    { header: 'Text', key: 'text', width: 50 },
    { header: 'SWOT', key: 'swot', width: 8 },
    { header: 'Subcategory', key: 'sub', width: 15 },
    { header: 'Reason', key: 'reason', width: 40 },
    { header: 'Time', key: 'time', width: 22 },
  ];

  const swotColors = {
    S: 'FF27AE60', W: 'FFE74C3C', O: 'FF2980B9', T: 'FFF39C12',
  };

  session.submissions.forEach((s, i) => {
    const row = detail.addRow({
      num: i + 1,
      text: s.text,
      swot: s.classification?.swot || '?',
      sub: s.classification?.subcategory || '?',
      reason: s.classification?.reason || '',
      time: new Date(s.timestamp).toLocaleString(),
    });
    const swotCell = row.getCell('swot');
    const color = swotColors[s.classification?.swot];
    if (color) {
      swotCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      swotCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    }
  });

  detail.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  });

  // Per-category sheets
  for (const [letter, label] of [['S', 'Strengths'], ['W', 'Weaknesses'], ['O', 'Opportunities'], ['T', 'Threats']]) {
    const ws = workbook.addWorksheet(label);
    ws.columns = [
      { header: '#', key: 'num', width: 5 },
      { header: 'Text', key: 'text', width: 50 },
      { header: 'Subcategory', key: 'sub', width: 15 },
      { header: 'Reason', key: 'reason', width: 40 },
    ];
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: swotColors[letter] } };
    });
    const items = session.submissions.filter((s) => s.classification?.swot === letter);
    items.forEach((s, i) => {
      ws.addRow({ num: i + 1, text: s.text, sub: s.classification.subcategory, reason: s.classification.reason });
    });
  }

  const { fullPath, name } = getExportPath();
  await workbook.xlsx.writeFile(fullPath);
  return { fullPath, name };
}

// --- QR Code ---
async function generateQR(url) {
  return QRCode.toDataURL(url, { width: 300, margin: 2 });
}

// --- Routes ---
app.use(express.json());

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/api/qr', async (req, res) => {
  const host = req.headers.host;
  const protocol = req.protocol;
  const url = `${protocol}://${host}/`;
  try {
    const dataUrl = await generateQR(url);
    res.json({ url, qr: dataUrl });
  } catch {
    res.status(500).json({ error: 'QR generation failed' });
  }
});

app.get('/api/session', (_req, res) => {
  res.json({
    active: session.active,
    timerStarted: session.timerStarted,
    timeRemaining: getTimeRemaining(),
    totalDuration: SESSION_DURATION,
    submissionCount: session.submissions.length,
  });
});

app.post('/api/session/start', (_req, res) => {
  resetSession();
  session.active = true;
  io.emit('session:started', { totalDuration: SESSION_DURATION });
  res.json({ ok: true });
});

app.post('/api/session/stop', (_req, res) => {
  session.active = false;
  if (session.timerId) clearTimeout(session.timerId);
  io.emit('session:stopped');
  res.json({ ok: true });
});

app.post('/api/submit', async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Text is required' });
  }
  if (!isAcceptingSubmissions()) {
    return res.status(403).json({ error: 'Session is not accepting submissions' });
  }

  // Start timer on first submission
  if (!session.timerStarted) {
    session.timerStarted = true;
    session.timerEnd = Date.now() + SESSION_DURATION * 1000;
    io.emit('timer:started', {
      timeRemaining: SESSION_DURATION,
      totalDuration: SESSION_DURATION,
    });
    session.timerId = setTimeout(() => {
      io.emit('timer:ended');
    }, SESSION_DURATION * 1000);
  }

  const submission = {
    id: session.submissions.length + 1,
    text: text.trim(),
    timestamp: Date.now(),
    classification: null,
  };
  session.submissions.push(submission);

  // Emit immediately so admin sees the incoming text
  io.emit('submission:new', {
    id: submission.id,
    text: submission.text,
    timestamp: submission.timestamp,
  });

  res.json({ ok: true, id: submission.id });

  // Classify asynchronously
  const classification = await classifySubmission(submission.text);
  submission.classification = classification;
  io.emit('submission:classified', {
    id: submission.id,
    text: submission.text,
    classification,
  });
});

app.get('/api/export', async (_req, res) => {
  if (session.submissions.length === 0) {
    return res.status(400).json({ error: 'No submissions to export' });
  }
  try {
    const { fullPath, name } = await exportToExcel();
    res.download(fullPath, name);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

app.get('/api/submissions', (_req, res) => {
  res.json(session.submissions);
});

// --- Socket.io ---
io.on('connection', (socket) => {
  // Send current state on connect
  socket.emit('session:state', {
    active: session.active,
    timerStarted: session.timerStarted,
    timeRemaining: getTimeRemaining(),
    totalDuration: SESSION_DURATION,
    submissions: session.submissions,
  });
});

// --- Timer broadcast ---
setInterval(() => {
  if (session.active && session.timerStarted) {
    io.emit('timer:tick', { timeRemaining: getTimeRemaining() });
  }
}, 1000);

// --- Start ---
server.listen(PORT, () => {
  console.log(`SWOT Game running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
