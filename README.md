# Drifton

A local generative drone music tool to focus or relax.

The sound is **generated in real time** in your browser (Web Audio API).
No audio files, no dependencies, no server — everything runs locally.

## Use

**Double-click `index.html`** → it opens in your browser → click the play button.
That's it.

- Pick an ambience: **Focus**, **Relax** or **Deep**.
- Round button = play / pause (or the **Space** bar).
- Slider = volume.

It never loops: the voices "breathe" and notes appear at random. You can leave it
running indefinitely.

## File structure

| File | Role |
|---|---|
| `index.html` | Markup, ties everything together |
| `styles.css` | Styling |
| **`presets.js`** | **The ambiences — this is where you tweak the sound** |
| `engine.js` | The audio generation engine (Web Audio API) |
| `ui.js` | Wires up the buttons and the display |

The script load order (`presets` → `engine` → `ui`) is set at the bottom of
`index.html` and matters: don't change it.

## Edit / iterate

- To **shape the sound**: open `presets.js`. Every parameter is commented (root
  note, chord, reverb, noise, speed…). To add an ambience, copy a block and change
  the key — the button shows up automatically.
- To touch the **engine** (reverb, noise, filters, voice structure): `engine.js`.
- After a change, **save and refresh the tab** (F5).

## Access it from any computer

Since it's just static files, you can host it for free by **drag-and-drop**, no
command line needed:

- [app.netlify.com/drop](https://app.netlify.com/drop) — drop the folder, get a URL.
- or [Cloudflare Pages](https://pages.cloudflare.com/) / GitHub Pages.

## Ideas

- Advanced sliders (density, pitch, filter, reverb) to explore sounds.
- Remember the last preset + volume (`localStorage`).
