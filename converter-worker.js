import './cooperate.js';

let runtimePromise, engine, current;
function stage(name, fraction = 0) {
  if (current) self.postMessage({ type: 'progress', id: current.id, stage: name, fraction });
}
async function loadEngine() {
  if (!runtimePromise) runtimePromise = (async () => {
    const { dotnet } = await import('./_framework/dotnet.js');
    const runtime = await dotnet.withConfigSrc(new URL('./_framework/blazor.boot.json', import.meta.url).href).create();
    runtime.setModuleImports('spatialWorker', {
      write(bytes) {
        const buffer = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
        if (!current?.writer) throw new Error('No worker output.');
        const count = current.writer.write(buffer, { at: current.position });
        if (count !== buffer.length) throw new Error('Incomplete audio write.');
        current.position += count;
      },
      progress(value) {
        if (!current) return;
        // UI notifications are one-way. Hidden-page rendering never holds up audio writes.
        if (value === 1 || value - current.lastProgress >= .005) {
          current.lastProgress = value; stage('rendering', value);
        }
      },
      cooperate: () => spatialCooperate()
    });
    const exports = await runtime.getAssemblyExports('AtmosWeb');
    engine = exports.AtmosWeb?.WorkerEngine;
    if (typeof engine?.Convert !== 'function') throw new Error('Worker exports are unavailable.');
    return engine;
  })();
  return runtimePromise;
}
self.onmessage = event => {
  const message = event.data;
  if (message.type === 'cancel') {
    if (current && current.id === message.id) { current.cancelled = true; engine?.Cancel(); }
  } else if (message.type === 'convert') void convert(message);
};
async function convert(message) {
  if (current) { self.postMessage({ type: 'result', id: message.id, code: 'workerError' }); return; }
  const job = current = { id: message.id, position: 0, lastProgress: -1, cancelled: false, writer: null };
  let code = 'workerError';
  try {
    stage('startingWorker');
    const engine = await loadEngine();
    if (job.cancelled) { code = 'cancelled'; return; }
    if (!(message.file instanceof Blob) || message.file.size > 128 * 1024 * 1024) { code = 'size'; return; }
    stage('reading');
    const bytes = new Uint8Array(await message.file.arrayBuffer());
    if (job.cancelled) { code = 'cancelled'; return; }
    const root = await navigator.storage.getDirectory();
    const output = await root.getFileHandle(message.entry, { create: true });
    job.writer = await output.createSyncAccessHandle();
    stage('rendering');
    code = await engine.Convert(bytes, message.bitDepth, message.sampleRate);
    if (job.cancelled) code = 'cancelled';
    if (!code) { stage('finalizing', 1); job.writer.flush(); }
  } catch (error) {
    console.log(error);
    code = job.cancelled ? 'cancelled' : job.writer || error?.name === 'QuotaExceededError' ? 'storageError' : 'workerError';
  } finally {
    try { job.writer?.close(); } catch { if (!code) code = 'storageError'; }
    current = null;
    self.postMessage({ type: 'result', id: message.id, code });
  }
}
