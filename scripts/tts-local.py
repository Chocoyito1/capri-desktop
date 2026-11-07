"""One isolated synthesis job; Capri kills the process on interruption to release VRAM."""
import json
import os
import sys
from pathlib import Path

# Runtime never downloads weights or sends a reference off the computer.
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
request = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
reference = request.get('ttsReference', '')
if not Path(reference).is_file():
    raise RuntimeError('Configure a reviewed, authorized reference WAV first.')
engine = request['ttsEngine']
device = request.get('ttsDevice', 'cpu')
if engine == 'chatterbox':
    import soundfile as sf
    from chatterbox.tts import ChatterboxTTS
    model = ChatterboxTTS.from_pretrained(device=device)
    wav = model.generate(request['text'], audio_prompt_path=reference)
    sf.write(request['output'], wav.squeeze().detach().cpu().numpy(), model.sr)
elif engine == 'f5':
    if not request.get('ttsReferenceText', '').strip():
        raise RuntimeError('F5 requires the exact reference transcript.')
    from f5_tts.api import F5TTS
    model = F5TTS(device=device)
    model.infer(ref_file=reference, ref_text=request['ttsReferenceText'],
                gen_text=request['text'], file_wave=request['output'], seed=42)
else:
    raise RuntimeError('Unsupported local TTS engine.')
