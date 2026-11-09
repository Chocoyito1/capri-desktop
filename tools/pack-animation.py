"""Pack complete full-body drawings using an editable JSON exposure recipe.
Pillow is an authoring dependency. No poses or in-betweens are synthesized.
Usage: python tools/pack-animation.py assets/capri/animation-v2/source.png
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
from PIL import Image

WIDTH, HEIGHT = 240, 420


def alpha_box(image):
    return image.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()


def read_drawings(base, spec):
    """A grid or explicit ordered PNG paths; order is never filesystem-dependent."""
    if 'files' in spec:
        paths = [base / name for name in spec['files']]
        cells = [Image.open(path).convert('RGBA') for path in paths]
    else:
        paths = [base / spec['path']]
        sheet = Image.open(paths[0]).convert('RGBA')
        columns, rows = spec['columns'], spec['rows']
        if columns < 1 or rows < 1:
            raise ValueError('Grid dimensions must be positive')
        cells = [sheet.crop((round(i % columns * sheet.width / columns),
                            round(i // columns * sheet.height / rows),
                            round((i % columns + 1) * sheet.width / columns),
                            round((i // columns + 1) * sheet.height / rows)))
                 for i in range(columns * rows)]
    if not cells:
        raise ValueError('A source must contain drawings')
    drawings = []
    for i, cell in enumerate(cells):
        box = alpha_box(cell)
        if cell.getextrema()[3][0] != 0 or not box:
            raise ValueError(f'{spec["id"]}:{i}: needs genuine transparency and a visible drawing')
        if min(box[0], box[1], cell.width-box[2], cell.height-box[3]) < 2:
            raise ValueError(f'{spec["id"]}:{i}: clipped drawing; review/regenerate source')
        drawings.append(cell.crop(box))
    scale = min(220 / max(f.width for f in drawings), 400 / max(f.height for f in drawings))
    result = []
    for i, drawing in enumerate(drawings):
        drawing = drawing.resize((round(drawing.width * scale), round(drawing.height * scale)), Image.Resampling.LANCZOS)
        foot = alpha_box(drawing.crop((0, max(0, drawing.height-12), drawing.width, drawing.height)))
        anchor = (foot[0] + foot[2]) / 2
        x, y = round(128-anchor), 418-drawing.height
        if x < 0 or x+drawing.width > WIDTH:
            raise ValueError(f'{spec["id"]}:{i}: foot registration puts mane outside canvas')
        frame = Image.new('RGBA', (WIDTH, HEIGHT))
        frame.alpha_composite(drawing, (x, y))
        result.append(frame)
    provenance = [dict(path=str(path.relative_to(base)).replace('\\', '/'),
                       sha256=hashlib.sha256(path.read_bytes()).hexdigest()) for path in paths]
    return result, provenance


def pack(source, check=False, preview=None):
    base = source.parent
    recipe = json.loads((base / 'recipe.json').read_text(encoding='utf-8'))
    images, names, sources = [], {}, []
    for spec in recipe['sources']:
        drawings, provenance = read_drawings(base, spec)
        sources.extend(provenance)
        for i, frame in enumerate(drawings):
            name = f'{spec["id"]}:{i}'
            if name in names:
                raise ValueError(f'Duplicate drawing name {name}')
            names[name] = len(images)
            images.append(frame)
    columns = recipe.get('atlasColumns', 4)
    rows = math.ceil(len(images) / columns)
    width, height = columns * WIDTH, rows * HEIGHT
    if width > 4096 or height > 4096 or width * height > 4194304:
        raise ValueError('Atlas exceeds resident texture budget; split the recipe')
    atlas = Image.new('RGBA', (width, height))
    metadata = []
    for i, (name, index) in enumerate(names.items()):
        x, y = i % columns * WIDTH, i // columns * HEIGHT
        atlas.alpha_composite(images[index], (x, y))
        metadata.append(dict(name=name, rect=[x, y, WIDTH, HEIGHT],
                             sha256=hashlib.sha256(images[index].tobytes()).hexdigest()))
    clips = {}
    for name, spec in recipe['clips'].items():
        exposures = [[names[ref], ms] for ref, ms in spec['exposures']]
        if not exposures or any(not isinstance(ms, int) or ms <= 0 for _, ms in exposures):
            raise ValueError(f'{name}: exposure times must be positive integer milliseconds')
        if spec['loop'] and spec['exposures'][0][0] != spec['exposures'][-1][0]:
            raise ValueError(f'{name}: loop must share its first/last drawing')
        clips[name] = dict(loop=spec['loop'], durationMs=sum(ms for _, ms in exposures),
                           stillFrame=names[spec['stillFrame']], entryPose=spec['entryPose'],
                           exitPose=spec['exitPose'], exposures=exposures)
    manifest = dict(version=1, image='atlas.png', width=width, height=height,
                    sources=sources, frames=metadata, clips=clips)
    if check:
        saved = Image.open(base / 'atlas.png').convert('RGBA')
        if saved.size != atlas.size or saved.tobytes() != atlas.tobytes():
            raise ValueError('Atlas differs; repack')
        if json.loads((base / 'atlas.json').read_text()) != manifest:
            raise ValueError('Manifest differs; repack')
        for i, frame in enumerate(images):
            saved = Image.open(base / 'frames' / f'{i:02}.png').convert('RGBA')
            if saved.size != frame.size or saved.tobytes() != frame.tobytes():
                raise ValueError(f'Individual frame {i} differs; repack')
    else:
        atlas.save(base / 'atlas.png')
        (base / 'atlas.json').write_text(json.dumps(manifest, indent=2) + '\n')
        (base / 'frames').mkdir(exist_ok=True)
        for i, frame in enumerate(images):
            frame.save(base / 'frames' / f'{i:02}.png')
    if preview:
        preview.mkdir(parents=True, exist_ok=True)
        for clip_name, clip in clips.items():
            for theme, color in [('dark', '#211c2b'), ('light', '#eeeeed')]:
                frames = []
                for index, _ in clip['exposures']:
                    bg = Image.new('RGBA', (300, 450), color)
                    bg.alpha_composite(images[index], (30, 15))
                    frames.append(bg.convert('RGB'))
                frames[0].save(preview / f'{clip_name}-{theme}.gif', save_all=True,
                               append_images=frames[1:], duration=[ms for _, ms in clip['exposures']],
                               loop=0, disposal=2)
    print(f'PASS: {len(images)} complete drawings, {len(clips)} clips, reproducible atlas' if check
          else f'Packed {len(images)} complete drawings / {len(clips)} clips')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Primary source; adjacent recipe.json defines inputs')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--preview', type=Path, help='Export actual-frame GIFs on light/dark backgrounds')
    args = parser.parse_args()
    try:
        pack(args.source, args.check, args.preview)
    except (ValueError, KeyError) as error:
        parser.error(str(error))
