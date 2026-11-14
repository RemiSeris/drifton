# Drifton

Generative functional music in the browser, to focus or relax.

Everything is **generated in real time** with the Web Audio API: no audio files, no
dependencies, no server. Long-term goal: an infinite stream of music that adapts to
the listener (see [`ROADMAP.md`](ROADMAP.md)).

Live: https://rooxam.github.io/drifton/

## Use

**Double-click `index.html`**: the home page links to every part. Each part also
works on its own by double-clicking its `index.html`.

| Part | Folder | What it is |
|---|---|---|
| Generator | `generator/` | Press play: four instruments played by rules (pad, bass, bells, texture), modal harmony, voice-led chords |
| Synth | `synth/` | The home-made synth: play the instruments from the keyboard and shape their sound |
| Drone player | `player/` | The original version: generative drone with Focus / Relax / Deep presets |
| Pad states | `pads/` | Early prototype: one pad in three states crossfaded by a conductor, granular layer, amplitude modulation |

`common.css` holds the styles shared by the home page, the synth, the generator and
the pad prototype.

## Edit / iterate

- Each part is plain HTML + JS loaded with classic `<script>` tags; the load order at
  the bottom of each `index.html` matters.
- Drone player sounds: `player/presets.js`. Synth starter sounds: `synth/patches.js`.
- After a change, save and refresh the tab.
