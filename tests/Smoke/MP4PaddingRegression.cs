using System.Buffers.Binary;
using System.Reflection;
using System.Text;
using Cavern.Format;

static class MP4PaddingRegression {
    public static void Run(Action<bool, string> check) {
        var boxType = typeof(AudioReader).Assembly.GetType("Cavern.Format.Container.MP4.Box")!;
        var parse = boxType.GetMethod("Parse", BindingFlags.Static | BindingFlags.Public,
            new[] { typeof(Stream) })!;
        byte[] Box(string type, byte[] payload) {
            var data = new byte[8 + payload.Length];
            BinaryPrimitives.WriteUInt32BigEndian(data, (uint)data.Length);
            Encoding.ASCII.GetBytes(type).CopyTo(data, 4);
            payload.CopyTo(data, 8);
            return data;
        }
        uint TypeOf(object value) => (uint)boxType.GetProperty("Header")!.GetValue(value)!;
        const uint Free = 0x66726565, Skip = 0x736b6970;
        using (var input = new MemoryStream(Box("free", new byte[59]))) {
            var result = parse.Invoke(null, new object[] { input })!;
            check(TypeOf(result) == Free && input.Position == input.Length,
                "trailing MP4 padding ends at EOF on a browser-style MemoryStream");
        }
        var suffix = Box("skip", new byte[4]);
        using (var input = new MemoryStream(Box("free", Array.Empty<byte>()).Concat(suffix).ToArray())) {
            var result = parse.Invoke(null, new object[] { input })!;
            check(TypeOf(result) == Free && input.Position == 8,
                "MP4 padding does not recursively consume the following box");
            result = parse.Invoke(null, new object[] { input })!;
            check(TypeOf(result) == Skip && input.Position == input.Length,
                "a box following MP4 padding is still parsed normally");
        }
        var parent = Box("moov", Box("free", Array.Empty<byte>()));
        using (var input = new MemoryStream(parent.Concat(suffix).ToArray())) {
            var result = parse.Invoke(null, new object[] { input })!;
            var contents = (Array)result.GetType().GetProperty("Contents")!.GetValue(result)!;
            check(input.Position == parent.Length && contents.Length == 1 && TypeOf(contents.GetValue(0)!) == Free,
                "nested MP4 padding cannot absorb a box outside its parent");
        }
    }
}
