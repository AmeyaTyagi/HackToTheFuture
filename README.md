# Photon

Photon recolors the whole screen so people with color blindness can tell
colors apart, in any app: browsers, PowerPoint, games, video.

Built for HackToTheFuture.

## Run it

Needs [Node.js](https://nodejs.org) 22 or newer.

```
npm install
npm run dev
```

`npm run dev` opens the Photon app and serves the interface at
<http://localhost:5173>, where each screen can also be opened in a browser
against a sample image. A browser tab cannot recolor your screen; that
happens in the app.

| Command | What it does |
|---|---|
| `npm run dev` | App plus dev server, with live reload of the interface |
| `npm start` | App only, no server. Use this for the demo. |
| `npm test` | Automated tests for the color math and scoring |
| `npm run selftest` | Drives every feature once on your real screen and prints PASS or FAIL |

## Use it

Photon lives in the system tray. Click its ring icon to open the panel.

| Shortcut (Windows / Mac) | Action |
|---|---|
| Ctrl+Alt+P / Cmd+Option+P | Turn correction on or off |
| Ctrl+Alt+S / Cmd+Option+S | Judge view: before and after, with a draggable divider |
| Ctrl+Alt+C / Cmd+Option+C | Color names: rest the cursor on a color for 2 seconds to see its name |
| Ctrl+Alt+F / Cmd+Option+F | Find colors on screen that look alike to you |

The panel has two sliders. Strength is how strong the person's color
blindness is; the vision test sets it. Boost is how far Photon pushes
confusable colors apart, from 1x to 3x.

If the screen ever becomes hard to read, the first shortcut switches
correction off. Quitting Photon always restores the screen.

## How it works

- `src/engine/` is the color math: simulation of each type of color
  blindness (Machado, Oliveira and Fernandes, 2009), the correction built
  from it, color naming, vision test scoring and conflict detection.
- `src/main/` is the Electron main process. `backends/` holds the two ways
  of recoloring the screen: the Windows Magnification API, and on macOS a
  click-through overlay that redraws the captured screen through a shader.
- `src/renderer/` holds one page per screen.

Design and plan: `docs/superpowers/`.

## Testing on a Mac

The Mac path was written on Windows and has not been run on a Mac yet.

1. `npm install`, then `npm run selftest`.
2. macOS will ask for the Screen Recording permission. Grant it in System
   Settings, Privacy & Security, Screen Recording, then run it again.
3. Report the PASS and FAIL lines.
4. Run `npm start`, switch correction on, and check two things by eye:
   the screen is recolored without a hall-of-mirrors effect, and clicks
   still reach the apps underneath.

If the overlay films itself, every other feature still works; only live
correction is affected.

## Limits

- Total color blindness cannot be given color back. Photon raises contrast
  for it, and Color names says what a color is.
- The vision test is a screening aid, not a diagnosis. It assumes a screen
  close to sRGB with blue-light filters off.
- Color names reads the true color from the window under the cursor, with
  no flicker. For the rare window that cannot be read that way, correction
  is lifted for a moment, which shows as one brief flicker.
- On macOS, correction covers the main display only.
