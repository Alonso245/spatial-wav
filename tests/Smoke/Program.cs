using System.Buffers.Binary;
using AtmosWeb;

int passed = 0;
void Check(bool condition, string name) {
    if (!condition) throw new Exception("FAIL: " + name);
    Console.WriteLine("PASS: " + name); passed++;
}
var header = Converter.WaveHeader(48000);
Check(header.Length == 80, "WAVEFORMATEXTENSIBLE header with fact chunk");
Check(BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(22)) == 16, "16 output channels");
Check(BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(24)) == 48000, "48 kHz");
Check(BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(76)) == 48000 * 16 * 4, "exact PCM byte length");
Check(BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(40)) == 0, "explicitly unspecified speaker mask");
try { Converter.WaveHeader(70_000_000); throw new Exception("RIFF overflow accepted"); }
catch (InvalidOperationException) { Check(true, "RIFF overflow rejected"); }
var pcm = new MemoryStream();
pcm.Write(Converter.WaveHeader(64)); pcm.Write(new byte[64 * 16 * 4]); pcm.Position = 0;
try {
    await Converter.Render(pcm, _ => throw new Exception("PCM must not produce a JOC render"), _ => {}, CancellationToken.None);
    throw new Exception("PCM accepted as JOC");
} catch (ConversionException e) when (e.Code == "missingJoc") { Check(true, "ordinary PCM rejected as non-JOC"); }
int writes = 0;
try {
    await Converter.Render(new MemoryStream(new byte[256]), _ => { writes++; return Task.CompletedTask; }, _ => {}, CancellationToken.None);
    throw new Exception("Malformed input accepted");
} catch (Cavern.Format.Exceptions.UnsupportedFormatException) { Check(writes == 0, "malformed source rejected before output"); }
PannerRegression.Run(Check);
MetadataRegression.Run(Check);
MP4PaddingRegression.Run(Check);
if (args.Length > 0) {
    // Match the browser input path: FileStream permits out-of-range seeks that
    // MemoryStream rejects, so File.OpenRead alone missed container bugs.
    using var input = new MemoryStream(File.ReadAllBytes(args[0]));
    using var output = File.Create(args.Length > 1 ? args[1] : "/tmp/atmos-smoke.wav");
    double progress = 0;
    await Converter.Render(input, async bytes => await output.WriteAsync(bytes), p => progress = p, CancellationToken.None);
    Check(progress == 1, "full JOC render completed");
    Check(output.Length > 80, "nonempty multichannel PCM output");
    Console.WriteLine($"OUTPUT: {output.Length} bytes");
}
Console.WriteLine($"{passed} checks passed.");
