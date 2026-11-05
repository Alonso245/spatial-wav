using System.Buffers.Binary;
using AtmosWeb;

static class ExportRegression {
    static async Task<byte[]> Export(float[] input, ExportSettings settings, int chunk = 16384) {
        using var output = new MemoryStream();
        var exporter = new AudioExporter(input.Length / 16, settings, bytes => output.WriteAsync(bytes).AsTask(), 12345);
        for (int start = 0; start < input.Length / 16; start += chunk) {
            int frames = Math.Min(chunk, input.Length / 16 - start);
            await exporter.Append(input.AsSpan(start * 16, frames * 16).ToArray(), frames, default);
        }
        await exporter.Finish(default);
        return output.ToArray();
    }
    static float[] Tone(int frames, double frequency, double amplitude = .5) {
        var input = new float[frames * 16];
        for (int i = 0; i < frames; i++) input[i * 16] = (float)(amplitude * Math.Sin(2 * Math.PI * frequency * i / 48000));
        return input;
    }
    static double Rms(byte[] pcm, int rate) {
        double sum = 0; int count = pcm.Length / 64;
        for (int frame = 200; frame < count - 200; frame++) {
            float value = BinaryPrimitives.ReadSingleLittleEndian(pcm.AsSpan(frame * 64));
            sum += value * value;
        }
        return Math.Sqrt(sum / (count - 400));
    }
    public static async Task Run(Action<bool, string> check) {
        var signal = Tone(36017, 1000);
        foreach (int rate in new[] {44100,48000,96000}) foreach(int bits in new[] {16,32}) {
            var settings = new ExportSettings(bits,rate);
            long frames = settings.FramesFor(signal.Length / 16);
            var pcm = await Export(signal,settings);
            var header = Converter.WaveHeader(frames,settings);
            check(pcm.Length == frames * 16 * bits / 8 &&
                BinaryPrimitives.ReadInt32LittleEndian(header.AsSpan(24)) == rate &&
                BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(32)) == 16 * bits / 8 &&
                BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(34)) == bits &&
                BinaryPrimitives.ReadInt32LittleEndian(header.AsSpan(44)) == (bits == 16 ? 1 : 3) &&
                BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(76)) == pcm.Length,
                $"{bits}-bit/{rate}: header, subtype, interleaving and exact duration");
            check(pcm.SequenceEqual(await Export(signal,settings,337)), $"{bits}-bit/{rate}: chunk boundaries and ring wrap preserve samples");
            if(bits == 32) {
                check(Math.Abs(Rms(pcm,rate) - .5 / Math.Sqrt(2)) < .001, $"{rate}: 1 kHz passband amplitude preserved");
                bool isolated = true;
                for(int frame=0;frame<frames;frame++) for(int channel=1;channel<16;channel++)
                    isolated &= BinaryPrimitives.ReadSingleLittleEndian(pcm.AsSpan((frame*16+channel)*4)) == 0;
                check(isolated,$"{rate}: no cross-channel mixing");
            }
        }
        foreach (int rate in new[] {44100,96000}) {
            var impulse = new float[4800 * 16]; impulse[2400 * 16 + 15] = .5f;
            var pcm = await Export(impulse,new(32,rate));
            float impulsePeak = 0; int peakFrame = -1;
            for (int frame = 0; frame < pcm.Length / 64; frame++) {
                float value = Math.Abs(BinaryPrimitives.ReadSingleLittleEndian(pcm.AsSpan(frame * 64 + 60)));
                if (value > impulsePeak) { impulsePeak = value; peakFrame = frame; }
            }
            check(peakFrame == rate / 20, $"{rate}: impulse timing has no added delay");
        }
        var original = new byte[signal.Length * 4]; Buffer.BlockCopy(signal,0,original,0,original.Length);
        check(original.SequenceEqual(await Export(signal,new())), "default export preserves every original float bit");
        var silence = await Export(new float[48000 * 16],new(16,48000));
        double sum = 0, square = 0; int peak = 0;
        for(int i=0;i<silence.Length;i+=2) { int sample=BinaryPrimitives.ReadInt16LittleEndian(silence.AsSpan(i));sum+=sample;square+=sample*sample;peak=Math.Max(peak,Math.Abs(sample)); }
        double count=silence.Length/2;
        check(peak==1 && Math.Abs(sum/count)<.005 && square/count is >.23 and <.27, "16-bit TPDF dither: bounded, unbiased quantization noise");
        var alias = await Export(Tone(48000,23000),new(32,44100));
        check(Rms(alias,44100) < .0001, "44.1 kHz anti-alias filter rejects 23 kHz tone by over 70 dB");
        foreach(float value in new[]{1.01f,-1.01f,float.NaN,float.PositiveInfinity}) {
            try { await Export(Enumerable.Repeat(value,16).ToArray(),new(16)); throw new Exception("invalid sample accepted"); }
            catch(ConversionException e) { check(e.Code==(float.IsFinite(value)?"integerRange":"invalidPcm"), "unsafe samples rejected without silent clipping"); }
        }
        await Export(Enumerable.Repeat(1f,16).Concat(Enumerable.Repeat(-1f,16)).ToArray(),new(16));
        check(true,"16-bit full-scale endpoints are valid");
        try { new ExportSettings(24).Validate(); throw new Exception("invalid format accepted"); }
        catch(ConversionException e) { check(e.Code=="outputSettings","unsupported export settings rejected"); }
        try { Converter.WaveHeader(long.MaxValue,new(16,96000)); throw new Exception("overflow accepted"); }
        catch(ConversionException e) { check(e.Code=="riffLimit","export arithmetic overflow rejected"); }
        var cancelled = new CancellationToken(true);
        try { await new AudioExporter(1,new(),_=>Task.CompletedTask).Append(new float[16],1,cancelled); throw new Exception("cancel ignored"); }
        catch(OperationCanceledException) { check(true,"export cancellation honored"); }
    }
}
