(() => {
  let root, activeId, picker, archive, archiveCancelled = false;
  const outputs = new Map(), files = new Map(), urls = new Map();
  const prefix = 'spatial-output-';

  function releaseUrl(key) {
    if (urls.has(key)) { URL.revokeObjectURL(urls.get(key)); urls.delete(key); }
  }
  async function discardArchive() {
    releaseUrl('archive');
    if (archive?.writable) { try { await archive.writable.abort(); } catch {} }
    if (archive?.entry && root) { try { await root.removeEntry(archive.entry); } catch {} }
    archive = null;
  }
  function layoutBlob(channels, sampleRate, bitDepth) {
    return new Blob([JSON.stringify({
      layout: '9.1.6 with top middle/side pair', sampleRate,
      format: bitDepth === 16 ? 'PCM signed 16-bit LE' : 'IEEE Float32 LE',
      bitDepth, dither: bitDepth === 16 ? 'TPDF' : null, wavChannelMask: 0,
      channels: channels.map((name, index) => ({ channel: index + 1, name })), renderer: 'Cavern'
    }, null, 2)], { type: 'application/json' });
  }
  async function discard(id) {
    if (id == null) { archiveCancelled = true; await discardArchive(); }
    else if (archive) await discardArchive();
    const ids = id == null ? [...outputs.keys()] : [id];
    for (const key of ids) {
      const output = outputs.get(key);
      releaseUrl(key); releaseUrl('layout:' + key);
      if (output?.writable) { try { await output.writable.abort(); } catch {} }
      if (output?.entry && root) { try { await root.removeEntry(output.entry); } catch {} }
      outputs.delete(key);
      if (activeId === key) activeId = undefined;
    }
    if (id == null) { for (const key of [...urls.keys()]) releaseUrl(key); }
  }
  function download(blob, name, key) {
    // Keep URLs for other results alive while their downloads may still be running.
    if (!urls.has(key)) urls.set(key, URL.createObjectURL(blob));
    const a = document.createElement('a'); a.href = urls.get(key); a.download = name;
    document.body.append(a); a.click(); a.remove();
  }
  function input() { return document.getElementById('audio-file'); }
  async function addFiles(list) {
    if (!picker || !input() || input().disabled) return;
    const selected = Array.from(list).map(file => {
      const id = crypto.randomUUID(); files.set(id, file);
      return { id, name: file.name, size: file.size };
    });
    if (!selected.length) return;
    // Clear the native picker without releasing the registered File objects.
    input().value = '';
    try { await picker.invokeMethodAsync('ReceiveFiles', selected); }
    catch (error) { selected.forEach(file => files.delete(file.id)); console.error(error); }
  }
  const isFileDrag = event => Array.from(event.dataTransfer?.types || []).includes('Files');
  document.addEventListener('change', event => {
    if (event.target.id === 'audio-file') void addFiles(event.target.files);
  });
  for (const name of ['dragenter', 'dragover']) document.addEventListener(name, event => {
    if (!isFileDrag(event)) return;
    event.preventDefault(); // Prevent navigating away from existing results.
    const zone = event.target.closest?.('.drop, .panel');
    if (zone && input() && !input().disabled) {
      event.dataTransfer.dropEffect = 'copy'; zone.dataset.dragging = 'true';
    } else event.dataTransfer.dropEffect = 'none';
  });
  document.addEventListener('dragleave', event => {
    const zone = event.target.closest?.('.drop, .panel');
    if (zone && !zone.contains(event.relatedTarget)) delete zone.dataset.dragging;
  });
  document.addEventListener('drop', event => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    const zone = event.target.closest?.('.drop, .panel');
    document.querySelectorAll('[data-dragging]').forEach(el => delete el.dataset.dragging);
    if (zone) void addFiles(event.dataTransfer.files);
  });
  document.addEventListener('dragend', () => document.querySelectorAll('[data-dragging]').forEach(el => delete el.dataset.dragging));
  window.spatial = {
    attachPicker(bridge) { picker = bridge; },
    pickFiles() { if (input() && !input().disabled) input().click(); },
    openFile(id) {
      if (!files.has(id)) throw new Error('Source file is no longer available.');
      // The Blazor IJSStreamReference result type wraps the File automatically.
      return files.get(id);
    },
    releaseFile(id) { files.delete(id); },
    clearFiles() { files.clear(); if (input()) input().value = ''; },
    async supported() {
      if (!isSecureContext || !navigator.storage?.getDirectory) return false;
      try {
        root = await navigator.storage.getDirectory();
        const test = 'spatial-test-' + crypto.randomUUID();
        const file = await root.getFileHandle(test, { create: true });
        const stream = await file.createWritable(); await stream.close();
        await root.removeEntry(test);
        return true;
      } catch { return false; }
    },
    async begin(id = 'default') {
      // Replacing a failed attempt must not delete earlier completed outputs.
      await discard(id);
      if (activeId !== undefined) throw new Error('A conversion is already in progress.');
      root = await navigator.storage.getDirectory();
      const output = { entry: prefix + crypto.randomUUID() };
      outputs.set(id, output); activeId = id;
      output.handle = await root.getFileHandle(output.entry, { create: true });
      output.writable = await output.handle.createWritable();
    },
    async write(bytes) {
      const output = outputs.get(activeId);
      if (!output?.writable) throw new Error('No hay archivo de salida abierto.');
      try { await output.writable.write(bytes); }
      catch (error) { throw new Error('No se pudo guardar la salida local. Comprueba el espacio disponible: ' + error.message); }
    },
    async finish() {
      const output = outputs.get(activeId);
      if (!output?.writable) throw new Error('No hay archivo de salida abierto.');
      await output.writable.close(); output.writable = null; activeId = undefined;
    },
    discard,
    async download(name, id) {
      // The fallback preserves the single-file helper's existing call shape.
      if (id == null && outputs.size === 1) id = outputs.keys().next().value;
      const output = outputs.get(id);
      if (!output?.handle || output.writable) throw new Error('La salida no está terminada.');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      download(await output.handle.getFile(), name, id);
    },
    layout(name, channels, sampleRate = 48000, bitDepth = 32, id = 'default') {
      download(layoutBlob(channels, sampleRate, bitDepth), name.replace(/\.wav$/i, '.channels.json'), 'layout:' + id);
    },
    cancelArchive() { archiveCancelled = true; },
    async downloadAll(jobs, channels) {
      archiveCancelled = false;
      const key = JSON.stringify(jobs);
      if (archive?.key === key && !archive.writable) {
        const blob = await archive.handle.getFile();
        if (archiveCancelled) return false;
        download(blob, 'spatial-wav_9.1.6.zip', 'archive'); return true;
      }
      await discardArchive();
      try {
        const entries = [];
        for (let index = 0; index < jobs.length; index++) {
          const job = jobs[index], output = outputs.get(job.id);
          if (!output?.handle || output.writable) throw new Error('A WAV is not ready.');
          // Prefixes distinguish identical names, including on case-insensitive disks.
          const safe = job.name.normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_').replace(/^\.+/, '_');
          const name = String(index + 1).padStart(2, '0') + '_' + safe;
          entries.push({ name, data: await output.handle.getFile() });
          entries.push({ name: name.replace(/\.wav$/i, '.channels.json'), data: layoutBlob(channels, job.sampleRate, job.bitDepth) });
        }
        if (!entries.length) throw new Error('No completed WAVs.');
        root = await navigator.storage.getDirectory();
        archive = { key, entry: 'spatial-archive-' + crypto.randomUUID() };
        archive.handle = await root.getFileHandle(archive.entry, { create: true });
        archive.writable = await archive.handle.createWritable();
        await spatialZip.build(entries, archive.writable, {
          cancelled: () => archiveCancelled,
          progress: fraction => picker.invokeMethodAsync('ArchiveProgress', fraction)
        });
        if (archiveCancelled) throw new DOMException('ZIP generation cancelled.', 'AbortError');
        await archive.writable.close(); archive.writable = null;
        const blob = await archive.handle.getFile();
        if (archiveCancelled) throw new DOMException('ZIP generation cancelled.', 'AbortError');
        download(blob, 'spatial-wav_9.1.6.zip', 'archive'); return true;
      } catch (error) {
        await discardArchive();
        if (archiveCancelled || error.name === 'AbortError') return false;
        throw error;
      }
    }
  };
  addEventListener('pagehide', () => { files.clear(); void discard(); });
})();
