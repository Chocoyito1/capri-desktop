"""Local, non-destructive inspection. Energy candidates are NOT speaker identification."""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import imageio_ffmpeg
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfiltfilt

p = argparse.ArgumentParser()
p.add_argument('source', type=Path)
p.add_argument('--out', type=Path, default=Path('.caprigpt-local/voice-reference'))
p.add_argument('--start', type=float)
p.add_argument('--end', type=float)
a = p.parse_args()
a.out.mkdir(parents=True, exist_ok=True)
original = a.out / ('original' + a.source.suffix.lower())
digest = lambda f: hashlib.sha256(f.read_bytes()).hexdigest()
if original.exists() and digest(original) != digest(a.source):
    raise SystemExit('Output already holds a different original; choose another output folder.')
if not original.exists():
    shutil.copy2(a.source, original)
decoded = a.out / 'decoded.wav'
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-y', '-i', str(original),
                '-ac', '1', '-ar', '24000', str(decoded)], check=True)
x, sr = sf.read(decoded)
filtered = sosfiltfilt(butter(3, [80, 10000], btype='bandpass', fs=sr, output='sos'), x)
# Conservative filtering only: music/effects and overlapping voices are not removed.
peak = np.max(np.abs(filtered))
cleaned = filtered * min(1.5, .89 / max(peak, 1e-8))
sf.write(a.out / 'cleaned-preview.wav', cleaned, sr, subtype='PCM_16')
hop = sr // 20
rms = np.array([np.sqrt(np.mean(x[i:i+hop] ** 2)) for i in range(0, len(x), hop)])
active = rms > max(.008, np.percentile(rms, 20) * 2)
regions, start, last = [], None, 0
for i, value in enumerate(active):
    if value:
        if start is None:
            start = max(0, i * .05 - .1)
        last = (i + 1) * .05
    if start is not None and (i * .05 - last > .35 or i == len(active)-1):
        end = min(len(x)/sr, last + .15)
        if end - start >= 1:
            regions.append({'start': round(start, 2), 'end': round(end, 2), 'status': 'unreviewed-energy-candidate'})
        start = None
report = {'source_sha256': digest(a.source), 'original_sha256': digest(original),
          'duration_seconds': len(x)/sr, 'sample_rate': sr, 'peak': float(np.max(np.abs(x))),
          'clipped_fraction': float(np.mean(np.abs(x) >= .999)), 'candidates': regions,
          'limitations': 'Filtering is not source separation. No candidate is certified voice-only or attributed to Capri.'}
if a.start is not None or a.end is not None:
    if a.start is None or a.end is None or not 0 <= a.start < a.end <= len(x)/sr or not 3 <= a.end-a.start <= 12:
        raise SystemExit('Select a reviewed region of 3–12 seconds inside the recording.')
    sf.write(a.out / 'reference.wav', cleaned[int(a.start*sr):int(a.end*sr)], sr, subtype='PCM_16')
    report['selected'] = {'start': a.start, 'end': a.end, 'review_required': True}
(a.out / 'inspection.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
