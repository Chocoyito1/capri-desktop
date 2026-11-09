"""Persistent, offline-only Qwen speech worker; newline JSON in, PCM chunks out."""
import base64
import contextlib
import json
import os
from pathlib import Path
import queue
import sys
import threading
import time

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
os.environ['OMP_NUM_THREADS'] = '4'
protocol = sys.stdout

def emit(kind, **payload):
    protocol.write(json.dumps({'type': kind, **payload}) + '\n')
    protocol.flush()

jobs = queue.Queue(maxsize=2)
active = threading.Event()
stopping = threading.Event()

def receive():
    for line in sys.stdin:
        if len(line) > 20000:
            continue
        try:
            item = json.loads(line)
            if item.get('type') == 'cancel':
                active.set()
                retained = []
                while not jobs.empty():
                    try:
                        pending = jobs.get_nowait()
                        if pending.get('type') == 'init':
                            retained.append(pending)
                    except queue.Empty:
                        break
                for pending in retained:
                    jobs.put_nowait(pending)
            elif item.get('type') == 'close':
                os._exit(0)
            elif item.get('type') in ('init', 'speak'):
                jobs.put_nowait(item)
        except (ValueError, queue.Full):
            continue
    # The Electron parent owns this worker. Never leave GPU memory orphaned.
    os._exit(0)

def main():
    cfg = json.loads(sys.stdin.readline())
    import numpy as np
    import torch
    from faster_qwen3_tts import FasterQwen3TTS
    torch.set_num_threads(4)
    torch.set_num_interop_threads(2)
    if not torch.cuda.is_available():
        raise RuntimeError('The local Qwen voice requires a working CUDA runtime.')
    # Bound this allocator rather than letting a long request occupy all VRAM.
    torch.cuda.set_per_process_memory_fraction(0.60)
    if cfg.get('type') != 'init':
        raise RuntimeError('Missing voice initialization.')
    model_path = Path(cfg['model'])
    reference = Path(cfg['reference'])
    if not (model_path / 'config.json').is_file() or not reference.is_file():
        raise RuntimeError('Install the local voice model and reference before enabling Qwen.')
    if not cfg.get('referenceText', '').strip():
        raise RuntimeError('The voice reference transcript is missing.')
    started = time.perf_counter()
    with contextlib.redirect_stdout(sys.stderr):
        model = FasterQwen3TTS.from_pretrained(
            str(model_path), local_files_only=True, max_seq_len=1536,
            attn_implementation='sdpa')
        # Cache the voice once; generation also caches reusable reference features.
        prompt = model.model.create_voice_clone_prompt(
            ref_audio=str(reference), ref_text=cfg['referenceText'], x_vector_only_mode=False)
        for _ in model.generate_voice_clone_streaming(
            text="I'm here, sweetheart.", language='English', voice_clone_prompt=prompt,
            max_new_tokens=100, chunk_size=8):
            pass
    torch.cuda.empty_cache()
    # Initialize native libraries and CUDA before a blocking Windows pipe reader.
    threading.Thread(target=receive, daemon=True).start()
    emit('ready', seconds=time.perf_counter()-started,
         reservedMiB=round(torch.cuda.memory_reserved()/1048576))
    while True:
        request = jobs.get()
        if request.get('type') != 'speak':
            continue
        ident = request.get('id')
        text = request.get('text', '')
        if not isinstance(text, str) or not 0 < len(text) <= 1500:
            emit('error', id=ident, error='Invalid speech text.')
            continue
        active.clear()
        started = time.perf_counter()
        first = None
        samples = 0
        try:
            with contextlib.redirect_stdout(sys.stderr):
                stream = model.generate_voice_clone_streaming(
                    text=text, language=request.get('language', 'Auto'),
                    voice_clone_prompt=prompt, max_new_tokens=600, chunk_size=8)
                for audio, rate, _ in stream:
                    if active.is_set():
                        break
                    if first is None:
                        first = time.perf_counter()-started
                    pcm = (np.clip(np.asarray(audio).reshape(-1), -1, 1)*32767).astype('<i2')
                    samples += len(pcm)
                    emit('chunk', id=ident, sampleRate=rate,
                         audio=base64.b64encode(pcm.tobytes()).decode('ascii'))
                stream.close()
            emit('done', id=ident, cancelled=active.is_set(), firstAudioSeconds=first,
                 seconds=time.perf_counter()-started, samples=samples)
        except Exception as exc:
            emit('error', id=ident, error=str(exc)[-500:])

try:
    main()
except Exception as exc:
    emit('error', error=str(exc)[-500:])
    sys.exit(1)
