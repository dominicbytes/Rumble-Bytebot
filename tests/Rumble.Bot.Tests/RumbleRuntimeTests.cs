using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace Rumble.Bot.Tests;

public sealed class RumbleRuntimeTests : IDisposable
{
    private const string ApiUrl = "https://rumble.example/api?key=secret";
    private readonly string directory = Path.Combine(Path.GetTempPath(), "RumbleBotTests", Guid.NewGuid().ToString("N"));
    private readonly FakeRumbleApi api = new FakeRumbleApi();
    private readonly RecordingAdapter events = new RecordingAdapter();
    private readonly List<RumbleRuntime> runtimes = new List<RumbleRuntime>();

    private string StatePath => Path.Combine(directory, "state.json");

    [Fact]
    public void Stop_DiscardsPollThatCompletesAfterStop()
    {
        var runtime = CreateRuntime(NoDelay);
        runtime.Process(RumbleParser.Parse(RumbleTests.Payload("old")));
        var inFlight = api.Pending();

        runtime.Start(Config());
        WaitUntil(() => api.Calls == 1);
        runtime.Stop();
        inFlight.SetResult(RumbleTests.Payload("new"));
        Thread.Sleep(300);

        Assert.Empty(ChatMessages());
    }

    [Fact]
    public void Restart_WaitsForPreviousPollAndDispatchesOnce()
    {
        var runtime = CreateRuntime(NoDelay);
        runtime.Process(RumbleParser.Parse(RumbleTests.Payload("old")));
        var inFlight = api.Pending();
        api.Respond(RumbleTests.Payload("new"));

        runtime.Start(Config());
        WaitUntil(() => api.Calls == 1);
        runtime.Stop();
        runtime.Start(Config());
        Thread.Sleep(300);
        Assert.Equal(1, api.Calls);

        inFlight.SetResult(RumbleTests.Payload("new"));
        WaitUntil(() => ChatMessages().Count == 1);
        Thread.Sleep(300);

        Assert.Equal("new", Assert.Single(ChatMessages()));
        Assert.True(runtime.IsRunning);
    }

    [Fact]
    public void Process_RewritesStateOnlyWhenFingerprintsChange()
    {
        var runtime = CreateRuntime(NoDelay);
        runtime.Process(RumbleParser.Parse(RumbleTests.Payload("first")));
        var unchanged = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        File.SetLastWriteTimeUtc(StatePath, unchanged);

        runtime.Process(RumbleParser.Parse(RumbleTests.Payload("first")));
        Assert.Equal(unchanged, File.GetLastWriteTimeUtc(StatePath));

        runtime.Process(RumbleParser.Parse(RumbleTests.Payload("second")));
        Assert.NotEqual(unchanged, File.GetLastWriteTimeUtc(StatePath));

        var restartedEvents = new RecordingAdapter();
        var restarted = new RumbleRuntime(restartedEvents, restartedEvents, StatePath, api.Fetch, NoDelay);
        runtimes.Add(restarted);
        restarted.Process(RumbleParser.Parse(RumbleTests.Payload("second")));
        Assert.DoesNotContain(restartedEvents.Events, item => item.Name == RumbleEventNames.ChatMessage);
    }

    [Fact]
    public void PollFailure_LogsUnderlyingMessageWithoutApiUrl()
    {
        var runtime = CreateRuntime(NoDelay);
        api.Fail(new TargetInvocationException(new COMException("Timed out contacting " + ApiUrl + "\r\n")));

        runtime.Start(Config());
        WaitUntil(() => Errors().Count == 1);

        var error = Errors()[0];
        Assert.Contains("Timed out contacting", error);
        Assert.DoesNotContain("secret", error);
        Assert.DoesNotContain("rumble.example", error);
    }

    [Fact]
    public void PollFailures_BackOffExponentiallyAndResetAfterSuccess()
    {
        var delays = new List<TimeSpan>();
        var runtime = CreateRuntime((wait, token) =>
        {
            lock (delays) delays.Add(wait);
            return Task.CompletedTask;
        });
        for (var i = 0; i < 6; i++) api.Fail(new InvalidOperationException("Rumble API returned HTTP 503."));
        api.Respond(RumbleTests.Payload("first"));

        runtime.Start(Config());
        WaitUntil(() => { lock (delays) return delays.Count == 7; });

        lock (delays)
        {
            Assert.Equal(new[] { 4d, 8d, 16d, 32d, 60d, 60d, 2d }, delays.Select(item => item.TotalSeconds));
        }
    }

    public void Dispose()
    {
        foreach (var runtime in runtimes) runtime.Dispose();
        if (Directory.Exists(directory)) Directory.Delete(directory, true);
    }

    private static Task NoDelay(TimeSpan wait, CancellationToken token) => Task.CompletedTask;

    private RumbleRuntime CreateRuntime(Func<TimeSpan, CancellationToken, Task> delay)
    {
        var runtime = new RumbleRuntime(events, events, StatePath, api.Fetch, delay);
        runtimes.Add(runtime);
        return runtime;
    }

    private static RumbleConfig Config()
    {
        var config = new RumbleConfig { PollIntervalSeconds = 2 };
        config.SetApiUrl(ApiUrl);
        return config;
    }

    private List<string> ChatMessages()
    {
        lock (events.Events)
        {
            return events.Events.Where(item => item.Name == RumbleEventNames.ChatMessage)
                .Select(item => (string)item.Arguments["message"]).ToList();
        }
    }

    private List<string> Errors()
    {
        lock (events.Errors) return events.Errors.ToList();
    }

    private static void WaitUntil(Func<bool> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (!condition())
        {
            if (DateTime.UtcNow > deadline) throw new TimeoutException("Condition was not met within five seconds.");
            Thread.Sleep(10);
        }
    }
}

/// <summary>Serves queued poll results; unqueued polls stay pending like a hung WinHTTP request.</summary>
internal sealed class FakeRumbleApi
{
    private readonly object sync = new object();
    private readonly Queue<TaskCompletionSource<string>> responses = new Queue<TaskCompletionSource<string>>();
    private int calls;

    public int Calls { get { lock (sync) return calls; } }

    public TaskCompletionSource<string> Pending()
    {
        var response = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (sync) responses.Enqueue(response);
        return response;
    }

    public void Respond(string json) => Pending().SetResult(json);

    public void Fail(Exception exception) => Pending().SetException(exception);

    public Task<string> Fetch(Uri uri, CancellationToken cancellationToken)
    {
        lock (sync)
        {
            calls++;
            return responses.Count > 0
                ? responses.Dequeue().Task
                : new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously).Task;
        }
    }
}
