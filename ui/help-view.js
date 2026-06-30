// ui/help-view.js — Help & Guide: what is Gold_Crew, how to get API keys, how to deploy

const t = (key) => window.miniappI18n?.t(key) ?? key;

export function renderHelp(container) {
  container.innerHTML = `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-white">❓ ${t('help.title')}</h1>
        <p class="text-slate-400 mt-1">${t('help.subtitle')}</p>
      </div>

      <!-- What is Gold_Crew -->
      ${section('🎯', t('help.what.title'), `
        <p class="text-slate-300 leading-relaxed">Gold_Crew is your all-in-one deployment control center. Upload a ZIP file, configure your project, and deploy it live to Vercel in seconds. Deploy bots, sites, and APIs. Host images for free on GitHub. Deploy static sites with GitHub Pages. No terminal needed.</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          ${featureCard('🤖', 'Deploy Bots', 'WhatsApp, Telegram, Discord bots deployed as serverless functions')}
          ${featureCard('🌐', 'Deploy Sites', 'React, Next.js, Vue, static HTML — all supported on Vercel FREE')}
          ${featureCard('⚡', 'Deploy APIs', 'Express, Fastify, Hono — deploy as serverless functions on Vercel')}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          ${featureCard('📄', 'GitHub Pages', 'Free static site hosting directly from your GitHub repos')}
          ${featureCard('🖼️', 'Image Hosting', 'Upload images and get direct URLs for your projects — hosted on GitHub')}
          ${featureCard('🐙', 'GitHub Control', 'Manage repos, files, commits, branches — full GitHub power')}
        </div>
      `)}

      <!-- How to get API keys -->
      ${section('🔑', t('help.keys.title'), `
        <p class="text-slate-400 text-sm mb-4">You need API tokens for deployments. Each platform requires a token to authenticate your account.</p>
        ${apiKeyCard('⬛', 'Vercel Token — Required for Deploys', 'Required to deploy sites and APIs. Vercel is free for personal use with no credit card needed.', [
          'Go to vercel.com/account/tokens',
          'Click "Create" and name it',
          'Copy the token and paste it in Settings',
          'Deploy any project — it goes live on Vercel! 🚀',
        ], 'https://vercel.com/account/tokens')}
        ${apiKeyCard('🐙', 'GitHub Token — Pages, Images & More', 'Used for GitHub Pages deploys, image hosting, and full repo management.', [
          'Go to github.com/settings/tokens',
          'Select scopes: repo, workflow, delete_repo',
          'Click "Generate token" and copy it',
          'Paste it in Settings → GitHub Token',
        ], 'https://github.com/settings/tokens/new?scopes=repo,workflow,delete_repo&description=Gold_Crew')}
      `)}

      <!-- How to deploy -->
      ${section('🚀', t('help.deploy.title'), `
        <p class="text-slate-400 text-sm mb-4">Choose your project type and follow the steps. Deploy bots, sites & APIs to Vercel — or static sites to GitHub Pages (FREE).</p>
        ${deployCard('🌐', 'Deploy a Website', 'Static sites, React, Vue, Next.js, or any frontend', [
          'Zip your website project (with build script in package.json)',
          'Upload the ZIP in the Deploy tab',
          'Name your project and select "Site" type',
          'Add any environment variables if needed',
          'Deploy to Vercel — it goes live automatically!',
        ])}
        ${deployCard('🤖', 'Deploy a Bot', 'WhatsApp, Telegram, Discord bots or any background service', [
          'Zip your bot project (include package.json with start script)',
          'Upload the ZIP in the Deploy tab',
          'Name your project and select "Bot" type',
          'Add environment variables (TOKEN, API_KEY, etc.)',
          'Deploy to Vercel — use webhook/Cron architecture for best results',
        ])}
        ${deployCard('⚡', 'Deploy an API', 'Express, Fastify, Hono, or any backend service', [
          'Zip your API project (include package.json with start script)',
          'Upload the ZIP in the Deploy tab',
          'Name your project and select "API" type',
          'Add environment variables (DATABASE_URL, PORT, etc.)',
          'Deploy to Vercel — FREE serverless functions!',
        ])}
        ${deployCard('📄', 'Deploy to GitHub Pages', 'FREE static site hosting — HTML, CSS, JS', [
          'Go to the GitHub Pages tab in the sidebar',
          'Upload a ZIP containing your static site (must have index.html)',
          'Name your repository',
          'Click Deploy — your site is live at username.github.io/repo-name',
          'No Vercel token needed — just a GitHub token!',
        ])}
      `)}

      <!-- Features -->
      ${section('🖼️', 'Image Hosting', `
        <p class="text-slate-400 text-sm mb-4">Upload images and get direct URLs you can use anywhere: in your sites, READMEs, or anywhere that needs an image URL.</p>
        <div class="space-y-2 text-sm text-slate-300">
          <p>✅ Images stored in a <code class="text-amber-300">goldcrew-images</code> GitHub repo</p>
          <p>✅ Direct raw URLs (raw.githubusercontent.com) — works everywhere</p>
          <p>✅ Copy URL with one click</p>
          <p>✅ Supports PNG, JPG, GIF, WebP, SVG</p>
          <p>✅ Free — hosted on your GitHub account</p>
        </div>
      `)}

      ${section('📦', 'ZIP → GitHub Repo', `
        <p class="text-slate-400 text-sm mb-4">Transform any ZIP file into a GitHub repository in one click. Great for:</p>
        <div class="space-y-2 text-sm text-slate-300">
          <p>✅ Convert ZIP projects to version-controlled repos</p>
          <p>✅ Push code to GitHub without using Git CLI</p>
          <p>✅ Create public or private repos from ZIP files</p>
          <p>✅ Use as source for GitHub Pages deployment</p>
        </div>
      `)}

      <!-- Limits -->
      ${section('📊', t('help.limits.title'), `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${limitCard(t('help.limits.projects'), '20')}
          ${limitCard(t('help.limits.envVars'), t('help.limits.unlimited'))}
          ${limitCard(t('help.limits.fileSize'), '50 MB')}
          ${limitCard(t('help.limits.logs'), '200')}
        </div>
      `)}

      <!-- Community -->
      ${section('💬', t('help.community.title'), `
        <p class="text-slate-300 mb-4">${t('help.community.desc')}</p>
        <div class="flex flex-wrap gap-3">
          <a href="https://whatsapp.com/channel/0029Vb7Bk6jEVccC46JZL92T" target="_blank" rel="noopener"
            class="flex items-center gap-2 px-5 py-3 bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 font-medium rounded-xl hover:bg-emerald-500/25 transition">
            <span>💬</span> ${t('help.community.whatsapp')}
          </a>
          <a href="https://zip-github-mcamara-v1.onrender.com/" target="_blank" rel="noopener"
            class="flex items-center gap-2 px-5 py-3 bg-cyan-500/15 border border-cyan-500/25 text-cyan-300 font-medium rounded-xl hover:bg-cyan-500/25 transition">
            <span>🔗</span> ${t('help.community.otherProjects')}
          </a>
        </div>
      `)}

      <!-- Credits -->
      <div class="text-center py-6 border-t border-white/10">
        <p class="text-slate-500 text-sm">Gold_Crew — Créé par <span class="text-amber-400 font-medium">Mcamara</span></p>
      </div>
    </div>
  `;
}

function section(icon, title, content) {
  return `
    <div class="bg-white/5 border border-white/10 rounded-2xl p-6">
      <h2 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <span class="text-xl">${icon}</span> ${title}
      </h2>
      ${content}
    </div>
  `;
}

function featureCard(icon, title, desc) {
  return `
    <div class="p-4 bg-slate-900/50 rounded-xl text-center">
      <p class="text-2xl mb-2">${icon}</p>
      <p class="text-white font-medium text-sm">${title}</p>
      <p class="text-slate-400 text-xs mt-1">${desc}</p>
    </div>
  `;
}

function apiKeyCard(icon, name, desc, steps, url) {
  return `
    <div class="p-4 bg-slate-900/50 rounded-xl mb-3">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">${icon}</span>
        <p class="text-white font-medium">${name}</p>
      </div>
      <p class="text-slate-400 text-sm mb-3">${desc}</p>
      <ol class="text-sm text-slate-300 space-y-1.5 ml-4 list-decimal">
        ${steps.map(s => `<li>${s}</li>`).join('')}
      </ol>
      <a href="${url}" target="_blank" rel="noopener"
        class="inline-block mt-3 px-4 py-2 bg-amber-500/15 border border-amber-500/25 text-amber-300 rounded-lg text-xs font-medium hover:bg-amber-500/25 transition">
        🔗 ${t('help.keys.getKey')}
      </a>
    </div>
  `;
}

function deployCard(icon, title, desc, steps) {
  return `
    <div class="p-4 bg-slate-900/50 rounded-xl mb-3">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">${icon}</span>
        <p class="text-white font-medium">${title}</p>
      </div>
      <p class="text-slate-400 text-sm mb-3">${desc}</p>
      <ol class="text-sm text-slate-300 space-y-1.5 ml-4 list-decimal">
        ${steps.map(s => `<li>${s}</li>`).join('')}
      </ol>
    </div>
  `;
}

function limitCard(label, value) {
  return `
    <div class="p-3 bg-slate-900/50 rounded-xl flex items-center justify-between">
      <span class="text-slate-300 text-sm">${label}</span>
      <span class="text-amber-400 font-bold text-sm">${value}</span>
    </div>
  `;
}
