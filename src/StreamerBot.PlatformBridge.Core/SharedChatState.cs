using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;

namespace StreamerBot.PlatformBridge.Core;

/// <summary>Serializes shared chat controls through one persisted Streamer.bot global.</summary>
public static class SharedChatState
{
    private static readonly object Sync = new object();
    private static readonly string[] Platforms = { "twitch", "youtube", "kick", "rumble", "joystick" };

    /// <summary>Reads or updates display preferences; returns a sanitized broadcast envelope.</summary>
    /// <param name="arguments">Operation, platform and enabled arguments from the browser.</param>
    /// <param name="read">Reads the dedicated persisted chat-control global.</param>
    /// <param name="write">Writes the dedicated persisted chat-control global.</param>
    /// <returns>A JSON envelope containing only shared display state.</returns>
    public static string Apply(IDictionary<string, object> arguments, Func<string> read, Action<string> write)
    {
        if (arguments == null) throw new ArgumentNullException(nameof(arguments));
        if (read == null) throw new ArgumentNullException(nameof(read));
        if (write == null) throw new ArgumentNullException(nameof(write));
        lock (Sync)
        {
            var raw = read();
            var state = string.IsNullOrEmpty(raw) ? new State() : JsonConvert.DeserializeObject<State>(raw) ?? new State();
            var operation = Text(arguments, "operation");
            if (operation == "platform")
            {
                var platform = Text(arguments, "platform").ToLowerInvariant();
                if (!Platforms.Contains(platform) || !bool.TryParse(Text(arguments, "enabled"), out var enabled))
                    throw new ArgumentException("Invalid chat platform selection.");
                state.Enabled[platform] = enabled;
                state.Revision++;
            }
            else if (operation == "clear")
            {
                state.ClearedAt = DateTimeOffset.UtcNow.ToString("O");
                state.Revision++;
            }
            else if (operation != "get") throw new ArgumentException("Unknown chat control operation.");
            if (operation != "get" || string.IsNullOrEmpty(raw)) write(JsonConvert.SerializeObject(state));
            return JsonConvert.SerializeObject(new { bytebotChatState = state });
        }
    }

    private static string Text(IDictionary<string, object> args, string key) => args.TryGetValue(key, out var value) ? Convert.ToString(value) ?? "" : "";

    private sealed class State
    {
        public long Revision { get; set; }
        public string ClearedAt { get; set; } = "";
        public Dictionary<string, bool> Enabled { get; set; } = Platforms.ToDictionary(platform => platform, platform => platform != "joystick");
    }
}
