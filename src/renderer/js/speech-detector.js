// Silero runs locally on one WASM thread and shares the existing microphone.
let library;
function load(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = src;
    script.onload = resolve; script.onerror = () => reject(Error('Local speech detector could not load.'));
    document.head.append(script);
  });
}
export async function speechDetector({ stream, onStart, onEnd }) {
  const assets = new URL('../../../node_modules/@ricky0123/vad-web/dist/', import.meta.url).href;
  const wasm = new URL('../../../node_modules/onnxruntime-web/dist/', import.meta.url).href;
  library ||= (async () => {
    await load(wasm + 'ort.wasm.min.js'); await load(assets + 'bundle.min.js');
  })().catch(error => { library = null; throw error; });
  await library;
  return window.vad.MicVAD.new({
    model: 'v5', startOnLoad: false, baseAssetPath: assets, onnxWASMBasePath: wasm,
    ortConfig: ort => { ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.logLevel = 'error'; },
    getStream: async () => stream(), resumeStream: async () => stream(), pauseStream: async () => {},
    positiveSpeechThreshold: 0.5, negativeSpeechThreshold: 0.35,
    minSpeechMs: 128, redemptionMs: 650, preSpeechPadMs: 320,
    onSpeechRealStart: onStart, onSpeechEnd: onEnd,
  });
}
