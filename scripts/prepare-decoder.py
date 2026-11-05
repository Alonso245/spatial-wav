"""Prepare the pinned source for cooperative, single-threaded browser execution.

Only thread scheduling is adapted. The decoder and renderer math are unchanged.
The original license continues to apply. Never use this adapter for native builds.
"""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / '.deps/Cavern'
files = [root / 'Cavern.Format/Decoders/EnhancedAC3' / name for name in (
    'JointObjectCodingApplier.cs', 'JointObjectCodingDecoder.cs')]
files.append(root / 'Cavern/Utilities/Threading/Parallelizer.cs')
for path in files:
    text = path.read_text(encoding='utf-8-sig')
    alias = 'using ThreadPool = AtmosBrowser.InlineThreadPool;\n'
    if not text.startswith(alias):
        if 'ThreadPool.QueueUserWorkItem' not in text:
            raise RuntimeError(f'Unexpected decoder source: {path}')
        path.write_text(alias + text, encoding='utf-8')
adapter = '''using System.Threading;
namespace AtmosBrowser {
    internal static class InlineThreadPool {
        public static bool QueueUserWorkItem(WaitCallback callback, object state) {
            callback(state);
            return true;
        }
    }
}
'''
for project in ('Cavern', 'Cavern.Format'):
    path = root / project / 'AtmosBrowserThreadPool.cs'
    if not path.exists() or path.read_text() != adapter:
        path.write_text(adapter)
print('Browser scheduling adapter prepared.')
