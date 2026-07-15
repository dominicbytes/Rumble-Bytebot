using System;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using StreamerBot.PlatformBridge.Core;

namespace Rumble.Bot;

public sealed class RumbleRuntime : IDisposable
{
    private const int FingerprintCapacity = 250;
    private readonly object sync = new object();
    private readonly IEventDispatcher dispatcher;
    private readonly IPluginLogger logger;
    private readonly JsonFileStore<RumbleDedupeState> stateStore;
    private CancellationTokenSource? cancellation;
    private Task? worker;
    private string lastStreamStatusFingerprint = string.Empty;
    private string lastPollError = string.Empty;
    private string pollStatus = "NotRun";
    private DateTimeOffset? lastPollAt;

    public RumbleRuntime(IEventDispatcher dispatcher, IPluginLogger logger, string statePath)
    {
        this.dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
        this.logger = logger ?? throw new ArgumentNullException(nameof(logger));
        stateStore = new JsonFileStore<RumbleDedupeState>(statePath);
    }

    public bool IsRunning
    {
        get
        {
            lock (sync)
            {
                return worker != null && !worker.IsCompleted;
            }
        }
    }

    public string PollStatus { get { lock (sync) return pollStatus; } }

    public string LastPollAt { get { lock (sync) return lastPollAt?.ToString("O") ?? "Never"; } }

    public void Start(RumbleConfig config)
    {
        if (config == null)
        {
            throw new ArgumentNullException(nameof(config));
        }

        var apiUrl = config.GetApiUrl();
        if (!Uri.TryCreate(apiUrl, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
        {
            throw new InvalidOperationException("Configure a valid HTTPS Rumble Live Stream API URL first.");
        }

        lock (sync)
        {
            if (worker != null && !worker.IsCompleted)
            {
                return;
            }

            cancellation = new CancellationTokenSource();
            worker = RunAsync(uri, Math.Max(2, config.PollIntervalSeconds), cancellation.Token);
        }

        logger.Info("Rumble polling started.");
    }

    public void Stop()
    {
        CancellationTokenSource? source;
        lock (sync)
        {
            source = cancellation;
            cancellation = null;
            worker = null;
        }

        source?.Cancel();
        source?.Dispose();
        logger.Info("Rumble polling stopped.");
    }

    public async Task PollOnceAsync(Uri apiUri, CancellationToken cancellationToken)
    {
        var json = await Task.Run(() => DownloadWithWinHttp(apiUri), cancellationToken).ConfigureAwait(false);
        var result = RumbleParser.Parse(json);
        Process(result);
    }

    public void Process(RumblePollResult result)
    {
        var stateExists = stateStore.TryLoad(out var state);
        var sets = CreateSets(state);
        var firstPoll = !stateExists || !state.BaselineEstablished;

        foreach (var observation in result.Observations)
        {
            if (!sets.TryGetValue(observation.Collection, out var set))
            {
                set = new FingerprintSet(FingerprintCapacity);
                sets[observation.Collection] = set;
            }

            if (set.Add(observation.Fingerprint) && !firstPoll)
            {
                dispatcher.Dispatch(observation.PlatformEvent);
            }
        }

        if (!string.IsNullOrEmpty(result.StreamStatusFingerprint))
        {
            if (!firstPoll && result.StreamStatus != null && result.StreamStatusFingerprint != lastStreamStatusFingerprint)
            {
                dispatcher.Dispatch(result.StreamStatus);
            }
            lastStreamStatusFingerprint = result.StreamStatusFingerprint;
        }

        state.BaselineEstablished = true;
        state.Collections = Snapshot(sets);
        stateStore.Save(state);

        if (firstPoll)
        {
            logger.Info("Rumble baseline established; existing API items were not dispatched.");
        }
    }

    private async Task RunAsync(Uri apiUri, int intervalSeconds, CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await PollOnceAsync(apiUri, cancellationToken).ConfigureAwait(false);
                lock (sync)
                {
                    pollStatus = "Succeeded";
                    lastPollAt = DateTimeOffset.UtcNow;
                }
                if (lastPollError.Length > 0)
                {
                    logger.Info("Rumble polling recovered.");
                    lastPollError = string.Empty;
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                lock (sync)
                {
                    pollStatus = "Failed";
                    lastPollAt = DateTimeOffset.UtcNow;
                }
                if (!string.Equals(lastPollError, exception.Message, StringComparison.Ordinal))
                {
                    logger.Error("Rumble poll failed: " + exception.Message);
                    lastPollError = exception.Message;
                }
            }

            await Task.Delay(TimeSpan.FromSeconds(intervalSeconds), cancellationToken).ConfigureAwait(false);
        }
    }

    private static Dictionary<string, FingerprintSet> CreateSets(RumbleDedupeState state)
    {
        var result = new Dictionary<string, FingerprintSet>(StringComparer.Ordinal);
        foreach (var pair in state.Collections)
        {
            result[pair.Key] = new FingerprintSet(FingerprintCapacity, pair.Value);
        }
        return result;
    }

    private static string DownloadWithWinHttp(Uri apiUri)
    {
        var requestType = Type.GetTypeFromProgID("WinHttp.WinHttpRequest.5.1")
            ?? throw new InvalidOperationException("Windows WinHTTP is unavailable.");
        var request = Activator.CreateInstance(requestType)
            ?? throw new InvalidOperationException("Windows WinHTTP could not be created.");

        try
        {
            requestType.InvokeMember("Open", BindingFlags.InvokeMethod, null, request, new object[] { "GET", apiUri.AbsoluteUri, false });
            requestType.InvokeMember("SetTimeouts", BindingFlags.InvokeMethod, null, request, new object[] { 10000, 10000, 10000, 20000 });
            requestType.InvokeMember("SetRequestHeader", BindingFlags.InvokeMethod, null, request, new object[] { "User-Agent", "Rumble.Bot/0.1 (Streamer.bot)" });
            requestType.InvokeMember("SetRequestHeader", BindingFlags.InvokeMethod, null, request, new object[] { "Accept", "application/json" });
            requestType.InvokeMember("Send", BindingFlags.InvokeMethod, null, request, null);

            var status = Convert.ToInt32(requestType.InvokeMember("Status", BindingFlags.GetProperty, null, request, null));
            if (status < 200 || status >= 300)
            {
                throw new InvalidOperationException("Rumble API returned HTTP " + status + ".");
            }

            return Convert.ToString(requestType.InvokeMember("ResponseText", BindingFlags.GetProperty, null, request, null)) ?? string.Empty;
        }
        finally
        {
            if (Marshal.IsComObject(request))
            {
                Marshal.FinalReleaseComObject(request);
            }
        }
    }

    private static Dictionary<string, List<string>> Snapshot(IDictionary<string, FingerprintSet> sets)
    {
        var result = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var pair in sets)
        {
            result[pair.Key] = new List<string>(pair.Value.Snapshot());
        }
        return result;
    }

    public void Dispose()
    {
        Stop();
    }
}
