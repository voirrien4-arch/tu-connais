// services/source-bundle.js — Deployment files embedded as strings
// Used by admin-view.js to generate a deployable ZIP
// index.html, .gitignore, vercel.json, package.json, server.js, render.yaml, README.md are embedded directly
// Other files fetched via import.meta.url at download time

export function getDeploymentFiles() {
  return {
    'index.html': [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '  <title>Gold_Crew \u2014 Deployment Control</title>',
      '  <link rel="preconnect" href="https://cdn.tailwindcss.com">',
      '  <link rel="preconnect" href="https://cdn.jsdelivr.net">',
      '  <link rel="dns-prefetch" href="https://cdn.jsdelivr.net">',
      '  <script src="https://cdn.tailwindcss.com"></' + 'script>',
      '  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></' + 'script>',
      '  <script src="storage-shim.js"></' + 'script>',
      '  <script src="i18n-shim.js"></' + 'script>',
      '  <link rel="stylesheet" href="styles.css">',
      '  <' + 'script>',
      '    // Catch all JS errors and display them on screen',
      '    window.onerror = function(msg, src, line, col, err) {',
      '      var el = document.getElementById("error-display");',
      '      if (!el) {',
      '        el = document.createElement("div");',
      '        el.id = "error-display";',
      '        el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:white;padding:16px;font-family:monospace;font-size:13px;white-space:pre-wrap;word-break:break-all;max-height:60vh;overflow:auto;";',
      '        document.body.prepend(el);',
      '      }',
      '      el.textContent += "ERROR: " + msg + "\\n  at " + src + ":" + line + ":" + col + "\\n\\n";',
      '      return false;',
      '    };',
      '    window.addEventListener("unhandledrejection", function(e) {',
      '      var el = document.getElementById("error-display");',
      '      if (!el) {',
      '        el = document.createElement("div");',
      '        el.id = "error-display";',
      '        el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:white;padding:16px;font-family:monospace;font-size:13px;white-space:pre-wrap;word-break:break-all;max-height:60vh;overflow:auto;";',
      '        document.body.prepend(el);',
      '      }',
      '      var reason = e.reason;',
      '      el.textContent += "PROMISE ERROR: " + (reason && reason.message ? reason.message : String(reason)) + "\\n" + (reason && reason.stack ? reason.stack : "") + "\\n\\n";',
      '    });',
      '    // Detect module loading failures (e.g. wrong MIME type, 404)',
      '    window.addEventListener("error", function(e) {',
      '      if (e.message && e.message.indexOf("module") !== -1) {',
      '        var el = document.getElementById("error-display");',
      '        if (!el) {',
      '          el = document.createElement("div");',
      '          el.id = "error-display";',
      '          el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:white;padding:16px;font-family:monospace;font-size:13px;white-space:pre-wrap;word-break:break-all;max-height:60vh;overflow:auto;";',
      '          document.body.prepend(el);',
      '        }',
      '        el.textContent += "MODULE ERROR: " + e.message + "\\n  Filename: " + (e.filename || "unknown") + "\\n\\n";',
      '      }',
      '    }, true);',
      '  </' + 'script>',
      '</head>',
      '<body class="min-h-screen bg-slate-950 text-slate-100 antialiased">',
      '  <!-- Loading screen (removed by main.js after init) -->',
      '  <div id="app-loading" class="min-h-screen flex items-center justify-center">',
      '    <div class="text-center">',
      '      <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-3xl font-bold text-slate-950 mx-auto mb-4 animate-pulse">G</div>',
      '      <p class="text-slate-400 text-sm">Loading Gold_Crew...</p>',
      '    </div>',
      '  </div>',
      '  <div id="sidebar-container"></div>',
      '  <div id="main-container" class="min-h-screen transition-all duration-300" style="display:none"></div>',
      '  <div id="toast-container" class="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm"></div>',
      '  <script type="module" src="main.js"></' + 'script>',
      '</body>',
      '</html>',
    ].join('\n'),

    '.gitignore': 'node_modules/\n.env\n*.log\n.DS_Store',

    'package.json': JSON.stringify({
      name: "gold-crew",
      version: "1.0.0",
      description: "Gold_Crew \u2014 Deployment Control. Deploy bots & websites to Vercel.",
      main: "server.js",
      scripts: {
        start: "node server.js",
        build: "echo 'Static build — no compilation needed'"
      },
      engines: { node: ">=18.0.0" },
      dependencies: { express: "^4.21.0" }
    }, null, 2),

    'vercel.json': JSON.stringify({
      framework: null,
      buildCommand: "echo 'Static deploy'",
      outputDirectory: ".",
      rewrites: [
        { source: "/(.*)", destination: "/index.html" }
      ],
      headers: [
        {
          source: "/(.*)",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" }
          ]
        },
        {
          source: "/locales/(.*)",
          headers: [
            { key: "Cache-Control", value: "public, max-age=3600" }
          ]
        },
        {
          source: "/(.*).js",
          headers: [
            { key: "Content-Type", value: "application/javascript; charset=utf-8" }
          ]
        }
      ]
    }, null, 2),

    'server.js': `const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint for Render (required for cron job / monitoring)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// CORS headers for API compatibility
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Serve static files from the root directory
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
    if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  },
}));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Self-ping keep-alive (Render free/starter services sleep after 15 min inactivity)
const SELF_URL = process.env.RENDER_EXTERNAL_URL || '';
if (SELF_URL) {
  setInterval(async () => {
    try {
      const res = await fetch(SELF_URL + '/health');
      if (res.ok) console.log('[keepalive] Ping OK');
    } catch (e) {
      console.warn('[keepalive] Ping failed:', e.message);
    }
  }, 10 * 60 * 1000); // every 10 minutes
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('Gold_Crew running on http://localhost:' + PORT);
});`,

    'render.yaml': `services:
  - type: web
    name: gold-crew
    runtime: node
    plan: starter
    buildCommand: npm install
    startCommand: npm start
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production`,

    'README.md': `# Gold_Crew \u2014 Deployment Control

Deploy your bots, sites and APIs easily to Vercel. Host images on GitHub. Deploy static sites with GitHub Pages.

## Features

- \ud83d\ude80 Deploy Bots, Sites & APIs to Vercel (FREE)
- \ud83d\udcf7 Image URL Hosting (GitHub)
- \ud83d\udcc4 GitHub Pages (FREE static hosting)
- \ud83d\udc19 GitHub Control (repos, files, branches)
- \ud83d\udcac Admin messaging system
- \ud83c\udf10 Multi-language (EN, FR, HT)

## Deployment on Render

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Configure:
   - Build Command: \`npm install\`
   - Start Command: \`npm start\`
   - Environment: Node
   - Health Check: \`/health\`
4. Deploy!

## Deployment on Vercel

1. Push code to GitHub
2. Import project on [Vercel](https://vercel.com)
3. Vercel auto-detects the vercel.json config
4. Deploy!

## Tech Stack

- Vanilla HTML/CSS/JS (no framework)
- Express.js server (Render)
- Tailwind CSS (CDN)
- LocalStorage for data persistence
`,
  };
}

/**
 * List of app source files to fetch via import.meta.url
 * (index.html, .gitignore, package.json, vercel.json, server.js, render.yaml, README.md are embedded above)
 */
export const SOURCE_FILES = [
  'main.js', 'state.js', 'storage.js', 'styles.css',
  'storage-shim.js', 'i18n-shim.js',
  'services/deploy-engine.js', 'services/github-service.js',
  'services/render-api.js', 'services/render-service.js',
  'services/source-bundle.js', 'services/vercel-service.js',
  'services/zip-parser.js',
  'ui/admin-view.js', 'ui/auth-view.js', 'ui/dashboard-view.js',
  'ui/deploy-view.js', 'ui/github-view.js', 'ui/github-repo-view.js',
  'ui/image-view.js', 'ui/pages-view.js', 'ui/messages-view.js', 'ui/admin-messages-tab.js',
  'ui/help-view.js', 'ui/logs-view.js', 'ui/settings-view.js',
  'ui/sidebar-view.js', 'ui/status-view.js', 'ui/toast-view.js',
  'locales/en.json', 'locales/fr.json', 'locales/ht.json',
];
