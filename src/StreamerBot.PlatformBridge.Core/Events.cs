using System;
using System.Collections.Generic;

namespace StreamerBot.PlatformBridge.Core;

public sealed class PlatformEvent
{
    public PlatformEvent(string name, IDictionary<string, object> arguments)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("An event name is required.", nameof(name));
        }

        Name = name;
        Arguments = new Dictionary<string, object>(arguments ?? throw new ArgumentNullException(nameof(arguments)));
    }

    public string Name { get; }

    public Dictionary<string, object> Arguments { get; }
}

public interface IEventDispatcher
{
    void Dispatch(PlatformEvent platformEvent);
}

public interface IPluginLogger
{
    void Debug(string message);
    void Info(string message);
    void Warn(string message);
    void Error(string message);
}
