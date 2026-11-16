# Drifton

Small sound tools that run in your browser: listen, play, learn, make.

A collection of simple tools around sound, sharing the same home-made Web Audio engine
and design: generative functional music to focus or relax, a piano practice player,
a synth… No dependencies, no server. See [`ROADMAP.md`](ROADMAP.md).

Live: https://rooxam.github.io/drifton/

## Use

**Double-click `index.html`**: the home page links to every part. Each part also
works on its own by double-clicking its `index.html`.

| Tool | Folder | What it is |
|---|---|---|
| Focus music | `generator/` | Press play: four instruments played by rules (pad, bass, bells, texture), modal harmony, voice-led chords |
| Synth | `synth/` | The home-made synth: play the instruments from the keyboard and shape their sound |
| Drone | `player/` | The original version: generative drone with Focus / Relax / Deep presets |
| Pad states | `pads/` | Early prototype: one pad in three states crossfaded by a conductor, granular layer, amplitude modulation |
| Groove | `groove/` | Rhythm styles (funk, dub, bossa nova, house, afrobeat, boom bap, trip-hop, reggaeton) as grids of chances: morph between two, play live from the keyboard, play or follow a melody |
| Piano score | `score/` | Open a `.mid` file and practice: falling notes on a keyboard, speed, loop on bars, see / hear each hand |

`common.css` holds the styles shared by the home page, the synth, the generator and
the pad prototype.

## Edit / iterate

- Each part is plain HTML + JS loaded with classic `<script>` tags; the load order at
  the bottom of each `index.html` matters.
- Drone player sounds: `player/presets.js`. Synth starter sounds: `synth/patches.js`.
- After a change, save and refresh the tab.
