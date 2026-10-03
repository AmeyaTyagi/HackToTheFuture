# Photon: design

Date: 2026-10-03
Status: awaiting review

## Purpose

Photon is a desktop app that recolors the whole screen so people with color
blindness can tell colors apart in any application: browsers, PowerPoint,
games, video. It is a hackathon project (HackToTheFuture) with under 24 hours
of build time, so a reliable live demo ranks above polish.

Success means:

- A person with red-green or blue-yellow color blindness can distinguish
  colors on screen that they could not distinguish before, in any app.
- A judge with normal color vision can see that it works.
- It runs on Windows (verified) and macOS (written here, verified by a
  teammate with a Mac).

## Scope

In scope:

1. Full-screen color correction by type and severity
2. Control panel in the system tray, styled after Apple's interface
3. Judge view simulator
4. Color names at the cursor
5. Vision test that configures the app
6. Conflict finder

Out of scope: Linux, per-app settings, installers and code signing (the app
runs with `npm run dev` or `npm start`; packaging is a stretch goal), auto-update, and
correction on secondary monitors on macOS.

## Supported vision types

| Id | Name | Affects |
|---|---|---|
| `protan` | Protanomaly / protanopia | Red-green, weak or missing red cones |
| `deutan` | Deuteranomaly / deuteranopia | Red-green, weak or missing green cones |
| `tritan` | Tritanomaly / tritanopia | Blue-yellow |
| `achroma` | Achromatopsia | All color |

Severity is a number from 0 (none) to 1 (complete).

## Stack

- Electron, plain JavaScript with ES modules.
- Vite as the dev server and bundler for the renderer pages.
- `koffi` for calling the Windows Magnification API.
- Node's built-in test runner (`node --test`) for the pure modules.

Chosen because Node is the only toolchain already installed on the build
machine, the interface is easy to style in HTML and CSS, and one codebase
covers both systems.

## Running it

| Command | What it does |
|---|---|
| `npm run dev` | Starts the Vite dev server on `http://localhost:5173`, waits for it, then launches Electron pointed at it. Interface changes hot-reload. |
| `npm run build` | Builds the renderer pages into `dist/`. |
| `npm start` | Builds, then launches Electron loading the built files. No server. |
| `npm test` | Runs the automated tests. |
| `npm run selftest` | Launches the app, drives every feature once on the real screen, prints PASS or FAIL for each, and quits. |

`npm run dev` uses `concurrently` and `wait-on` to run the two processes
together. The main process loads `http://localhost:5173/<page>/` when
`PHOTON_DEV=1` is set and the files in `dist/` otherwise.

**In a browser.** `http://localhost:5173` also opens in a normal browser and
shows an index page linking to each screen: control panel, judge view,
vision test, color names label, and conflict finder. This is for working on
the interface and for teammates without the app running. A browser cannot
recolor the screen or capture it, so when the `photon` API is absent the
pages use a stand-in (`src/renderer/shared/browser-stub.js`) that:

- keeps settings in memory,
- supplies a bundled sample image wherever a screen snapshot is needed, and
- shows a banner saying screen correction needs the desktop app.

The judge view and the vision test are fully usable in the browser this
way. Live screen correction, color names on real apps, and the conflict
finder on the real screen work only in the desktop app.

## Architecture

```
main process
├── engine/          pure color math, no Electron imports
├── backends/        screen recoloring, one per method
│   ├── magnifier.js   Windows: Magnification API
│   └── overlay.js     macOS: capture + shader overlay (also runnable on Windows)
├── capture.js       screen snapshot and live pixel sampling
├── settings.js      load and save user settings
├── shortcuts.js     global hotkeys
└── windows/         creates each window
renderer             served by Vite; index.html links to each screen
├── shared/          styles, and the browser stand-in for the photon API
├── panel/           control panel
├── simulator/       judge view
├── names/           color name label
├── test/            vision test
├── conflicts/       conflict finder overlay
└── overlay/         macOS recoloring surface
```

Renderers talk to the main process only through a preload script exposing a
small `photon` API. Renderers import `engine/` directly, since it is pure.

### Engine (`src/engine/`)

Pure functions, unit tested.

- `simulate(type, severity) -> 3x3 matrix`
  How the given vision sees a color. For `protan`, `deutan` and `tritan`, uses
  the Machado, Oliveira and Fernandes (2009) matrices, tabulated at severity
  0, 0.5 and 1.0 and linearly interpolated between them. For `achroma`, blends
  the identity matrix toward the Rec. 709 luminance matrix by severity.
- `correct(type, severity) -> { matrix: 3x3, offset: [r, g, b] }`
  The transform Photon applies to the screen.
  - `protan`, `deutan`, `tritan`: daltonization, `C = I + E (I - S)`, where
    `S = simulate(type, severity)` and `E` moves the lost information into
    channels the person can see (red-green error into blue and green for
    protan and deutan; blue-yellow error into red and green for tritan).
    Offset is zero.
  - `achroma`: color cannot be restored. Applies a contrast boost around
    mid-gray, scaled by severity. The panel states this limit.
- `applyMatrix(matrix, offset, rgb) -> rgb` with clamping to 0..255.
- `colorName(rgb) -> string`, such as "dark red". Built from hue, saturation
  and lightness buckets: an optional lightness word (very dark, dark, light,
  pale), then a hue word from a fixed list of about 14, with grays, black,
  white and brown handled as special cases.
- `deltaE(rgbA, rgbB) -> number`, color difference in CIELAB (CIE76).

Matrices are applied to gamma-encoded sRGB values, because that is what the
operating system applies them to. This is an approximation of the published
models, which are defined in linear light. It is the standard practice for
screen filters.

### Backends (`src/backends/`)

Both expose the same interface:

```js
start()                       // returns a promise, rejects with a readable message
apply({ matrix, offset })
clear()                       // screen returns to normal
stop()
```

`backends/index.js` picks `magnifier` on Windows and `overlay` on macOS.
Setting `PHOTON_BACKEND=overlay` forces the overlay on Windows so it can be
tested there.

**magnifier.js (Windows).** Calls `MagInitialize`, then
`MagSetFullscreenColorEffect` with a 5x5 matrix built from the engine's 3x3
matrix and offset. `clear()` sets the identity matrix. `stop()` calls
`MagUninitialize`. Windows removes the effect when the process exits, so a
crash cannot leave the screen recolored.

**overlay.js (macOS).** Opens one window on the primary display: transparent,
frameless, always on top, click-through (`setIgnoreMouseEvents(true)`), and
excluded from capture (`setContentProtection(true)`). Its renderer takes a
live screen capture stream and draws each frame through a WebGL fragment
shader that applies the matrix and offset. Requires the Screen Recording
permission.

Known risks, which is why this is time-boxed:

- Recent macOS versions may not honor capture exclusion, which would make the
  overlay capture itself. If that happens the Mac build ships without live
  correction; every other feature still works there.
- The capture adds a frame or two of delay.

### Capture (`src/capture.js`)

- `snapshot() -> image` of the primary display at native resolution, using
  Electron's `desktopCapturer`. Snapshots must hold true colors, not
  corrected ones.
- `pixelAt(x, y) -> rgb`, read from the most recent snapshot.

Whether a capture includes the correction depends on the backend, and each
backend declares it as `capturesIncludeEffect`. This was measured on Windows
rather than probed at every launch, because probing would flash the screen.

- Windows magnifier: captures include the correction. `snapshot()` calls
  `backend.clear()`, waits 100 ms, captures, and reapplies. This causes a
  brief flicker, so the color names mode does not refresh on a timer while
  correction is on (see below).
- Overlay: the overlay window is excluded from capture, so `snapshot()`
  captures directly.

### Settings (`src/settings.js`)

A JSON file in Electron's `userData` folder:

```json
{ "enabled": false, "type": "deutan", "severity": 0.8 }
```

Loaded at launch, saved on every change. A missing or unreadable file falls
back to these defaults.

### Shortcuts (`src/shortcuts.js`)

| Action | Windows | macOS |
|---|---|---|
| Toggle correction | Ctrl+Alt+P | Cmd+Option+P |
| Judge view simulator | Ctrl+Alt+S | Cmd+Option+S |
| Color names | Ctrl+Alt+C | Cmd+Option+C |
| Conflict finder | Ctrl+Alt+F | Cmd+Option+F |

The toggle doubles as the panic key if a correction makes the screen hard to
read. If a shortcut fails to register, the panel shows which one.

## Features

### Control panel

A small window opened from the tray icon, anchored near it, hidden when it
loses focus.

Contents, top to bottom:

- App name and an on/off switch
- Segmented control for the four types
- Severity slider, 0 to 100
- Buttons: Take vision test, Judge view, Color names, Find conflicts
- A status line for errors and for the achromatopsia limit

Changes apply to the screen immediately.

Apple styling: system font stack (`-apple-system`, `SF Pro Text`,
`Segoe UI Variable`), translucent blurred background (vibrancy on macOS,
acrylic on Windows 11), 12 px corner radius, iOS-style switch and segmented
control, soft shadows, light and dark themes following the system.

### Judge view simulator

Purpose: let a person with normal vision see the benefit.

- Takes a snapshot and opens a full-screen window showing it.
- A draggable vertical divider splits the image.
  - Left: the snapshot as the selected vision type sees it, `S x pixel`.
  - Right: the snapshot as that person sees it with Photon on,
    `S x C x pixel`.
- A control at the top switches the left side between "Without Photon" and
  "Normal vision", so judges can also compare against the original.
- Both sides are drawn on canvases using the engine. Esc closes it.

### Color names

- The shortcut toggles the mode on and off.
- While on, a small rounded label follows the cursor showing a swatch, the
  name, and the hex code.
- The cursor position is polled about 15 times a second. The color is read
  from a snapshot taken when the mode starts, so the label reports the true
  color, not the corrected one.
- The snapshot is refreshed every second when captures are unaffected by
  the correction. Otherwise it is refreshed only when the mode is switched
  off and on again, to avoid flicker.

### Vision test

- Ten plates drawn on a canvas: a field of dots of varying size, with a
  single digit formed by dots of a different color.
- One control plate that everyone can read, then three plates for each of
  the protan, deutan and tritan confusion axes, with decreasing color
  difference. Dot brightness is randomized so the digit cannot be found by
  brightness alone.
- For each plate the person types the digit they see or presses "Nothing".
- Correction is paused for the duration of the test.
- Result: the axis with the most misses sets the type. A tie is broken in
  the order deutan, protan, tritan, which is most to least common. One, two
  or three misses on that axis set severity to 0.4, 0.7 or 1.0. No misses reports "No color vision
  deficiency detected" and changes nothing. A miss on the control plate
  reports that the test could not be scored.
- The result screen has an Apply button and states that this is a screening
  aid and not a medical diagnosis.

Achromatopsia is not detected by the test and is chosen by hand.

### Conflict finder

- Takes a snapshot and downsamples it.
- Groups pixels into the 12 most common colors.
- A pair of colors is a conflict when the two are clearly different to
  normal vision (`deltaE > 20`) and, to the user, either look the same
  (`deltaE` of the simulated colors `< 8`) or keep less than 35% of that
  difference. The second condition catches pairs such as red and green,
  which a color blind person sees as two similar shades and cannot tell
  which is which.
- Opens a full-screen click-through overlay that outlines the regions of
  each conflicting pair and tags both with the same number and their color
  names. Esc or the shortcut dismisses it.
- If there are no conflicts, a brief message says so.

## Error handling

- Backend fails to start: the switch stays off and the panel shows the
  reason. All other features remain usable.
- macOS Screen Recording permission missing: the panel explains it and
  offers a button that opens the right System Settings page.
- On quit, `backend.clear()` then `backend.stop()` always run.
- Only one instance of the app may run.

## Testing

Automated (`node --test`):

- `simulate` at severity 0 returns the identity matrix for every type.
- `correct` at severity 0 leaves colors unchanged for every type.
- For a known red-green confusion pair, the simulated colors are closer
  together than the originals, and the simulated corrected colors are
  further apart than the simulated originals. Same for a blue-yellow pair
  with `tritan`.
- `applyMatrix` clamps out-of-range results.
- `colorName` returns the expected name for a table of reference colors.
- `deltaE` matches reference values.
- Vision test scoring maps answer sets to the expected type and severity.
- Conflict detection finds the conflict in a synthetic two-color image and
  finds none in an image of two colors the user can distinguish.

Manual, on Windows:

- Correction applies to a browser, a slide deck, and a video, and clears on
  toggle, on quit, and on forced process kill.
- Each feature works with correction on and with it off.
- The overlay backend runs with `PHOTON_BACKEND=overlay`.

Manual, on macOS, by a teammate: launch, grant permission, verify each
feature, and report whether the overlay captures itself.

## Build order

Each step leaves the app in a working, demonstrable state.

1. Engine with tests
2. Windows correction, tray, control panel, settings, toggle shortcut
3. Judge view simulator
4. macOS overlay backend, time-boxed
5. Color names
6. Vision test
7. Conflict finder

If time runs out, steps are dropped from the end.
