(() => {
  let root, handle, writable, entry, url;
  const prefix = 'spatial-output-';
  async function discard() {
    if (url) { URL.revokeObjectURL(url); url = null; }
    if (writable) { try { await writable.abort(); } catch {} writable = null; }
    if (entry && root) { try { await root.removeEntry(entry); } catch {} }
    handle = null; entry = null;
  }
  function download(blob, name) {
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
  }
  window.spatial = {
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
    async begin() {
      await discard();
      root = await navigator.storage.getDirectory();
      entry = prefix + crypto.randomUUID();
      handle = await root.getFileHandle(entry, { create: true });
      writable = await handle.createWritable();
    },
    async write(bytes) {
      if (!writable) throw new Error('No hay archivo de salida abierto.');
      try { await writable.write(bytes); }
      catch (error) { throw new Error('No se pudo guardar la salida local. Comprueba el espacio disponible: ' + error.message); }
    },
    async finish() { await writable.close(); writable = null; },
    discard,
    async download(name) {
      if (!handle || writable) throw new Error('La salida no está terminada.');
      // Let the browser paint the preparation indicator before handling the file.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      download(await handle.getFile(), name);
    },
    layout(name, channels) {
      download(new Blob([JSON.stringify({
        layout: '9.1.6 with top middle/side pair', sampleRate: 48000,
        format: 'IEEE Float32 LE', wavChannelMask: 0,
        channels: channels.map((name, index) => ({ channel: index + 1, name })),
        renderer: 'Cavern'
      }, null, 2)], { type: 'application/json' }), name.replace(/\.wav$/i, '.channels.json'));
    }
  };
  // Normal tab close cleanup is best effort. On crash, site storage can retain the temp file.
  addEventListener('pagehide', () => { void discard(); });
})();
