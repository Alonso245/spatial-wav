using System.Numerics;
using Cavern;
using Cavern.Channels;
using Cavern.Rendering;

static class PannerRegression {
    public static void Run(Action<bool, string> check) {
        var listener = new Listener(false) { LFESeparation = true };
        Listener.HeadphoneVirtualizer = false;
        Listener.ReplaceChannels(ChannelPrototype.ref916.Select(c => new Channel(
            ChannelPrototype.AlternativePositions[(int)c], c == ReferenceChannel.ScreenLFE)).ToArray());
        var renderer = new BalanceBasedRenderer();
        var input = new float[] { 1, -.5f, .25f, 0 };
        float[] Render(float size) {
            var source = new Source { Size = size };
            var result = new float[input.Length * 16];
            renderer.Render(listener, source, Vector3.Zero, input, result, .707f);
            check(source.Size == size, $"panning preserves object metadata (size {size})");
            return result;
        }
        foreach (float size in new[] { 0f, .5f, 1f, 1.0654931f, MathF.Sqrt(3) }) {
            var output = Render(size);
            check(output.All(float.IsFinite) && output.Any(x => x != 0), $"finite non-silent speaker output (size {size})");
            if (size > 1) check(output.SequenceEqual(Render(1)), "oversized objects saturate to the full-room spread");
        }
        var invalid = new float[input.Length * 16];
        renderer.Render(listener, new Source { Size = float.NaN }, Vector3.Zero, input, invalid, .707f);
        check(invalid.Any(x => !float.IsFinite(x)), "invalid metadata is not silently replaced with valid audio");
    }
}
