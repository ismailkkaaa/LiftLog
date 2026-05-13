# LiftLog

LiftLog is a premium mobile-first gym workout tracker built with Flask, SQLite, HTML, CSS, and vanilla JavaScript. The current project focuses on a polished frontend experience with a clean light UI, consistent typography, and a branded icon system while preserving the existing app structure and backend behavior.

## Project Status

LiftLog is fully functional as a local workout tracking web app and PWA-style frontend. The backend routes, session flow, and database behavior remain unchanged. Current work is centered on frontend polish, visual consistency, and documentation quality.

## Features

- Home dashboard with weekly activity and workout summary
- Workout plan creation, editing, and deletion
- Workout session tracking with set and rep logging
- Stats view with weekly charting and personal records
- User profile management
- Installable app shell with service worker support
- Mobile-friendly responsive layout

## UI Theme

The interface uses a clean premium light theme designed to feel modern and professional:

- Soft white surfaces and airy spacing
- Cyan accent color for brand highlights
- Dark navy typography for readability
- Rounded cards and subtle shadows
- Consistent SVG-based icons throughout the app
- Minimal, polished fitness-app aesthetic

## Tech Stack

- Backend: Python Flask
- Database: SQLite
- Frontend: HTML, CSS, Vanilla JavaScript
- PWA support: Web app manifest and service worker
- Fonts: Google Fonts via `Space Grotesk` and `Plus Jakarta Sans`

## Requirements

- Python 3.10 or newer
- Flask
- A modern desktop or mobile browser

## Installation

1. Clone or open the project in your local workspace.
2. Install dependencies if needed:

```bash
pip install -r requirements.txt
```

3. Start the app:

```bash
python app.py
```

## Run Locally

Open the app in your browser at:

```text
http://localhost:5050
```

The Flask server binds to `0.0.0.0`, so you can also test from other devices on the same local network by using your computer's LAN IP address with port `5050`.

## Mobile Testing

- Make sure your phone and computer are on the same Wi-Fi network.
- Start the app locally on your computer.
- Open `http://<your-local-ip>:5050` from the phone browser.
- Test navigation, forms, workout logging, and modal interactions on a small screen.

## Folder Structure

```text
liftlog/
app.py
README.md
render.yaml
static/
  css/app.css
  js/app.js
  images/
  manifest.json
  sw.js
templates/
  index.html
database/
  liftlog.db
```

## Screenshots

Add screenshots here when documenting the app visually:

- Home dashboard
- Workout plans screen
- Workout session modal
- Stats screen
- Profile screen

## Future Improvements

- Add richer chart interactions
- Improve workout history browsing
- Add more detailed profile analytics
- Expand offline behavior for deeper PWA support
- Add export/import presets for workout plans

## Credits and Branding

LiftLog branding, icon styling, and UI polish are centered around a premium fitness app look. The project uses a single branded logo asset across the splash screen, header, favicon, and PWA assets for consistency.

## Notes

- Backend logic and routes are intentionally unchanged.
- The app is designed to remain responsive on desktop and mobile.
- The UI refresh focuses on typography, icon clarity, documentation, and visual polish.
