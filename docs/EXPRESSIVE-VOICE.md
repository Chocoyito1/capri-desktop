# Expressive local speech — first iteration

2026-11-09, Windows x64, Ryzen AI 9 HX 370, RTX 5070 Ti Laptop (12,227 MiB VRAM).
The user selected audition A: an original adult female voice, warm, smooth,
confident and affectionate. No external performer's recording is used.

## Runtime and behavior

Qwen3-TTS 1.7B Base clones the selected VoiceDesign reference. The reference and
model stay local. `faster-qwen3-tts==0.5.4`, Transformers 5.15.1, PyTorch
2.11.0+cu128, and Python 3.11.15 were exercised on this laptop. A newer
Transformers 5.22.2 failed tokenizer initialization, so the supported version is
pinned in `scripts/voice-qwen-requirements.txt`.

One hidden Python worker caches the model and reference, warms up on a visible
launch and conversation open, streams 24 kHz PCM into the overlay's audio clock, and unloads after five
minutes without speech. Model allocation is limited to 60% of GPU memory;
PyTorch is configured for four intra-op CPU threads and two inter-op threads.
This is not a GPU utilization or system-wide memory cap. Inference can briefly
use most of the GPU's compute capacity. Gaming behavior has not been tuned.

Complete conversational phrases enter synthesis as text arrives. Code blocks,
control tags and link targets are removed from speech. Text remains the full
response; spoken output is bounded to 1,500 characters. Escape, a new message,
microphone activation, hiding and existing pause rules cancel playback. A
cancelled worker remains warm, and request IDs suppress stale audio. Changes to
the voice settings and app shutdown close the worker. Sound settings include a
voice preview.

The Windows stdio reader starts only after native-library/CUDA initialization.
Starting it earlier hung native initialization in the observed worker process.
The worker exits when its parent pipe closes; no network service is exposed.

## Local setup

Install a dedicated Python environment, CUDA 12.8 PyTorch wheels for RTX 50-series,
and the pinned requirements. Download `Qwen/Qwen3-TTS-12Hz-1.7B-Base` in advance.
No model downloads occur in the speech worker. Runtime, model weights, generated
voice references and previews live under ignored `.caprigpt-local/`; they are
not committed or bundled into the application package.

An optional `.caprigpt-local/voice-setup.json` contains `id`, `ttsPython`,
`ttsModel`, `ttsReference`, and `ttsReferenceText`. Paths must be absolute and
exist. It applies the prepared Qwen settings once on the next normal launch and
records `ttsSetupId` in the user profile. Later choices, including disabling
speech, are preserved. Mute and other preferences are preserved. Preparing this
file does not change a running process's cached settings or restart Capri.

## Measurements and validation

The isolated persistent-worker check produced 10.4 seconds of speech in 6.97
seconds, with first PCM after 665 ms on a warm model. Reserved PyTorch GPU memory
after warmup and cache cleanup was 4,364 MiB (about 4.26 GiB). Full startup and
warmup took about 30 seconds including imports. These are sample measurements,
not guarantees, and exclude Codex response latency. Long idle periods require
another cold warmup.

The 0.6B cloning comparison started warm output after about 564 ms, versus 627 ms
for the 1.7B standalone comparison, and allocated less memory. The selected
initial integration favors the larger model for quality; listening judgments
and further tuning remain iterative.

The real worker check verifies streamed PCM before completion, process reuse,
cancellation with late-audio suppression, recovery after cancellation and idle
unloading. `scripts/check-qwen-renderer.js` checks actual Electron IPC, PCM
playback scheduling, nonzero amplitude, queue clearing and stale-result
suppression using a silent output gain and an isolated profile. It accepts
`CAPRI_VOICE_SETUP` for an explicit local setup file and never restarts the live
companion. Unit tests cover cancellation during warmup, permission changes,
worker exit, phrase ordering, Escape, and one-time local setup.

Voice quality is user judged: A was selected from three auditions. No claim is
made that a benchmark establishes ElevenLabs equivalence, emotional accuracy,
all-language quality, gaming performance or an installed-release certification.

Implementation was prepared on `codex/expressive-voice` in an isolated worktree,
starting from development and fast-forwarding the existing committed application
history. Current uncommitted source was copied in as the integration context;
only the voice changes are copied back after checking original file hashes.
Existing work and history are preserved. Nothing is pushed or released.

The full 332-test suite passed before the final broken-pipe regression was added;
the final focused voice tests pass as well. The isolated native settings smoke
check and Windows x64 directory package build (`--publish never`) pass. The
archive includes the worker and voice modules, and excludes local model/runtime
data. No installer installation or published release is claimed. The desktop
shortcut was checked and already targets this checkout's Electron executable,
absolute project argument, working directory and Capri icon correctly.
