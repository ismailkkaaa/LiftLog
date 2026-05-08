# LiftLog 💪

A premium mobile-first gym workout tracking PWA built with Flask + SQLite.

## Features
- 🏠 Home dashboard with weekly streak & stats
- 📋 Workout plan creator (name, days, exercises)
- 🔒 Day-based lock system (only today's workout is accessible)
- ⏱️ Live workout tracking with set/rep logging
- 📊 Stats page with charts and PRs
- 👤 User profile
- 📱 Installable PWA (Android/iOS)
- 🔌 Offline support via service worker

## Quick Start

```bash
pip install -r requirements.txt
python app.py
```

Visit: http://localhost:5000

## Deploy to Render

1. Push to GitHub
2. Connect repo to Render
3. Use `render.yaml` — auto-configured
4. Add a persistent disk at `/database`

## Folder Structure

```
liftlog/
├── app.py              # Flask backend
├── requirements.txt
├── Procfile
├── render.yaml
├── database/           # SQLite DB (auto-created)
├── static/
│   ├── css/app.css
│   ├── js/app.js
│   ├── images/         # PWA icons
│   ├── manifest.json
│   └── sw.js
└── templates/
    └── index.html
```

## Tech Stack
- **Backend**: Python Flask
- **Database**: SQLite
- **Frontend**: Vanilla JS, CSS3, HTML5
- **PWA**: Service Worker + Web App Manifest
- **Fonts**: Syne + DM Sans
- **Deploy**: Render (render.yaml included)
