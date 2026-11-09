# Curious sprite slice

Eight full-body drawings generated with the built-in image generation tool,
using `../capri-full.png` as identity reference. These are AI-generated raster
art, not human-drawn frames or screenshots of the old shader rig. The first
candidate was rejected for edge-clipped hair. `source.png` is the second output,
retained unchanged. `frames/` and `atlas.png` are deterministic whole-drawing
crops, scaled and foot-registered by `tools/pack-animation.py` (Pillow).

This is a visual direction/integration candidate, not final animation cleanup.
Costume consistency, hair-volume drift, edge quality and transitions to legacy
states still require art review. Existing upstream character/art rights remain
applicable; this work does not establish new permissions or a release clearance.

## Final generation prompt

Use case: stylized-concept. Asset type: production full-body 2D sprite animation
sheet for Capri desktop companion. Reference image: existing Capri identity
only, redesign polish allowed. Create ONE transparent RGBA sprite sheet, exactly
4 columns by 2 rows of equal cells, 8 distinct sequential full-body animation
drawings read left to right then next row. No labels, no grid lines, no background,
no shadows on a floor. Capri is a slender angular cyberpunk imp woman with enormous
jagged crimson/magenta flame-like mane, small neon green angular mask/eyes, dark
violet fitted torso and long very slender asymmetric green/crimson legs, pointed
feet. Preserve these recognizable traits; improve elegant clean hand-inked cel
animation art. Action: curious idle with a small head dip and glance, shoulders
and torso compress with anticipation, one hand lifts toward chin with bent elbow,
curious head tilt, then hand lowers and settles back into SAME relaxed standing
pose by frame 8. Frame1 relaxed, frame2 anticipation, frame3 hand begins lift,
frame4 thoughtful chin touch, frame5 tilt and blinking green eyes, frame6 hand
lowers, frame7 overshoot settle, frame8 relaxed matching frame1. Each frame is an
independently drawn complete character including evolving hair silhouette,
expression and torso contours, never detached rig parts. Stable character scale,
identical pinned foot baseline and centered feet within every cell. Tall full body
fully contained with generous transparent margins in each cell, mane never overlaps
adjacent cell. Crisp bold ink, flat cel shading, no gradients or text. Exactly
8 drawings.

CRITICAL production correction: Every one of the 8 figures must fit ENTIRELY
inside its cell, including the highest hair spikes. Shrink ALL figures to 80
percent of cell height, with 10 percent empty transparent margin ABOVE hair and
BELOW feet. Keep identical baseline and character scale in all eight cells.
Square overall sheet, four columns two rows, tall rectangular individual cells.
Clean opaque color interiors and clean transparent exterior, no speckled erosion
along edges.
