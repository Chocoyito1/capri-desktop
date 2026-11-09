> Current behavior: [compact, interruptible voice conversations](docs/COMPACT-VOICE.md). Text chat is silent. The setup notes below describe earlier iterations.
> Expressive voice setup: [Qwen voice](docs/EXPRESSIVE-VOICE.md).
> Previous hands-free behavior: [Hey Capri wake listening](docs/WAKE-WORD.md).
> Wake-addressed requests can auto-send; manual mic dictation remains reviewable.
> Earlier setup notes below may describe the previous click-only behavior.

# Local speech development

## Implemented and verified

Settings → Sound now offers spoken chat replies, engine selection, CPU/GPU,
Python executable, reference WAV and reference transcript. Speech is off by
default. Choose **Windows offline voice** and enable **Speak chat replies** to
use the working baseline after restarting Capri. Volume and mute apply to speech
and character effects. No model installation is needed for the Windows voice.

Replies are synthesized after the full AI answer completes, up to 1,500 spoken
characters. A new message, closing chat, Escape, dictation, hiding Capri, gaming,
fullscreen, renderer reload or app exit cancels generation/playback. Generation
has a two minute deadline and a 16 MB output limit. Temporary request/audio files
are deleted after each job. An amplitude callback drives the existing talk
gesture; this is not phoneme lip synchronization. Reduced motion still follows
the existing animation policy.

The clone adapters run one Python process per reply. This releases model memory
on completion/interruption, but adds model loading latency to every reply.
There is no persistent GPU worker, streaming synthesis, game FPS benchmark or
automatic CPU fallback yet. Errors appear beneath the chat input. Speech does
not change the written answer or send a message by itself.

## Supplied recording

The attachment was recovered through the referenced chat, rather than the Linux
`/mnt/data` path. Local assets live under ignored `.caprigpt-local/voice-reference/`:

- `original.mp3`: unchanged copy, SHA-256
  `c75c210dfec34428af7a1af50def991b7a6054fe9245530efdd1946fe90ad7d8`.
- `decoded.wav`: mono 24 kHz decode of the 129.493 second recording.
- `cleaned-preview.wav`: conservative 80 Hz–10 kHz filtering and bounded gain.
- `inspection.json`: clipping metrics and **unreviewed energy intervals**.
- `reference.wav`: provisional 21.10–25.10 second excerpt, still requires review.
- `transcript-candidate.txt`: local Whisper output, “I can do it.”, not a verified
  transcript or speaker attribution.

The decoded recording had no detected full-scale clipping. Energy detection does
not distinguish dialogue from music/effects, identify Capri, or detect another
speaker. Filtering is not dialogue source separation. The provisional reference
is deliberately not configured as a production voice. Listen to the original
and preview, select a single-speaker line, and verify every word before cloning.
If music/overlap remains, use a local dialogue-separation model and compare its
output with the source for damaged consonants, reverb and lost voice character.

Reproduce preparation from this checkout:

```powershell
uv venv --python 3.11 .caprigpt-local/voice-venv
uv pip install --python .caprigpt-local/voice-venv/Scripts/python.exe -r scripts/voice-analysis-requirements.txt
.caprigpt-local/voice-venv/Scripts/python.exe scripts/prepare-voice.py 'PATH_TO_SAMPLE.mp3'
# After listening, pass --start SECONDS --end SECONDS to export a 3–12 second excerpt.
```

## Model evaluation and remaining work

| Engine | Fit | Current status |
| --- | --- | --- |
| Windows System.Speech | Offline baseline; no identity matching | Real synthesis and Electron playback verified |
| Chatterbox English (`ChatterboxTTS`) | Reference-audio cloning without reference transcription | Adapter follows official API; no weights installed or cloned output tested |
| F5-TTS (`F5TTS`) | Short reference with exact transcription; useful comparison baseline | Adapter follows official API; no weights installed or cloned output tested |

The [Chatterbox repository](https://github.com/resemble-ai/chatterbox) now says
the research is retired and unmaintained. Its Python 3.11 dependencies pin an
older PyTorch version, so compatibility with this RTX 5070 Ti Laptop's Blackwell
GPU must be checked before choosing a CUDA environment. The adapter uses the
original English API, not Multilingual V3, Turbo or Nano.

[F5's official setup](https://github.com/SWivid/F5-TTS#installation) documents
Python 3.11, FFmpeg and CUDA 12.8 PyTorch. It is the first proposed clone trial
once a reference is reviewed. Its code is MIT, but the supplied pretrained models
are CC-BY-NC according to the project's License section. Model licenses do not
grant rights to the anime recording or performance. Keep recordings and derived
references local; obtain appropriate permission before distributing a character
voice or using it commercially. Preserve Chatterbox's built-in watermark.

Use **separate Python environments** for the two engines to avoid conflicting
PyTorch/NumPy requirements. Install the chosen package and its compatible
dependencies following its official setup, then pre-cache its model and vocoder
weights explicitly. Capri sets `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1`
before imports; normal speech requests do not initiate model downloads. A missing
cache fails visibly. Set the absolute Python path and a reviewed WAV in Sound.
F5 also needs its exact transcript and FFmpeg available in that environment.
CPU is the default. CUDA is an explicit choice; GPU feasibility and game impact
have not been benchmarked on this machine.

Compare the same short lines with both models. Record model/package revisions,
reference hash, cold load, total generation time, generated audio duration,
peak VRAM, pronunciation errors, and listening judgments for similarity and
background leakage. Do not claim similarity based on successful WAV generation.

## Checks

```powershell
npm test
node_modules/electron/dist/electron.exe scripts/check-tts-renderer.js
node_modules/electron/dist/electron.exe scripts/smoke-electron.js --tts-only
```

The renderer check uses silent output gain but a real AudioContext, decoded WAV,
playback clock and amplitude analysis. It does not establish audible quality.
This implementation passed all 143 Node tests, the separate Electron playback
check, the actual overlay TTS IPC check (real Windows synthesis, mute and
in-flight cancellation), and the existing settings smoke check. Clone inference
and speaker similarity remain unverified.
The running companion was not restarted. Its desktop shortcut was inspected and
already points directly at this checkout's Electron executable, absolute project
argument, working folder and Capri icon.
