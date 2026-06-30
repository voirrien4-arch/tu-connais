# Gold_Crew — Deployment Control

Deploy your bots, sites and APIs easily to Vercel. Host images on GitHub. Deploy static sites with GitHub Pages.

## Features

- 🚀 Deploy Bots, Sites & APIs to Vercel (FREE)
- 📷 Image URL Hosting (GitHub)
- 📄 GitHub Pages (FREE static hosting)
- 🐙 GitHub Control (repos, files, branches)
- 💬 Admin messaging system
- 🌐 Multi-language (EN, FR, HT)

## Deployment on Render

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Configure:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node
   - Health Check: `/health`
4. Deploy!

## Tech Stack

- Vanilla HTML/CSS/JS (no framework)
- Express.js server
- Tailwind CSS (CDN)
- LocalStorage for data persistence
