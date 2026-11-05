using Cavern;
using Cavern.Format;

static class MetadataRegression {
    public static void Run(Action<bool, string> check) {
        var assembly = typeof(AudioReader).Assembly;
        var extractorType = assembly.GetType("Cavern.Format.Utilities.BitExtractor")!;
        object Bits(string bits) {
            var bytes = new byte[Math.Max(8, (bits.Length + 7) / 8)];
            for (int i = 0; i < bits.Length; i++) if (bits[i] == '1') bytes[i / 8] |= (byte)(1 << (7 - i % 8));
            return Activator.CreateInstance(extractorType, new object[] { bytes })!;
        }
        int Position(object reader) => (int)extractorType.GetProperty("Position")!.GetValue(reader)!;
        var elementType = assembly.GetType("Cavern.Format.Decoders.EnhancedAC3.OAElementMD")!;
        // Element 2, size code 6 => seven payload bytes after the 5-bit size field.
        var elementReader = Bits("0010" + "01100" + new string('0', 56));
        var element = Activator.CreateInstance(elementType, true)!;
        elementType.GetMethod("Read")!.Invoke(element, new[] { elementReader, false, 1, 0 });
        check(Position(elementReader) == 65, "OAMD element lengths use bytes and the post-size cursor");
        elementReader = Bits("0010" + "00011" + "00000" + new string('0', 33 * 8));
        element = Activator.CreateInstance(elementType, true)!;
        elementType.GetMethod("Read")!.Invoke(element, new[] { elementReader, false, 1, 0 });
        check(Position(elementReader) == 278, "multi-group OAMD size fields keep element boundaries aligned");
        try {
            elementReader = Bits("0010" + "11110"); // 16 payload bytes; buffer has only 8.
            element = Activator.CreateInstance(elementType, true)!;
            elementType.GetMethod("Read")!.Invoke(element, new[] { elementReader, false, 1, 0 });
            throw new Exception("Oversized metadata payload was accepted");
        } catch (System.Reflection.TargetInvocationException e) when (e.InnerException is InvalidDataException) {
            check(true, "OAMD element size cannot seek beyond the available payload");
        }

        var infoType = assembly.GetType("Cavern.Format.Decoders.EnhancedAC3.ObjectInfoBlock")!;
        // Active, differential basic update, gain only, explicit -1 dB gain, no table.
        var gainReader = Bits("0" + "11" + "01" + "10" + "001111" + "0");
        var info = Activator.CreateInstance(infoType, true)!;
        infoType.GetMethod("Update")!.Invoke(info, new[] { gainReader, 1, true });
        var source = new Source();
        infoType.GetMethod("UpdateSource")!.Invoke(info, new object[] { source });
        check(Position(gainReader) == 14, "gain-only OAMD update preserves bit alignment");
        check(Math.Abs(source.Volume - MathF.Pow(10, -1f / 20f) * .707f) < 1e-6,
            "gain-only OAMD update decodes the transmitted gain");
        var priorityReader = Bits("0" + "11" + "10" + "1" + "0");
        info = Activator.CreateInstance(infoType, true)!;
        infoType.GetMethod("Update")!.Invoke(info, new[] { priorityReader, 1, true });
        check(Position(priorityReader) == 7, "priority-only OAMD update preserves bit alignment");
    }
}
