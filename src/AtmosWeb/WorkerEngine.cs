using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;

namespace AtmosWeb;

// The same AOT assemblies are loaded in a dedicated worker, without running the
// Blazor entry point. The worker alone owns the decoder and its synchronous OPFS writer.
[SupportedOSPlatform("browser")]
public static partial class WorkerEngine {
    static CancellationTokenSource? cancellation;

    [JSImport("write", "spatialWorker")]
    private static partial void Write([JSMarshalAs<JSType.Array<JSType.Number>>] byte[] bytes);
    [JSImport("progress", "spatialWorker")]
    private static partial void Progress(double value);
    [JSImport("cooperate", "spatialWorker")]
    private static partial Task Cooperate();

    [JSExport]
    public static void Cancel() => cancellation?.Cancel();

    [JSExport]
    public static async Task<string> Convert([JSMarshalAs<JSType.Array<JSType.Number>>] byte[] data, int bitDepth, int sampleRate) {
        if (cancellation is not null) return "workerError";
        cancellation = new();
        try {
            using var input = new MemoryStream(data, false);
            await Converter.Render(input, bytes => {
                try { Write(bytes); }
                catch (Exception) { throw new ConversionException("storageError"); }
                return Task.CompletedTask;
            }, Progress, cancellation.Token, new(bitDepth, sampleRate), _ => Cooperate());
            cancellation.Token.ThrowIfCancellationRequested();
            return "";
        } catch (OperationCanceledException) { return "cancelled"; }
        catch (ConversionException error) { return error.Code; }
        catch (Exception error) { Console.WriteLine(error); return "decodeError"; }
        finally { cancellation.Dispose(); cancellation = null; }
    }
}
