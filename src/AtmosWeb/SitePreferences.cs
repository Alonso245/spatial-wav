namespace AtmosWeb;

public sealed class NoticeState {
    public bool Supported { get; set; }
    public bool Enabled { get; set; }
    public bool Requesting { get; set; }
    public string Permission { get; set; } = "unsupported";
    public string Problem { get; set; } = "";
}

public sealed class SitePreferences {
    public int BitDepth { get; set; } = 32;
    public int SampleRate { get; set; } = 48000;
    public bool Persistent { get; set; } = true;
    public NoticeState Notice { get; set; } = new();
}

public static class FileSize {
    public static string Display(long bytes) {
        string[] units = ["B", "KiB", "MiB", "GiB", "TiB"];
        double size = Math.Max(0, bytes); int unit = 0;
        while (size >= 1024 && unit < units.Length - 1) { size /= 1024; unit++; }
        return $"{size:0.##} {units[unit]}";
    }
}
