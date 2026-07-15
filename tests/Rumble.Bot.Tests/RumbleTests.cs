using System;
using System.Collections.Generic;
using System.IO;
using Rumble.Bot;
using StreamerBot.PlatformBridge.Core;
using Xunit;

namespace Rumble.Bot.Tests;

public sealed class RumbleTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "RumbleBotTests", Guid.NewGuid().ToString("N"));

    [Fact]
    public void Parser_MapsEventsAndSanitizesRawJson()
    {
        var result = RumbleParser.Parse(Payload("hello"));

        Assert.Contains(result.Observations, item => item.PlatformEvent.Name == RumbleEventNames.ChatMessage);
        Assert.Contains(result.Observations, item => item.PlatformEvent.Name == RumbleEventNames.Rant);
        Assert.Contains(result.Observations, item => item.PlatformEvent.Name == RumbleEventNames.Follow);
        Assert.DoesNotContain("stream_key", (string)result.StreamStatus!.Arguments["rawJson"]);
        Assert.Equal(250L, result.Observations.FindEvent(RumbleEventNames.Rant).Arguments["amountCents"]);
    }

    [Fact]
    public void Runtime_FirstPollBaselinesAndLaterPollDispatchesOnlyNewItems()
    {
        var dispatcher = new RecordingAdapter();
        using var runtime = new RumbleRuntime(dispatcher, dispatcher, Path.Combine(directory, "state.json"));

        runtime.Process(RumbleParser.Parse(Payload("first")));
        runtime.Process(RumbleParser.Parse(Payload("first")));
        runtime.Process(RumbleParser.Parse(Payload("second")));

        Assert.Single(dispatcher.Events);
        Assert.Equal("second", dispatcher.Events[0].Arguments["message"]);
    }

    [Fact]
    public void Runtime_CorruptStateFailsClosedAndBaselinesAgain()
    {
        Directory.CreateDirectory(directory);
        File.WriteAllText(Path.Combine(directory, "state.json"), "not json");
        var dispatcher = new RecordingAdapter();
        using var runtime = new RumbleRuntime(dispatcher, dispatcher, Path.Combine(directory, "state.json"));

        runtime.Process(RumbleParser.Parse(Payload("existing")));

        Assert.Empty(dispatcher.Events);
    }

    public void Dispose()
    {
        if (Directory.Exists(directory)) Directory.Delete(directory, true);
    }

    private static string Payload(string chatText) => "{" +
        "\"followers\":{\"recent_followers\":[{\"username\":\"follower\",\"followed_on\":\"2026-01-01T00:00:00Z\"}]}," +
        "\"subscribers\":{\"recent_subscribers\":[]},\"gifted_subs\":{\"recent_gifted_subs\":[]}," +
        "\"livestreams\":[{\"id\":\"stream-1\",\"title\":\"Live\",\"is_live\":true,\"watching_now\":3,\"likes\":2,\"dislikes\":0,\"stream_key\":\"must-not-leak\"," +
        "\"categories\":{\"primary\":{\"slug\":\"gaming\",\"title\":\"Gaming\"},\"secondary\":{\"slug\":\"other\",\"title\":\"Other\"}}," +
        "\"chat\":{\"recent_messages\":[{\"username\":\"viewer\",\"text\":\"" + chatText + "\",\"created_on\":\"2026-01-01T00:00:01Z\"}]," +
        "\"recent_rants\":[{\"username\":\"supporter\",\"text\":\"great\",\"created_on\":\"2026-01-01T00:00:02Z\",\"amount_cents\":250,\"amount_dollars\":2.5}]}}]}";
}

internal static class ObservationExtensions
{
    public static PlatformEvent FindEvent(this IReadOnlyList<RumbleObservation> observations, string name)
    {
        foreach (var observation in observations) if (observation.PlatformEvent.Name == name) return observation.PlatformEvent;
        throw new InvalidOperationException("Event not found: " + name);
    }
}

internal sealed class RecordingAdapter : IEventDispatcher, IPluginLogger
{
    public List<PlatformEvent> Events { get; } = new List<PlatformEvent>();
    public void Dispatch(PlatformEvent platformEvent) => Events.Add(platformEvent);
    public void Debug(string message) { }
    public void Info(string message) { }
    public void Warn(string message) { }
    public void Error(string message) { }
}
