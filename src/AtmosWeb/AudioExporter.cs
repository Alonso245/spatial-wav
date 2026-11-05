using System.Buffers.Binary;

namespace AtmosWeb;

/// <summary>Streaming PCM writer with channel-aligned, rational windowed-sinc SRC.</summary>
public sealed class AudioExporter {
    const int Channels = Converter.Channels, Half = 48, Taps = Half * 2, Capacity = 32768;
    readonly ExportSettings settings;
    readonly Func<byte[], Task> write;
    readonly long sourceFrames, targetFrames;
    readonly float[]? ring;
    readonly double[][]? coefficients;
    readonly int gcd;
    readonly byte[] bytes = new byte[1024 * 1024];
    long received, emitted;
    int used;
    uint random;

    public AudioExporter(long sourceFrames, ExportSettings settings, Func<byte[], Task> write, uint? seed = null) {
        settings.Validate();
        this.settings = settings; this.write = write; this.sourceFrames = sourceFrames;
        targetFrames = settings.FramesFor(sourceFrames);
        random = seed ?? (uint)Random.Shared.Next(1, int.MaxValue);
        if (random == 0) random = 1;
        if (settings.SampleRate == Converter.SampleRate) return;
        ring = new float[Capacity * Channels];
        gcd = Gcd(Converter.SampleRate, settings.SampleRate);
        int phases = settings.SampleRate / gcd;
        coefficients = new double[phases][];
        double cutoff = .94 * Math.Min(1, settings.SampleRate / (double)Converter.SampleRate);
        for (int phase = 0; phase < phases; phase++) {
            var kernel = coefficients[phase] = new double[Taps];
            double fraction = phase / (double)phases, sum = 0;
            for (int tap = 0; tap < Taps; tap++) {
                double x = tap - Half + 1 - fraction;
                double window = Math.Abs(x) >= Half ? 0 : .42 + .5 * Math.Cos(Math.PI * x / Half) + .08 * Math.Cos(2 * Math.PI * x / Half);
                double sinc = Math.Abs(x) < 1e-12 ? cutoff : Math.Sin(Math.PI * cutoff * x) / (Math.PI * x);
                sum += kernel[tap] = sinc * window;
            }
            for (int tap = 0; tap < Taps; tap++) kernel[tap] /= sum;
        }
    }

    static int Gcd(int a, int b) { while (b != 0) (a, b) = (b, a % b); return a; }

    public async Task Append(float[] input, int frames, CancellationToken cancellation) {
        cancellation.ThrowIfCancellationRequested();
        if (frames < 0 || frames > 16384 || frames * Channels > input.Length || received + frames > sourceFrames)
            throw new InvalidDataException("Invalid audio export block.");
        for (int i = 0; i < frames * Channels; i++) if (!float.IsFinite(input[i])) throw new ConversionException("invalidPcm");
        if (ring is null) {
            if (settings.BitDepth == 32) {
                // Preserve the original 48 kHz float samples bit for bit.
                var direct = new byte[frames * Channels * 4];
                Buffer.BlockCopy(input, 0, direct, 0, direct.Length);
                await write(direct);
            } else {
                for (int i = 0; i < frames * Channels; i++) Encode(input[i]);
                await Flush();
            }
            received += frames; emitted += frames;
            return;
        }
        for (int frame = 0; frame < frames; frame++)
            Array.Copy(input, frame * Channels, ring, (int)((received + frame) % Capacity) * Channels, Channels);
        received += frames;
        await Drain(false, cancellation);
    }

    async Task Drain(bool final, CancellationToken cancellation) {
        while (emitted < targetFrames) {
            long scaled = emitted * Converter.SampleRate;
            long center = scaled / settings.SampleRate;
            if (!final && center + Half >= received) break;
            if ((emitted & 1023) == 0) cancellation.ThrowIfCancellationRequested();
            var kernel = coefficients![(int)((scaled % settings.SampleRate) / gcd)];
            for (int channel = 0; channel < Channels; channel++) {
                double sum = 0;
                for (int tap = 0; tap < Taps; tap++) {
                    long frame = center + tap - Half + 1;
                    if (frame >= 0 && frame < received)
                        sum += ring![(int)(frame % Capacity) * Channels + channel] * kernel[tap];
                }
                Encode((float)sum);
            }
            emitted++;
            if (used == bytes.Length) { await Flush(); await Task.Delay(1, cancellation); }
        }
    }

    float Uniform() {
        random ^= random << 13; random ^= random >> 17; random ^= random << 5;
        return (random >> 8) * (1f / 16777216);
    }

    void Encode(float value) {
        if (!float.IsFinite(value)) throw new ConversionException("invalidPcm");
        if (settings.BitDepth == 32) {
            BinaryPrimitives.WriteSingleLittleEndian(bytes.AsSpan(used, 4), value); used += 4;
        } else {
            // Reject actual overload rather than silently clipping the music.
            if (value < -1 || value > 1) throw new ConversionException("integerRange");
            double quantized = Math.Round(value * 32768d + Uniform() - Uniform(), MidpointRounding.ToEven);
            short sample = (short)Math.Clamp(quantized, short.MinValue, short.MaxValue);
            BinaryPrimitives.WriteInt16LittleEndian(bytes.AsSpan(used, 2), sample); used += 2;
        }
    }

    async Task Flush() {
        if (used == 0) return;
        await write(bytes[..used]); used = 0;
    }

    public async Task Finish(CancellationToken cancellation) {
        cancellation.ThrowIfCancellationRequested();
        if (received != sourceFrames) throw new InvalidDataException("Incomplete audio export.");
        if (ring is not null) await Drain(true, cancellation);
        await Flush();
        if (emitted != targetFrames) throw new InvalidDataException("Output frame count mismatch.");
    }
}
