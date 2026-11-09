// Streaming ZIP STORE with ZIP64 headers. Audio bytes are copied unchanged.
// No full-file ArrayBuffer, compression worker, or third-party dependency.
(() => {
  const encoder = new TextEncoder();
  const table = Uint32Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  function record(length, fill) {
    const bytes = new Uint8Array(length), view = new DataView(bytes.buffer);
    fill(view); return bytes;
  }
  const u16 = (v, offset, value) => v.setUint16(offset, value, true);
  const u32 = (v, offset, value) => v.setUint32(offset, value, true);
  const u64 = (v, offset, value) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('ZIP size is out of range.');
    v.setBigUint64(offset, BigInt(value), true);
  };
  const abort = () => new DOMException('ZIP generation cancelled.', 'AbortError');
  window.spatialZip = {
    async build(entries, destination, { progress = async () => {}, cancelled = () => false } = {}) {
      let offset = 0, processed = 0, reported = 0;
      const total = entries.reduce((sum, entry) => sum + entry.data.size, 0);
      const directory = [];
      const date = new Date();
      const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
      const dosDate = ((Math.max(1980, Math.min(2107, date.getFullYear())) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
      async function write(bytes) {
        if (cancelled()) throw abort();
        await destination.write(bytes); offset += bytes.length;
      }
      await progress(0);
      for (const entry of entries) {
        const name = encoder.encode(entry.name);
        if (!name.length || name.length > 65535 || !Number.isSafeInteger(entry.data.size)) throw new Error('Invalid ZIP entry.');
        const start = offset, size = entry.data.size;
        await write(record(30, v => {
          u32(v, 0, 0x04034b50); u16(v, 4, 45); u16(v, 6, 0x0808);
          u16(v, 10, dosTime); u16(v, 12, dosDate);
          u32(v, 18, 0xffffffff); u32(v, 22, 0xffffffff); u16(v, 26, name.length); u16(v, 28, 20);
        }));
        await write(name);
        await write(record(20, v => { u16(v, 0, 1); u16(v, 2, 16); u64(v, 4, size); u64(v, 12, size); }));
        let crc = 0xffffffff, copied = 0;
        const reader = entry.data.stream().getReader();
        try {
          while (true) {
            if (cancelled()) throw abort();
            const { done, value } = await reader.read();
            if (done) break;
            for (let i = 0; i < value.length; i++) crc = table[(crc ^ value[i]) & 255] ^ (crc >>> 8);
            await write(value); copied += value.length; processed += value.length;
            if (processed - reported >= 4 * 1024 * 1024) {
              reported = processed; await progress(total ? processed / total : 0);
              await spatialCooperate();
            }
          }
        } finally {
          try { await reader.cancel(); } catch {}
          reader.releaseLock();
        }
        if (copied !== size) throw new Error('ZIP source size changed.');
        crc = (~crc) >>> 0;
        await write(record(24, v => { u32(v, 0, 0x08074b50); u32(v, 4, crc); u64(v, 8, size); u64(v, 16, size); }));
        directory.push({ name, start, size, crc });
      }
      const directoryStart = offset;
      for (const item of directory) {
        await write(record(46, v => {
          u32(v, 0, 0x02014b50); u16(v, 4, 45); u16(v, 6, 45); u16(v, 8, 0x0808);
          u16(v, 12, dosTime); u16(v, 14, dosDate); u32(v, 16, item.crc);
          u32(v, 20, 0xffffffff); u32(v, 24, 0xffffffff);
          u16(v, 28, item.name.length); u16(v, 30, 28); u32(v, 42, 0xffffffff);
        }));
        await write(item.name);
        await write(record(28, v => { u16(v, 0, 1); u16(v, 2, 24); u64(v, 4, item.size); u64(v, 12, item.size); u64(v, 20, item.start); }));
      }
      const directorySize = offset - directoryStart, endOffset = offset;
      await write(record(56, v => {
        u32(v, 0, 0x06064b50); u64(v, 4, 44); u16(v, 12, 45); u16(v, 14, 45);
        u64(v, 24, directory.length); u64(v, 32, directory.length); u64(v, 40, directorySize); u64(v, 48, directoryStart);
      }));
      await write(record(20, v => { u32(v, 0, 0x07064b50); u64(v, 8, endOffset); u32(v, 16, 1); }));
      await write(record(22, v => { u32(v, 0, 0x06054b50); u16(v, 8, 0xffff); u16(v, 10, 0xffff); u32(v, 12, 0xffffffff); u32(v, 16, 0xffffffff); }));
      await progress(1);
      return offset;
    }
  };
})();
