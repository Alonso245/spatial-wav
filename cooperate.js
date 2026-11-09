// A macrotask boundary that does not depend on timers or animation frames.
(() => {
  let channel;
  const pending = [];
  globalThis.spatialCooperate = () => new Promise(resolve => {
    if (!channel) {
      channel = new MessageChannel();
      channel.port1.onmessage = () => pending.shift()?.();
    }
    pending.push(resolve); channel.port2.postMessage(0);
  });
})();
