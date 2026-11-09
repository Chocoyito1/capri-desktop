// Full-body raster exposure sheets. No limb transforms or interpolated drawings.
export function validateAtlas(atlas, width = atlas.width, height = atlas.height) {
  const fail = message => { throw new Error(`Invalid cel atlas: ${message}`); };
  if (atlas.version !== 1 || atlas.width !== width || atlas.height !== height
      || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
      || width > 4096 || height > 4096 || width * height > 4194304) fail('dimensions/version');
  if (typeof atlas.image !== 'string' || !/^[a-z0-9-]+\.png$/.test(atlas.image)) fail('image path');
  if (!Array.isArray(atlas.frames) || !atlas.frames.length || atlas.frames.length > 512) fail('frame count');
  for (const f of atlas.frames) {
    if (!Array.isArray(f.rect) || f.rect.length !== 4 || !f.rect.every(Number.isInteger)) fail('frame rectangle');
    const [x,y,w,h] = f.rect;
    if (x < 0 || y < 0 || w !== 240 || h !== 420 || x+w > width || y+h > height) fail('frame bounds');
  }
  if (!atlas.clips || !Object.keys(atlas.clips).length) fail('clips');
  for (const clip of Object.values(atlas.clips)) {
    if (typeof clip.loop !== 'boolean' || !Array.isArray(clip.exposures) || !clip.exposures.length) fail('exposures');
    let duration = 0;
    if (clip.stillFrame !== undefined && (!Number.isInteger(clip.stillFrame) || !atlas.frames[clip.stillFrame])) fail('still frame');
    for (const exposure of clip.exposures) {
      if (!Array.isArray(exposure) || exposure.length !== 2) fail('exposure shape');
      const [index, ms] = exposure;
      if (!Number.isInteger(index) || !atlas.frames[index] || !Number.isFinite(ms) || ms <= 0) fail('exposure timing/index');
      duration += ms;
    }
    if (duration !== clip.durationMs || duration > 60000) fail('duration');
  }
  if (!atlas.clips.rest || !atlas.clips.curious) fail('required clips');
  return atlas;
}

export function sampleClip(atlas, name, elapsedMs, still = false) {
  const clip = atlas.clips[name];
  if (!clip || !Number.isFinite(elapsedMs)) return null;
  if (still) {
    const index = clip.stillFrame ?? clip.exposures[0][0];
    return {...atlas.frames[index], index};
  }
  let t = Math.max(0, elapsedMs);
  if (clip.loop) t %= clip.durationMs;
  else t = Math.min(t, clip.durationMs - 0.001); // Hold settle until the state owner completes.
  for (const [index, ms] of clip.exposures) {
    if (t < ms) return {...atlas.frames[index], index};
    t -= ms;
  }
  return null;
}

export function selectCelClip(pet) {
  if (pet.busy || pet.hidden || pet.stowed || pet.dormant || pet.gaming || pet.fullscreen
      || pet.fullscreenProgress || pet.dragging || pet.pointerHeld || pet.pointing || pet.debug
      || pet.stance !== 'stand' || pet.groundRest || pet.p.sit || pet.p.alpha !== 1
      || pet.p.collapse || pet.p.dissolve || pet.mode === 'sleep') return null;
  if (pet.act) return ['idlePreen', 'think'].includes(pet.act.player.name) ? 'curious' : null;
  return ['stand', 'focus'].includes(pet.base.name) ? 'rest' : null;
}

// State owners supply stable object tokens. Returning to a base starts at its
// shared neutral drawing, rather than an arbitrary phase of a global clock.
export class CelPlayback {
  reset() { this.name = this.token = this.startedAt = this.still = null; }

  sample(atlas, name, token, now, {still = false, startAt, durationMs} = {}) {
    if (!name || !Number.isFinite(now)) { this.reset(); return null; }
    if (name !== this.name || token !== this.token || still !== this.still) {
      this.name = name; this.token = token; this.startedAt = now; this.still = still;
    }
    let elapsed = Math.max(0, now - (startAt ?? this.startedAt));
    if (durationMs !== undefined) {
      if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
      elapsed *= atlas.clips[name].durationMs / durationMs;
    }
    return sampleClip(atlas, name, elapsed, still);
  }
}
