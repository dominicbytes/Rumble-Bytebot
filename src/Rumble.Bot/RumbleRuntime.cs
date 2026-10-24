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
    private const int MaximumBackoffSeconds = 60;
    private readonly object sync = new object();
    private readonly object stateSync = new object();
    private readonly IEventDispatcher dispatcher;
    private readonly IPluginLogger logger;
    private readonly JsonFileStore<RumbleDedupeState> stateStore;
    private readonly Func<Uri, CancellationToken, Task<string>> fetch;
    private readonly Func<TimeSpan, CancellationToken, Task> delay;
    private CancellationTokenSource? cancellation;
    private Task? worker;
    private Dictionary<string, FingerprintSet>? sets;
    private bool baselineEstablished;
    private bool unsavedChanges;
    private string lastStreamStatusFingerprint = string.Empty;
    private string lastPollError = string.Empty;
    private string pollStatus = "NotRun";
    private DateTimeOffset? lastPollAt;

    public RumbleRuntime(IEventDispatcher dispatcher, IPluginLogger logger, string statePath)
        : this(dispatcher, logger, statePath, (uri, token) => Task.Run(() => DownloadWithWinHttp(uri), token), Task.Delay)
    {
    }

    internal RumbleRuntime(IEventDispatcher dispatcher, IPluginLogger logger, string statePath,
        Func<Uri, CancellationToken, Task<string>> fetch, Func<TimeSpan, CancellationToken, Task> delay)
    {
        this.dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
        this.logger = logger ?? throw new ArgumentNullException(nameof(logger));
        stateStore = new JsonFileStore<RumbleDedupeState>(statePath);
        this.fetch = fetch ?? throw new ArgumentNullException(nameof(fetch));
        this.delay = delay ?? throw new ArgumentNullException(nameof(delay));
    }

    public bool IsRunning
    {
        get
        {
            lock (sync)
            {
                return cancellation != null && worker != null && !worker.IsCompleted;
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
            if (cancellation != null && worker != null && !worker.IsCompleted)
            {
                return;
            }

            // A stopped worker may still be inside a WinHTTP request, so the new worker waits for it.
            var previous = worker;
            cancellation = new CancellationTokenSource();
            worker = RunAfterAsync(previous, uri, Math.Max(2, config.PollIntervalSeconds), cancellation.Token);
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
        }

        // Not disposed: the worker may still observe its token, and a plain source owns no unmanaged resources.
        source?.Cancel();
        logger.Info("Rumble polling stopped.");
    }

    public async Task PollOnceAsync(Uri apiUri, CancellationToken cancellationToken)
    {
        var json = await fetch(apiUri, cancellationToken).ConfigureAwait(false);
        cancellationToken.ThrowIfCancellationRequested();
        var result = RumbleParser.Parse(json);
        Process(result);
    }

    public void Process(RumblePollResult result)
    {
        lock (stateSync)
        {
            if (sets == null)
            {
                var stateExists = stateStore.TryLoad(out var state);
                sets = CreateSets(state);
                baselineEstablished = stateExists && state.BaselineEstablished;
            }

            var firstPoll = !baselineEstablished;
            foreach (var observation in result.Observations)
            {
                if (!sets.TryGetValue(observation.Collection, out var set))
                {
                    set = new FingerprintSet(FingerprintCapacity);
                    sets[observation.Collection] = set;
                }

                if (set.Add(observation.Fingerprint))
                {
                    unsavedChanges = true;
                    if (!firstPoll)
                    {
                        dispatcher.Dispatch(observation.PlatformEvent);
                    }
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

            if (firstPoll || unsavedChanges)
            {
                stateStore.Save(new RumbleDedupeState { BaselineEstablished = true, Collections = Snapshot(sets) });
                baselineEstablished = true;
                unsavedChanges = false;
            }

            if (firstPoll)
            {
                logger.Info("Rumble baseline established; existing API items were not dispatched.");
            }
        }
    }

    private async Task RunAfterAsync(Task? previous, Uri apiUri, int intervalSeconds, CancellationToken cancellationToken)
    {
        if (previous != null)
        {
            try { await previous.ConfigureAwait(false); }
            catch (OperationCanceledException) { }
        }

        await RunAsync(apiUri, intervalSeconds, cancellationToken).ConfigureAwait(false);
    }

    private async Task RunAsync(Uri apiUri, int intervalSeconds, CancellationToken cancellationToken)
    {
        var consecutiveFailures = 0;
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await PollOnceAsync(apiUri, cancellationToken).ConfigureAwait(false);
                consecutiveFailures = 0;
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
                consecutiveFailures++;
                lock (sync)
                {
                    pollStatus = "Failed";
                    lastPollAt = DateTimeOffset.UtcNow;
                }
                var message = DescribeFailure(exception, apiUri);
                if (!string.Equals(lastPollError, message, StringComparison.Ordinal))
                {
                    logger.Error("Rumble poll failed: " + message);
                    lastPollError = message;
                }
            }

            try
            {
                await delay(PollDelay(intervalSeconds, consecutiveFailures), cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                return;
            }
        }
    }

    private static TimeSpan PollDelay(int intervalSeconds, int consecutiveFailures)
    {
        if (consecutiveFailures == 0)
        {
            return TimeSpan.FromSeconds(intervalSeconds);
        }

        var ceiling = Math.Max(intervalSeconds, MaximumBackoffSeconds);
        return TimeSpan.FromSeconds(Math.Min(ceiling, intervalSeconds * Math.Pow(2, Math.Min(consecutiveFailures, 16))));
    }

    private static string DescribeFailure(Exception exception, Uri apiUri)
    {
        // Late-bound WinHTTP calls wrap the real COM error in TargetInvocationException.
        while (exception is TargetInvocationException && exception.InnerException != null)
        {
            exception = exception.InnerException;
        }

        return exception.Message.Trim()
            .Replace(apiUri.OriginalString, "<redacted>")
            .Replace(apiUri.AbsoluteUri, "<redacted>");
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
