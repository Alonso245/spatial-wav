using System.Text;
using Cavern;
using Cavern.Channels;
using Cavern.Format;
using Cavern.Format.Renderers;
using Cavern.Utilities;

namespace AtmosWeb;

public static class Converter {
    public const int Channels = 16;
    public const int SampleRate = 48000;
    public const int HeaderBytes = 80;
    public static readonly string[] ChannelOrder =
        ["L", "R", "C", "LFE", "Lrs", "Rrs", "Ls", "Rs", "Lw", "Rw", "Ltf", "Rtf", "Ltm", "Rtm", "Ltr", "Rtr"];

    public static byte[] WaveHeader(long frames, ExportSettings? settings = null) {
        settings ??= new(); settings.Validate();
        long size;
        try { size = checked(frames * Channels * (settings.BitDepth / 8)); }
        catch (OverflowException) { throw new ConversionException("riffLimit"); }
        if (frames <= 0 || size > uint.MaxValue - HeaderBytes)
            throw new ConversionException("riffLimit");
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream, Encoding.ASCII, true);
        void Text(string text) => writer.Write(Encoding.ASCII.GetBytes(text));
        Text("RIFF"); writer.Write((uint)(size + HeaderBytes - 8)); Text("WAVE");
        Text("fmt "); writer.Write(40u);
        writer.Write((ushort)0xfffe); writer.Write((ushort)Channels);
        writer.Write(settings.SampleRate); writer.Write(settings.SampleRate * Channels * (settings.BitDepth / 8));
        writer.Write((ushort)(Channels * (settings.BitDepth / 8))); writer.Write((ushort)settings.BitDepth);
        writer.Write((ushort)22); writer.Write((ushort)settings.BitDepth);
        writer.Write(0u); // WAVE has no standard mask for this layout; see companion JSON.
        writer.Write(new Guid(settings.BitDepth == 32 ? "00000003-0000-0010-8000-00aa00389b71" : "00000001-0000-0010-8000-00aa00389b71").ToByteArray());
        Text("fact"); writer.Write(4u); writer.Write((uint)frames);
        Text("data"); writer.Write((uint)size);
        return stream.ToArray();
    }

    public static async Task Render(Stream input, Func<byte[], Task> write,
        Action<double> progress, CancellationToken cancellation, ExportSettings? settings = null) {
        settings ??= new(); settings.Validate();
        CavernAmp.Bypass = true; // No native DLLs on the browser.
        using var reader = AudioReader.Open(input);
        if (reader is not EnhancedAC3Reader && reader is not AudioTrackReader)
            throw new ConversionException("missingJoc");
        var renderer = reader.GetRenderer();
        if (renderer is not EnhancedAC3Renderer eac3 || !eac3.Enhanced || !eac3.HasObjects) {
            // Upstream EnhancedAC3Renderer.Dispose dereferences a null JOC applier
            // for non-object tracks. Its remaining allocations are managed; the
            // input reader is still disposed by the outer using statement.
            if (renderer is not EnhancedAC3Renderer) renderer.Dispose();
            throw new ConversionException("missingJoc");
        }
        using var ownedRenderer = renderer;
        if (reader.SampleRate != SampleRate)
            throw new ConversionException("sampleRate");
        byte[] header = WaveHeader(settings.FramesFor(reader.Length), settings);
        var exporter = new AudioExporter(reader.Length, settings, write);
        var listener = new Listener(false) {
            SampleRate = SampleRate, UpdateRate = 64, AudioQuality = QualityModes.Perfect,
            Normalizer = 0, Volume = 1, LFESeparation = true, DirectLFE = true
        };
        Listener.HeadphoneVirtualizer = false;
        Listener.ReplaceChannels(ChannelPrototype.ref916.Select(channel =>
            new Channel(ChannelPrototype.AlternativePositions[(int)channel], channel == ReferenceChannel.ScreenLFE)).ToArray());
        listener.AttachSources(renderer.Objects);
        try {
            await write(header);
            // Bound output buffering to ~1 MiB; OPFS holds the full WAV, outside WASM memory.
            var samples = new float[Channels * 16384];
            int used = 0;
            long rendered = 0;
            while (rendered < reader.Length) {
                cancellation.ThrowIfCancellationRequested();
                var block = listener.Render();
                int frames = (int)Math.Min(listener.UpdateRate, reader.Length - rendered);
                for (int i = 0; i < frames * Channels; i++)
                    if (!float.IsFinite(block[i]))
                        throw new ConversionException("invalidPcm");
                Array.Copy(block, 0, samples, used * Channels, frames * Channels);
                used += frames;
                rendered += frames;
                if (used == 16384 || rendered == reader.Length) {
                    await exporter.Append(samples, used, cancellation);
                    progress((double)rendered / reader.Length);
                    used = 0;
                    await Task.Delay(1, cancellation); // Let the browser paint and receive Cancel.
                }
            }
            await exporter.Finish(cancellation);
        } finally {
            listener.DetachAllSources();
        }
    }
}
