using System;
using System.Collections.Generic;
using StreamerBot.PlatformBridge.Core;

namespace Rumble.Bot;

public sealed class RumbleConfig
{
    public string ProtectedApiUrl { get; set; } = string.Empty;
    public int PollIntervalSeconds { get; set; } = 5;

    public string GetApiUrl() => SecretProtector.Unprotect(ProtectedApiUrl);

    public void SetApiUrl(string value) => ProtectedApiUrl = SecretProtector.Protect(value);
}

public sealed class RumbleDedupeState
{
    public bool BaselineEstablished { get; set; }
    public Dictionary<string, List<string>> Collections { get; set; } = new Dictionary<string, List<string>>(StringComparer.Ordinal);
}

public sealed class RumbleObservation
{
    public RumbleObservation(string collection, string fingerprint, PlatformEvent platformEvent)
    {
        Collection = collection;
        Fingerprint = fingerprint;
        PlatformEvent = platformEvent;
    }

    public string Collection { get; }
    public string Fingerprint { get; }
    public PlatformEvent PlatformEvent { get; }
}

public sealed class RumblePollResult
{
    public RumblePollResult(IReadOnlyList<RumbleObservation> observations, PlatformEvent? streamStatus, string streamStatusFingerprint)
    {
        Observations = observations;
        StreamStatus = streamStatus;
        StreamStatusFingerprint = streamStatusFingerprint;
    }

    public IReadOnlyList<RumbleObservation> Observations { get; }
    public PlatformEvent? StreamStatus { get; }
    public string StreamStatusFingerprint { get; }
}
