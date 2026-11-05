namespace AtmosWeb;

public sealed class ConversionException(string code) : InvalidOperationException(code) {
    public string Code { get; } = code;
}
