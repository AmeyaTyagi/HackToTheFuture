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
  - `protan`, `deutan`, `tritan`: the signal the viewer cannot see is
    added back where they can see it. The signal is one number per color:
    how much one channel of the viewer's picture differs from a normal
    viewer's. Per type, a row (which channel) and three weights (how much
    of the signal goes into red, green and blue):
    `C = I + weights (x) (I - S)[row]`. Grays, black and white
    are unchanged. For deutan (row red, weights 0, -1, 0) reds lose their
    green and greens gain it, so the two differ in brightness.
  - **How the weights were chosen.** The first version used textbook
    daltonization (send the error into green and blue at 0.7). An audit
    showed it separated red from green but left more color pairs
    confusable than it fixed. The weights were then found by search over
    107 colors from real chart, status, brand and web palettes plus black,
    white and grays, keeping only candidates that at 60%, 80% and 100%
    strength are never worse than no correction and keep red and green
    visible on dark and light backgrounds. `tests/audit.test.js` holds
    the colors and re-checks this.
  - **Measured effect**, as pairs of clearly different colors that look
    the same to the viewer, without and with Photon, on the two color sets
    at full strength: deutan 45 to 26 and 44 to 31; protan 48 to 22 and 38
    to 28; tritan 16 to 4 and 31 to 12.
  - **Limits.** A person missing one color sensor sees two dimensions of
    color where others see three, so some colors must always collide; a
    correction chooses which. On colors spread evenly over the whole color
    space, including extreme ones, the correction does not reduce the
    count. Below about 50% strength there is almost nothing to fix and the
    correction can cost a pair or two. Both color sets were used in the
    search, so the tests guard against regressions and are not an
    independent validation. None of this has been tried by color blind
    people.
  - There was briefly a Boost setting that scaled the correction. It was
    removed: once the weights were tuned, the full correction was the best
    setting, and applying less of it was sometimes worse than applying
    none.
  - `achroma`: color cannot be restored. Applies a contrast stretch around
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

### Capture (`src/main/capture.js`)

- `snapshot()` returns the primary display at native resolution as a BGRA
  bitmap. Snapshots must hold true colors, not corrected ones.
- `pixelAt(cursor)` returns the true color under a cursor position.

On Windows both go through GDI (`src/main/gdi.js`), which reads the whole
screen in about 50 ms and one pixel in under 10 ms. Electron's
`desktopCapturer` took about two seconds on the build machine, so it is
used only where GDI is unavailable (macOS).

Whether a capture includes the correction depends on the backend, and each
backend declares it as `capturesIncludeEffect`. This was measured on Windows
rather than probed at every launch, because probing would flash the screen.

- Windows magnifier: captures include the correction. A read calls
  `backend.clear()`, waits 40 ms, reads, and reapplies. A read sees the
  lifted effect within about 10 ms, so the screen shows true colors for
  roughly 50 to 100 ms.
- Overlay: the overlay window is excluded from capture, so reads are direct.

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

A small window opened from the tray icon, anchored near it. It stays open
while its features are switched on and off, and hides as soon as the user
clicks anywhere outside it. Hiding never quits Photon; the tray icon brings
the panel back. It can also be hidden with its Hide button or Esc. Each tool row is a toggle and shows "On" while its
feature is active. The panel is excluded from snapshots for the moment of
the read, so it never appears in the judge view or the conflict scan.

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
- A switch between "My screen" and "Demo image". The demo image is a mock
  dashboard drawn in code, full of the color pairs most often confused
  (red and green bars, lines and status badges, a traffic light), so the
  comparison is striking whatever happens to be on screen.
- Both sides are drawn on canvases using the engine. Esc closes it.

### Color names

- The shortcut toggles the mode on and off.
- While the mode is on, nothing is shown as long as the cursor is moving.
  When the cursor has rested within 3 pixels of one spot for 2 seconds, a
  small rounded label appears right beside it showing a swatch, the color's name,
  and its hex code. Moving the cursor hides the label again.
- The color is the exact pixel under the tip of the cursor (its position
  is taken from Windows in physical pixels), read at the moment the label
  appears. It is the true color, not the corrected one, and never an
  estimate:
  - With correction off, the screen pixel is read directly.
  - With correction on, the screen shows corrected colors, so the color is
    taken from the window under the cursor, which draws its own picture
    unaffected by correction (`PrintWindow`). Nothing on screen changes.
    The answer is accepted only if running it through the current
    correction reproduces what the screen shows at that pixel, within 4
    per channel for rounding.
  - If that check fails (a see-through window, a window that will not
    draw), correction is lifted for about 50 ms and the screen pixel is
    read directly. This is the only case with a visible flicker.
  - Recovering the true color by inverting the correction was measured and
    rejected: it names the color correctly only 60 to 80% of the time,
    because strong corrections push colors past what the screen can show.
- The hex code shown is exact. The name is a description of that color:
  a brightness word plus a color family, with everyday names for brown,
  olive, tan, beige, pink, teal and purple.

### Vision test

The test measures, for each of the three cone types, the smallest color
difference the person can see, and sets Photon from the result.

- **Plates.** A circle of small dots with a single digit formed by dots of
  a second color. The two colors of a plate differ in the response of
  exactly one cone type (L for protan, M for deutan, S for tritan) and are
  identical for the other two, computed in linear light from the sRGB to
  cone-response matrix of Vienot, Brettel and Mollon (1999). A person
  missing that cone cannot see the digit however large the difference; a
  person in whom it is weak needs a larger difference than normal.
- **Why this needs little calibration.** The colors come from cone
  responses, not from a palette chosen by eye. Each plate is centered on
  the same mid-gray. Dot brightness varies by about 16% either way, which
  hides the small brightness errors an uncalibrated screen adds. The digit
  changes on every plate, so it cannot be memorized, and guessing succeeds
  one time in ten.
- **Difficulty ladder.** Six levels per axis, defined by the difference a
  person with normal vision sees between digit and background: deltaE of
  56, 40, 28, 20, 14 and 10. The same ladder on all three axes makes the
  three results comparable.
- **Procedure.** One control plate that anyone can read by brightness, then
  seven plates per axis, interleaved, 22 in all. Each axis runs a
  staircase starting at the second level: a right answer makes that axis
  one level harder, a wrong answer one level easier. Each axis therefore
  settles at the person's threshold.
- **Scoring.** An axis's threshold is the average level over its last four
  plates, from -1 (could not read the easiest) to 6 (read the hardest every
  time). The axis with the lowest threshold sets the type, with ties broken
  in the order deutan, protan, tritan, most to least common. A threshold of
  4.5 or more is normal, which allows one slip. Below that, severity runs
  linearly from 20% at 4.5 to 100% at -1, rounded to the nearest 5%.
- A miss on the control plate ends the test and reports that it could not
  be scored.
- Correction is paused for the duration of the test. The intro asks the
  person to turn off Night Light, True Tone or other blue-light filters and
  to use at least half brightness.
- The result screen has an Apply button and states that this is a screening
  aid and not a medical diagnosis.

Limits: the test assumes a screen close to sRGB, it has not been validated
against clinical tests or tried by color blind people, and the mapping
from threshold to severity is an estimate. Achromatopsia is not detected
and is chosen by hand.

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
