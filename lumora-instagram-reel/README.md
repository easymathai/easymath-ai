# Lumora Instagram Reel

Short branded Instagram Reels video (1080×1920) for **Lumora Child Development Centre**.

## Preview locally

Open `index.html` in a browser (serve the folder so assets load):

```bash
cd lumora-instagram-reel
python3 -m http.server 8765
# then visit http://localhost:8765
```

Animation runs ~18 seconds.

## Render MP4

```bash
cd lumora-instagram-reel
npm install playwright
npx playwright install chromium
node render.mjs
```

Output: `lumora-instagram-reel.mp4` (Instagram Reels / Stories ready).

## Contents

- Logo + child photo extracted from the centre flyer
- Brand colors matching LUMORA lettering
- Scenes: logo → brand name → speech therapy photo → services → contact CTA
