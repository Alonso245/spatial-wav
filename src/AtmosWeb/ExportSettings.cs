namespace AtmosWeb;

public sealed record ExportSettings(int BitDepth = 32, int SampleRate = 48000) {
    public void Validate() {
        if (BitDepth is not (16 or 32) || SampleRate is not (44100 or 48000 or 96000))
            throw new ConversionException("outputSettings");
    }

    public long FramesFor(long inputFrames) {
        Validate();
        try {
            if (inputFrames <= 0) throw new ConversionException("riffLimit");
            return checked((inputFrames * SampleRate + Converter.SampleRate / 2) / Converter.SampleRate);
        } catch (OverflowException) { throw new ConversionException("riffLimit"); }
    }
}
