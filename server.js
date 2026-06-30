const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Serve static files from the root directory
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  },
}));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Self-ping keep-alive (Render free services sleep after 15 min inactivity)
const SELF_URL = process.env.RENDER_EXTERNAL_URL || '';
if (SELF_URL) {
  setInterval(async () => {
    try {
      const res = await fetch(SELF_URL + '/health');
      if (res.ok) console.log('[keepalive] Ping OK');
    } catch (e) {
      console.warn('[keepalive] Ping failed:', e.message);
    }
  }, 10 * 60 * 1000);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('Gold_Crew running on http://localhost:' + PORT);
});