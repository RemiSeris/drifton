// Saved sounds ("patches"), kept in the browser with localStorage so every page of the
// site shares them: what you shape on the synth page is what the generator plays.
//
// localStorage is a small key → text store that a browser keeps per website. We store
// one entry holding all instruments: { "Pad": { "a.wave": "sawtooth", … }, "Bass": … }.
// It can be unavailable (private mode, blocked storage), so every access is guarded:
// the site still works, it just forgets your sounds.

const PATCH_KEY = "drifton.patches.v1";

const PatchStore = {
  readAll() {
    try {
      return JSON.parse(localStorage.getItem(PATCH_KEY)) || {};
    } catch {
      return {};
    }
  },

  writeAll(all) {
    try {
      localStorage.setItem(PATCH_KEY, JSON.stringify(all));
      return true;
    } catch {
      return false;
    }
  },

  get(name) {
    return this.readAll()[name] || null;
  },

  set(name, patch) {
    const all = this.readAll();
    all[name] = patch;
    return this.writeAll(all);
  },

  remove(name) {
    const all = this.readAll();
    delete all[name];
    this.writeAll(all);
  },

  // Called when ANOTHER tab of the site changes the saved sounds (the browser fires a
  // "storage" event in every other tab). Lets the generator follow the synth live.
  onChange(callback) {
    window.addEventListener("storage", (e) => {
      if (e.key === PATCH_KEY) callback();
    });
  },
};

// The sound to use for an instrument: its starter patch, overridden by what was saved.
function currentPatch(name) {
  const starter = makePatch(name);
  return sanitizePatch({ ...starter, ...(PatchStore.get(name) || {}) }, starter);
}

// Keep only known params with valid values: numbers clamped to their range, choices
// limited to their options. Protects against old saves and hand-edited imported files.
function sanitizePatch(patch, fallback) {
  const out = {};
  for (const def of allParamDefs()) {
    let v = patch[def.key];
    if (def.options) {
      if (!def.options.some((o) => o.value === v)) v = fallback[def.key];
    } else {
      v = Number(v);
      if (!Number.isFinite(v)) v = fallback[def.key];
      v = Math.min(def.max, Math.max(def.min, v));
    }
    out[def.key] = v;
  }
  return out;
}

function isStarterPatch(name, patch) {
  const starter = makePatch(name);
  return allParamDefs().every((d) => patch[d.key] === starter[d.key]);
}
