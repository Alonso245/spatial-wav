"""Prepare the pinned source for cooperative, single-threaded browser execution.

Adapt thread scheduling, bound speaker spread and correct OAMD field parsing.
The original license continues to apply.
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
# JOC can describe size on three axes; Cavern reduces that vector to its
# length (up to sqrt(3)). The balance renderer uses size as a 0..1 blend,
# otherwise 1-size is negative and its equal-power sqrt produces NaN.
panner = root / 'Cavern/Rendering/BalanceBasedRenderer.cs'
text = panner.read_text(encoding='utf-8-sig')
marker = '// Spatial WAV: saturate object spread at the full-room mix.'
if marker not in text:
    anchor = '            // Find a bounding box'
    if text.count('source.Size') != 4 or text.count(anchor) != 1:
        raise RuntimeError('Unexpected balance renderer source; inspect the pinned dependency.')
    text = text.replace('source.Size', 'boundedSize')
    text = text.replace(anchor, '            ' + marker + '\n' +
        '            float boundedSize = Math.Clamp(source.Size, 0f, 1f);\n\n' + anchor)
    panner.write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = path.read_text(encoding='utf-8-sig')
    if new in text:
        return
    if text.count(old) != 1:
        raise RuntimeError(f'Unexpected pinned metadata parser source: {path}')
    path.write_text(text.replace(old, new), encoding='utf-8')


# oa_element_size is a byte count minus one, measured after its variable-length
# field. Using the bit cursor from before the size or omitting *8 seeks into the
# previous element and interprets padding/trim data as object metadata.
metadata = root / 'Cavern.Format/Decoders/EnhancedAC3'
replace_once(metadata / 'ObjectAudioElementMetadata.cs',
    '            int endPos = extractor.Position + ExtensibleMetadataExtensions.VariableBits(extractor, 4, 4) + 1;',
    '            int elementBytes = ExtensibleMetadataExtensions.VariableBits(extractor, 4, 4) + 1;\n'
    '            int endPos = checked(extractor.Position + elementBytes * 8);\n'
    '            if (endPos > extractor.BackPosition)\n'
    '                throw new System.IO.InvalidDataException("OAMD element exceeds the available payload.");')

# In obj_basic_info_bits bit 0 carries gain and bit 1 carries priority. Reversing
# them loses alignment whenever an update carries only one of those fields.
replace_once(metadata / 'ObjectInfoBlock.cs',
    '            // Gain\n            if ((blocks & 2) != 0)',
    '            // Gain (obj_basic_info_bits bit 0)\n            if ((blocks & 1) != 0)')
replace_once(metadata / 'ObjectInfoBlock.cs',
    '            // Priority - unneccessary, everything\'s rendered\n            if ((blocks & 1) != 0 && !extractor.ReadBit())',
    '            // Priority (obj_basic_info_bits bit 1)\n            if ((blocks & 2) != 0 && !extractor.ReadBit())')

# Return free boxes like other unknown boxes. Recursing to the following box
# can cross a parent boundary or read beyond EOF. FileStream tolerated the
# resulting seek; MemoryStream (used by the browser) correctly rejected it.
replace_once(root / 'Cavern.Format/Container/MP4/Box.cs',
    '            if (header == freeBox) {\n'
    '                reader.Position = nextBox;\n'
    '                return Parse(reader);\n'
    '            }',
    '            // Spatial WAV: padding is a normal box; the enclosing loop owns EOF.')
print('Browser, object/OAMD and MP4 padding adapters prepared.')
