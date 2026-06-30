// services/vercel-service.js — Vercel API: direct file upload deployment
// Lets Vercel auto-detect framework and settings from package.json, etc.
// Only generates vercel.json when there's NO package.json (pure static, plain Python).
//
// NOTE: Vercel supports:
//   - Static sites (HTML/CSS/JS)
//   - SSR frameworks (Next.js, Nuxt, SvelteKit)
//   - Serverless APIs (Express via @vercel/node, Flask via @vercel/python)
//   - Webhook handlers and bots (via API routes + Cron Jobs)
//   - Bots with webhook architecture (receive webhook → respond → done)
// For persistent WebSocket connections, a VPS or self-hosting is recommended.

const VERCEL_API = 'https://api.vercel.com';

/**
 * Validate a Vercel bearer token by fetching the authenticated user.
 */
export async function validateVercelToken(token) {
  var res = await fetch(VERCEL_API + '/v2/user', {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('Token is expired or invalid. Generate a new one at vercel.com/account/tokens');
    }
    throw new Error('API returned ' + res.status);
  }
  var data = await res.json();
  if (!data.user || !data.user.username) throw new Error('Unexpected API response format');
  return { username: data.user.username, email: data.user.email };
}

/**
 * Deploy files to Vercel. Lets Vercel auto-detect framework from package.json.
 * Only generates vercel.json for projects that truly need it (no package.json).
 *
 * @param {string} token
 * @param {Array} files
 * @param {string} projectName
 * @param {Array} envVars
 * @param {Object} detected - {runtime, framework, detectedType, buildCommand, startCommand}
 * @param {Object} vercelOptions - user overrides (framework, buildCommand, outputDirectory, etc.)
 * @param {Function} onLog
 * @param {Function} onProgress
 */
export async function deployToVercel(token, files, projectName, envVars, detected, vercelOptions, onLog, onProgress) {
  var pct = function (v) { if (onProgress) onProgress(v); };

  // Build env map
  var envMap = {};
  for (var i = 0; i < envVars.length; i++) {
    if (envVars[i].key && envVars[i].value) envMap[envVars[i].key] = envVars[i].value;
  }

  var opts = Object.assign({ framework: 'auto', buildCommand: '', installCommand: '', outputDirectory: '' }, vercelOptions);

  // ── Detect if project already has its own config ──
  var paths = files.map(function (f) { return f.path.toLowerCase(); });
  var hasPackageJson = paths.indexOf('package.json') !== -1;
  var hasVercelJson = paths.indexOf('vercel.json') !== -1;
  var hasRequirementsTxt = paths.indexOf('requirements.txt') !== -1 || paths.indexOf('pyproject.toml') !== -1;
  var hasIndexHtml = paths.indexOf('index.html') !== -1;
  var isStaticOnly = hasIndexHtml && !hasPackageJson && !hasRequirementsTxt;

  // ── Build projectSettings — detect from code when user doesn't override ──
  var projectSettings = {};

  // Only set framework if user explicitly chose one (not 'auto')
  if (opts.framework && opts.framework !== 'auto' && opts.framework !== 'none') {
    projectSettings.framework = opts.framework;
    if (onLog) onLog('🔧 Framework override: ' + opts.framework);
  } else if (hasPackageJson) {
    // Auto-detect framework from package.json dependencies
    var pkgFile = files.find(function(f) { return f.path === 'package.json'; });
    if (pkgFile) {
      var pkgText = pkgFile.text || new TextDecoder().decode(pkgFile.content);
      try {
        var pkg = JSON.parse(pkgText);
        var deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
        if (deps['next']) { projectSettings.framework = 'nextjs'; if (onLog) onLog('🔍 Auto-detected: Next.js'); }
        else if (deps['nuxt'] || deps['@nuxt/kit']) { projectSettings.framework = 'nuxtjs'; if (onLog) onLog('🔍 Auto-detected: Nuxt.js'); }
        else if (deps['svelte'] || deps['@sveltejs/kit']) { projectSettings.framework = 'sveltekit'; if (onLog) onLog('🔍 Auto-detected: SvelteKit'); }
        else if (deps['gatsby']) { projectSettings.framework = 'gatsby'; if (onLog) onLog('🔍 Auto-detected: Gatsby'); }
        else if (deps['remix'] || deps['@remix-run/react']) { projectSettings.framework = 'remix'; if (onLog) onLog('🔍 Auto-detected: Remix'); }
        else if (deps['vite'] && deps['react']) { projectSettings.framework = 'vite'; if (onLog) onLog('🔍 Auto-detected: Vite + React'); }
        else if (deps['vite'] && deps['vue']) { projectSettings.framework = 'vite'; if (onLog) onLog('🔍 Auto-detected: Vite + Vue'); }
        else if (deps['vue']) { projectSettings.framework = 'vue'; if (onLog) onLog('🔍 Auto-detected: Vue.js'); }
        else if (deps['react']) { projectSettings.framework = 'create-react-app'; if (onLog) onLog('🔍 Auto-detected: React'); }
        else if (deps['angular'] || deps['@angular/core']) { projectSettings.framework = 'angular'; if (onLog) onLog('🔍 Auto-detected: Angular'); }
        else if (deps['hugo-bin'] || deps['hexo']) { projectSettings.framework = 'hugo'; if (onLog) onLog('🔍 Auto-detected: Static generator'); }
        // No framework detected — let Vercel figure it out
        else if (onLog) onLog('🔍 No specific framework detected — Vercel will auto-detect');

        // Extract build command from scripts
        if (pkg.scripts && pkg.scripts.build) {
          projectSettings.buildCommand = pkg.scripts.build;
          if (onLog) onLog('🔨 Build command from package.json: ' + pkg.scripts.build);
        }

        // Common output directories
        if (deps['next']) projectSettings.outputDirectory = '.next';
        else if (deps['nuxt'] || deps['@nuxt/kit']) projectSettings.outputDirectory = '.output/public';
        else if (deps['gatsby']) projectSettings.outputDirectory = 'public';
        else if (deps['vue'] || deps['vite']) projectSettings.outputDirectory = 'dist';
      } catch (e) {
        if (onLog) onLog('⚠️ Could not parse package.json: ' + e.message);
      }
    }
  }

  // Only set buildCommand if user explicitly provided one
  if (opts.buildCommand) {
    projectSettings.buildCommand = opts.buildCommand;
    if (onLog) onLog('🔧 Build command override: ' + opts.buildCommand);
  }
  // Otherwise Vercel reads it from package.json scripts.build

  // Only set installCommand if user explicitly provided one
  if (opts.installCommand) {
    projectSettings.installCommand = opts.installCommand;
  }

  // Only set outputDirectory if user explicitly provided one
  if (opts.outputDirectory) {
    projectSettings.outputDirectory = opts.outputDirectory;
  }

  // ── Generate vercel.json ONLY for projects that need it ──
  // Projects with package.json → Vercel auto-detects everything
  // Pure static (index.html only) → needs vercel.json for clean URLs
  // Python without package.json → needs vercel.json for @vercel/python

  if (!hasVercelJson) {
    if (detected && detected.projectType === 'bot') {
      // Bot projects: generate vercel.json with @vercel/node serverless function
      // Skip all framework detection — bots must use Node.js runtime directly
      var botEntryFiles = ['index.js', 'main.js', 'app.js', 'bot.js', 'server.js', 'src/index.js', 'src/main.js', 'src/app.js', 'src/bot.js'];
      var botEntry = 'index.js';
      for (var bi = 0; bi < botEntryFiles.length; bi++) {
        if (paths.indexOf(botEntryFiles[bi]) !== -1) { botEntry = botEntryFiles[bi]; break; }
      }
      // Check package.json main field
      if (hasPackageJson) {
        var pkgForBot = files.find(function(f) { return f.path === 'package.json'; });
        if (pkgForBot) {
          try {
            var pkgBot = JSON.parse(pkgForBot.text || new TextDecoder().decode(pkgForBot.content));
            if (pkgBot.main && paths.indexOf(pkgBot.main.toLowerCase()) !== -1) botEntry = pkgBot.main;
            // Also check scripts.start for entry file (e.g. "start": "node bot.js")
            if (pkgBot.scripts && pkgBot.scripts.start) {
              var startCmd = pkgBot.scripts.start;
              var startMatch = startCmd.match(/node\s+(\S+)/);
              if (startMatch && paths.indexOf(startMatch[1].toLowerCase()) !== -1) {
                botEntry = startMatch[1];
              }
            }
            // Check for WhatsApp/Puppeteer dependencies to warn user
            var botDeps = Object.assign({}, pkgBot.dependencies, pkgBot.devDependencies);
            if (botDeps['whatsapp-web.js'] || botDeps['puppeteer'] || botDeps['puppeteer-core']) {
              if (onLog) onLog('⚠️ This bot uses Puppeteer — NOT supported on Vercel (no browser runtime).');
              if (onLog) onLog('💡 Consider using Render (render.com) or a VPS for WhatsApp Web bots.');
              if (onLog) onLog('💡 For Vercel, use the WhatsApp Business API with webhook architecture instead.');
            }
            if (botDeps['@whiskeysockets/baileys'] || botDeps['baileys']) {
              if (onLog) onLog('⚠️ This bot uses Baileys — needs persistent connections. Vercel will timeout.');
              if (onLog) onLog('💡 Consider using Render (render.com) or Railway for Baileys bots.');
            }
          } catch (e) {}
        }
      }
      files = generateBotConfig(files, botEntry);
      projectSettings = {};
      if (onLog) onLog('📄 Added vercel.json → @vercel/node serverless function (entry: ' + botEntry + ')');
      if (onLog) onLog('🤖 Bot project — using serverless Node.js runtime');
      if (onLog) onLog('💡 Tip: For persistent connections (WebSocket), consider a VPS or Render');
    } else if (isStaticOnly) {
      // Pure static site — generate minimal vercel.json
      files = generateStaticConfig(files);
      if (onLog) onLog('📄 Added vercel.json → static site (clean URLs)');
      // Tell Vercel this is a static site
      if (!projectSettings.framework) projectSettings.framework = 'vite';
      if (!projectSettings.outputDirectory) projectSettings.outputDirectory = '.';
    } else if (hasRequirementsTxt && !hasPackageJson) {
      // Python project without package.json
      files = generatePythonConfig(files, detected);
      if (onLog) onLog('📄 Added vercel.json → Python runtime (@vercel/python)');
    } else if (hasPackageJson) {
      // Has package.json — Vercel auto-detects everything!
      if (onLog) onLog('✅ package.json found — Vercel will auto-detect framework & build settings');
    }
  } else {
    if (onLog) onLog('✅ vercel.json found — using project configuration');
  }

  // ── Log what Vercel will do ──
  if (detected && detected.framework) {
    if (onLog) onLog('🔍 Detected framework: ' + detected.framework);
  }
  if (detected && detected.buildCommand) {
    if (onLog) onLog('🔨 Build command: ' + detected.buildCommand);
  }

  // Log deployment type info
  if (detected && (detected.detectedType === 'bot' || detected.projectType === 'bot')) {
    if (onLog) onLog('🤖 Bot deployment detected — deploying as serverless functions');
    if (onLog) onLog('💡 Tip: Use webhook-based architecture (Cron Jobs, API routes) for best results on Vercel');
    if (onLog) onLog('💡 For persistent connections (WebSocket), consider self-hosting or a VPS');
  } else {
    if (onLog) onLog('✅ Deploying FREE on Vercel Hobby plan — no credit card needed');
  }

  var totalBytes = 0;
  for (var j = 0; j < files.length; j++) totalBytes += files[j].size;

  if (totalBytes > 4 * 1024 * 1024) {
    return await deployLarge(token, files, projectName, envMap, projectSettings, onLog, pct);
  }
  return await deployInline(token, files, projectName, envMap, projectSettings, onLog, pct);
}

/**
 * Generate minimal vercel.json for pure static sites (no package.json)
 */
function generateStaticConfig(files) {
  var config = {
    cleanUrls: true,
    headers: [
      { source: '/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }] }
    ]
  };
  return appendJsonFile(files, 'vercel.json', config);
}

/**
 * Generate vercel.json for Python projects without package.json
 */
function generatePythonConfig(files, detected) {
  var entryFiles = ['app.py', 'main.py', 'server.py', 'bot.py'];
  var paths = files.map(function (f) { return f.path.toLowerCase(); });
  var startFile = 'app.py';
  for (var i = 0; i < entryFiles.length; i++) {
    if (paths.indexOf(entryFiles[i]) !== -1) { startFile = entryFiles[i]; break; }
  }

  var config = {
    version: 2,
    builds: [{ src: startFile, use: '@vercel/python' }],
    routes: [{ src: '/(.*)', dest: '/' + startFile }],
  };
  return appendJsonFile(files, 'vercel.json', config);
}

/**
 * Generate vercel.json + api/index.js wrapper for bot projects.
 *
 * Most bot entry files (index.js, bot.js, etc.) are standalone scripts that
 * call client.initialize() but don't export an HTTP handler. Vercel's
 * @vercel/node runtime requires `module.exports = (req, res) => {...}`.
 *
 * Strategy:
 *  1. Create api/index.js wrapper that requires the original entry file
 *     (this starts the bot on cold-start) and exports an HTTP handler.
 *  2. Generate vercel.json pointing to the wrapper with maxDuration and
 *     includeFiles so all source files are bundled into the function.
 *
 * Note: Vercel serverless functions have a 10-second timeout on the free
 * plan (up to 300s on Pro). Persistent connections (WebSocket, Puppeteer)
 * will time out. For those architectures, Render or a VPS is recommended.
 */
function generateBotConfig(files, entryFile) {
  // Detect if entry already exports a handler
  var entryContent = '';
  for (var i = 0; i < files.length; i++) {
    if (files[i].path === entryFile) {
      entryContent = files[i].text || new TextDecoder().decode(files[i].content);
      break;
    }
  }
  var hasExport = /module\.exports\s*=|exports\.default\s*=|export\s+(default|function)/.test(entryContent);

  if (hasExport) {
    // Entry already exports a handler — use it directly
    var config = {
      version: 2,
      builds: [{ src: entryFile, use: '@vercel/node', config: { maxDuration: 10 } }],
      routes: [{ src: '/(.*)', dest: '/' + entryFile }]
    };
    return appendJsonFile(files, 'vercel.json', config);
  }

  // Entry is a standalone script — wrap it in api/index.js
  var wrapper = createBotWrapper(entryFile, files);
  files = files.concat([{
    path: 'api/index.js',
    content: new TextEncoder().encode(wrapper),
    size: new TextEncoder().encode(wrapper).length,
    text: wrapper,
  }]);

  // List key source files for includeFiles (max 20 for safety)
  var sourceFiles = files
    .filter(function (f) {
      return f.path !== 'vercel.json' && f.path !== 'api/index.js' &&
             !f.path.startsWith('_');
    })
    .slice(0, 50)
    .map(function (f) { return f.path; });

  var config = {
    version: 2,
    builds: [{
      src: 'api/index.js',
      use: '@vercel/node',
      config: {
        maxDuration: 10,
        includeFiles: sourceFiles,
      }
    }],
    routes: [
      { src: '/health', dest: '/api/index.js' },
      { src: '/api/(.*)', dest: '/api/index.js' },
      { src: '/(.*)', dest: '/api/index.js' }
    ]
  };
  return appendJsonFile(files, 'vercel.json', config);
}

/**
 * Generate the api/index.js wrapper content for a bot entry file.
 * The wrapper:
 *  - Requires the original entry on cold-start (starts the bot)
 *  - Exports an HTTP handler that returns bot status
 *  - Handles errors gracefully
 *  - Provides a /health endpoint
 */
function createBotWrapper(entryFile, files) {
  // Check if the bot uses puppeteer/whatsapp-web.js/baileys
  var allText = files.map(function(f) { return (f.text || '').toLowerCase(); }).join(' ');
  var usesPuppeteer = allText.indexOf('puppeteer') !== -1 || allText.indexOf('whatsapp-web') !== -1;
  var usesBaileys = allText.indexOf('baileys') !== -1 || allText.indexOf('@whiskeysockets') !== -1;
  var usesRedis = allText.indexOf('redis') !== -1;

  var lines = [
    '// api/index.js — Auto-generated Vercel serverless wrapper for bot project',
    '// This wrapper imports the original bot entry file and exports an HTTP handler.',
    '//',
    '// IMPORTANT: Vercel serverless functions have a 10s timeout (free) or up to 300s (Pro).',
    '// Bots that need persistent connections (WebSocket, Puppeteer) should use Render or a VPS.',
    '',
    'let botReady = false;',
    'let botError = null;',
    'let startTime = Date.now();',
    '',
    '// Start bot on cold-start',
    'try {',
    '  require(__dirname + "/../' + entryFile + '");',
    '  botReady = true;',
    '  console.log("✅ Bot entry loaded: ' + entryFile + '");',
    '} catch (err) {',
    '  botError = err.message;',
    '  console.error("❌ Bot initialization failed:", err.message);',
    '}',
    '',
    'module.exports = (req, res) => {',
    '  const url = req.url || "/";',
    '',
    '  // Health check endpoint',
    '  if (url === "/health" || url === "/api/health") {',
    '    return res.status(200).json({',
    '      status: botReady ? "running" : "error",',
    '      entry: "' + entryFile + '",',
    '      uptime: Math.round((Date.now() - startTime) / 1000),',
    '      error: botError,',
    '      timestamp: new Date().toISOString(),',
    '    });',
    '  }',
    '',
    '  // Default response',
    '  return res.status(botReady ? 200 : 500).json({',
    '    status: botReady ? "running" : "error",',
    '    message: botReady',
    '      ? "Bot is active. Check your messaging platform for responses."',
    '      : "Bot failed to start. Check function logs on Vercel dashboard.",',
    '    error: botError,',
    '    health: "/health",',
    '    timestamp: new Date().toISOString(),',
    '  });',
    '};',
  ];

  if (usesPuppeteer) {
    lines.splice(6, 0,
      '// ⚠️ This bot uses Puppeteer/whatsapp-web.js — needs a browser runtime.',
      '// Vercel does NOT support Puppeteer. Consider using Render, Railway, or a VPS.',
      '// For WhatsApp bots, the Business API (webhook-based) works on Vercel.'
    );
  } else if (usesBaileys) {
    lines.splice(6, 0,
      '// ⚠️ This bot uses Baileys — needs persistent WebSocket connections.',
      '// Vercel serverless will timeout. Consider Render or a VPS for Baileys bots.',
      '// For WhatsApp bots, the Business API (webhook-based) works on Vercel.'
    );
  }

  return lines.join('\n');
}

/** Helper: append a JSON file to the files array */
function appendJsonFile(files, path, obj) {
  var json = JSON.stringify(obj, null, 2);
  var content = new TextEncoder().encode(json);
  return files.concat([{ path: path, content: content, size: content.length, text: json }]);
}

/** Inline deployment (<4MB) */
async function deployInline(token, files, projectName, envMap, projectSettings, onLog, pct) {
  if (onLog) onLog('⬆️ Uploading ' + files.length + ' files to Vercel...');
  pct(30);

  var vercelFiles = files.map(function (f) {
    return {
      file: f.path,
      data: uint8ToBase64(f.text !== null ? new TextEncoder().encode(f.text) : f.content),
      encoding: 'base64',
    };
  });

  return await createDeployment(token, projectName, vercelFiles, envMap, projectSettings, onLog, pct);
}

/** Large deployment (>4MB) — pre-upload by SHA */
async function deployLarge(token, files, projectName, envMap, projectSettings, onLog, pct) {
  var totalMB = (files.reduce(function (s, f) { return s + f.size; }, 0) / 1048576).toFixed(1);
  if (onLog) onLog('⬆️ Pre-uploading ' + files.length + ' files (' + totalMB + ' MB)...');
  pct(25);

  var vercelFiles = [];
  for (var i = 0; i < files.length; i += 20) {
    var batch = files.slice(i, i + 20);
    var uploaded = await Promise.all(batch.map(async function (f) {
      var fileData = f.text !== null ? new TextEncoder().encode(f.text) : f.content;
      var hashBuf = await crypto.subtle.digest('SHA-256', fileData);
      var sha = Array.from(new Uint8Array(hashBuf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      var uploadRes = await fetch(VERCEL_API + '/v2/files', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream', 'x-vercel-digest': sha },
        body: fileData,
      });
      if (!uploadRes.ok) {
        var e = await uploadRes.json().catch(function () { return {}; });
        throw new Error('Upload failed for "' + f.path + '": ' + ((e.error && e.error.message) || uploadRes.status));
      }
      return { file: f.path, sha: sha };
    }));
    vercelFiles = vercelFiles.concat(uploaded);
    var done = Math.min(i + 20, files.length);
    pct(25 + Math.round((done / files.length) * 30));
    if (done % 50 === 0 || done === files.length) {
      if (onLog) onLog('   Uploaded ' + done + '/' + files.length + ' files');
    }
  }
  if (onLog) onLog('✓ All ' + files.length + ' files uploaded');
  pct(55);
  return await createDeployment(token, projectName, vercelFiles, envMap, projectSettings, onLog, pct);
}

/** Create deployment and poll for READY */
async function createDeployment(token, projectName, vercelFiles, envMap, projectSettings, onLog, pct) {
  if (onLog) onLog('☁️ Creating Vercel deployment...');
  pct(60);

  var body = { name: projectName, files: vercelFiles, target: 'production' };

  // Only include projectSettings if the user provided explicit overrides
  // (framework, buildCommand, etc.). If empty, use skipAutoDetectionConfirmation
  // so Vercel auto-detects everything from package.json without rejecting.
  if (projectSettings && Object.keys(projectSettings).length > 0) {
    body.projectSettings = projectSettings;
  }

  if (Object.keys(envMap).length > 0) body.env = envMap;

  // When projectSettings is empty/absent, tell Vercel to auto-detect
  var apiUrl = VERCEL_API + '/v13/deployments';
  if (!body.projectSettings) {
    apiUrl += '?skipAutoDetectionConfirmation=1';
    if (onLog) onLog('🔍 No explicit settings — Vercel will auto-detect everything');
  }

  var res;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error('Network error: cannot reach Vercel API. ' + err.message);
  }

  if (!res.ok) {
    var errData = await res.json().catch(function () { return {}; });
    var msg = (errData.error && errData.error.message) || errData.message || ('HTTP ' + res.status);
    if (res.status === 401 || res.status === 403) {
      throw new Error('Vercel auth failed: ' + msg + '. Check your token at vercel.com/account/tokens');
    }
    if (res.status === 400) throw new Error('Vercel rejected the deployment: ' + msg);
    if (res.status === 429) throw new Error('Vercel rate limit reached. Wait a few minutes and try again.');
    throw new Error('Vercel deploy failed: ' + msg);
  }

  var deployment = await res.json();
  if (onLog) onLog('✓ Deployment created: ' + deployment.id);
  if (deployment.url && onLog) onLog('🔗 Preview: https://' + deployment.url);
  pct(70);

  // Poll for ready state
  if (onLog) onLog('⏳ Building and deploying...');
  var attempts = 0;
  while (attempts < 120) {
    await sleep(3000);
    attempts++;
    var state;
    try {
      var poll = await fetch(VERCEL_API + '/v13/deployments/' + deployment.id, {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!poll.ok) { if (attempts % 10 === 0 && onLog) onLog('⚠️ Status check returned ' + poll.status); continue; }
      state = await poll.json();
    } catch (e) { continue; }

    if (state.readyState === 'READY') {
      if (onLog) onLog('✅ Deployment is live!');
      var finalUrl = state.url ? 'https://' + state.url : 'https://' + deployment.url;
      return { url: finalUrl, id: deployment.id, status: 'ready' };
    }
    if (state.readyState === 'ERROR') throw new Error('Vercel deployment failed: ' + (state.errorMessage || 'Build or runtime error'));
    if (state.readyState === 'CANCELED') throw new Error('Vercel deployment was canceled');
    if (attempts % 5 === 0) {
      var elapsed = attempts * 3;
      if (onLog) onLog('⏳ Building... (' + elapsed + 's) — status: ' + state.readyState);
      pct(70 + Math.min(25, Math.round(elapsed / 12)));
    }
  }
  throw new Error('Vercel deployment timed out after 6 minutes. Check your Vercel dashboard.');
}

function uint8ToBase64(bytes) {
  var binary = '';
  for (var i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  }
  return btoa(binary);
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
