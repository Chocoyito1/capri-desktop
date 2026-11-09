# Breathing / blinking idle

Twelve new full-body raster drawings generated with the built-in image generation
tool. Identity reference: `frames/00.png` from the previous curious slice. These
are AI-generated drawings, not human-drawn art, rig renders or synthesized
in-betweens. `idle-source.png` is the unmodified generated 4x3 sheet.

`recipe.json` packs the source as `breathe:0` through `breathe:11`, exposed in
the looping `rest` clip with the existing `curious:0` neutral at both ends.
There are twenty supplied whole-character drawings total, two performances,
and one reused neutral drawing. The blink is in the new source, not a mask
painted over the old face. Packing only crops, uniformly scales and registers
whole drawings. Source and frame hashes are recorded in `atlas.json`.

Native-size dark/light Electron captures were inspected for neutral, inhale,
closed-eye blink and settle. Minor generated contour/costume drift remains;
this is a foundation for animator cleanup, not a finalized character model.

## Final generation prompt

Use case: stylized-concept.
Asset type: ONE production transparent sprite sheet for Capri's full-body breathing/blinking idle.
Reference image: the supplied single neutral Capri drawing is the locked character model and first/last pose, NOT a sheet to copy multiple times. Maintain its exact outfit geometry, long slender legs, enormous angular crimson/pink mane, small neon-green geometric face/eyes, violet-black fitted torso, asymmetric green/red lower legs and pointed feet. Do not redesign proportions.
Layout: exactly FOUR equal columns and THREE equal rows, TWELVE full-body separately drawn sequential animation frames, read row major. Transparent RGBA background, no text, no cell lines, no floor, no shadow. Each figure occupies 75% of cell height with transparent margin above hair and below feet, no clipping. Identical foot position/baseline and character scale in each cell. All hair and hands contained.
Performance: subtle relaxed standing breathing cycle with one slow blink. No waving, stepping, large swaying or arm lifts. The reaching left arm stays relaxed in the reference's low outward position; the other arm hangs by the side. Legs and feet stay planted. Frame1 neutral exactly matching reference, frame2 beginning inhale, frame3 shoulders and chest lift slightly, frame4 full inhale with hair tips lagging, frame5 hold full inhale, frame6 eyelids half close, frame7 BOTH luminous eyes fully closed as clean fine green slit eyelids (mandatory visible blink), frame8 eyelids half reopen, frame9 open eyes beginning exhale, frame10 shoulders settle, frame11 residual hair follow through, frame12 neutral exactly matching frame1. Only a few pixels of subtle shoulder/head/chest motion. Redraw torso contours and hair tips naturally with the breath; no rigid limb-piece rotations. Consistent clean bold ink and flat cel colors matching reference, no textures, no noisy flecks or gradients. Preserve face and both hands' anatomy. These are complete animation drawings, not duplicated character icons. Precisely twelve figures in a 4 by 3 grid.
