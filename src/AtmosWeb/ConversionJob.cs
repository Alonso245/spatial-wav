namespace AtmosWeb;

public enum JobState { Pending, Reading, Rendering, Finalizing, Ready, Failed, Cancelled }

public sealed class SelectedAudio {
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public long Size { get; set; }
}

public sealed class ConversionJob(SelectedAudio file) {
    public string Id { get; } = file.Id;
    public string Name { get; } = file.Name;
    public long Size { get; } = file.Size;
    public string OutputName { get; } = Path.GetFileNameWithoutExtension(file.Name) + "_Spatial_9.1.6.wav";
    public JobState State { get; set; }
    public string Error { get; set; } = "";
    public bool CanRetry => State is JobState.Pending or JobState.Cancelled ||
        (State == JobState.Failed && Error is not ("extension" or "size"));
    public long OutputBytes { get; set; }
    public bool DownloadRequested { get; set; }
    public ExportSettings Settings { get; set; } = new();
}
