using System;
using System.Collections.Generic;
using System.IO;
using System.Windows.Forms;
using Streamer.bot.Plugin.Interface;
using StreamerBot.PlatformBridge.Core;

namespace Rumble.Bot;

public static class RumblePlugin
{
    private static readonly object Sync = new object();
    private static readonly string DataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StreamerBot.PlatformBridge", "Rumble.Bot");
    private static readonly JsonFileStore<RumbleConfig> ConfigStore = new JsonFileStore<RumbleConfig>(Path.Combine(DataDirectory, "config.json"));
    private static RumbleRuntime? runtime;

    public static void Initialize(IInlineInvokeProxy proxy)
    {
        foreach (var eventName in RumbleEventNames.All)
        {
            proxy.RegisterCustomTrigger(eventName, eventName, new[] { "Rumble.Bot" });
        }

        EnsureRuntime(proxy);
        proxy.LogInfo("[Rumble.Bot] Initialized. Use the Configure action before Start.");
    }

    public static bool Configure(IInlineInvokeProxy proxy, IDictionary<string, object> arguments)
    {
        var config = ConfigStore.Load();
        var currentUrl = SafeApiUrl(config);
        var suppliedUrl = GetString(arguments, "rumbleApiUrl");
        var suppliedInterval = GetInt(arguments, "pollIntervalSeconds");

        string apiUrl;
        int interval;
        if (!string.IsNullOrWhiteSpace(suppliedUrl))
        {
            apiUrl = suppliedUrl;
            interval = suppliedInterval ?? config.PollIntervalSeconds;
        }
        else if (!TryShowConfiguration(currentUrl, config.PollIntervalSeconds, out apiUrl, out interval))
        {
            return false;
        }

        if (!Uri.TryCreate(apiUrl, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
        {
            proxy.LogError("[Rumble.Bot] The API URL must be an absolute HTTPS URL.");
            return false;
        }

        config.SetApiUrl(apiUrl);
        config.PollIntervalSeconds = Math.Max(2, Math.Min(300, interval));
        ConfigStore.Save(config);
        proxy.LogInfo("[Rumble.Bot] Configuration saved. The API URL is protected with CurrentUser DPAPI.");
        return true;
    }

    public static bool Start(IInlineInvokeProxy proxy)
    {
        try
        {
            EnsureRuntime(proxy).Start(ConfigStore.Load());
            return true;
        }
        catch (Exception exception)
        {
            proxy.LogError("[Rumble.Bot] Start failed: " + exception.Message);
            return false;
        }
    }

    public static bool Stop(IInlineInvokeProxy proxy)
    {
        lock (Sync)
        {
            runtime?.Stop();
        }
        return true;
    }

    public static bool Reconnect(IInlineInvokeProxy proxy)
    {
        Stop(proxy);
        return Start(proxy);
    }

    public static bool Status(IInlineInvokeProxy proxy)
    {
        var configured = false;
        try { configured = !string.IsNullOrWhiteSpace(ConfigStore.Load().GetApiUrl()); } catch { }
        var running = false;
        var pollStatus = "NotRun";
        var lastPollAt = "Never";
        lock (Sync)
        {
            running = runtime?.IsRunning == true;
            if (runtime != null)
            {
                pollStatus = runtime.PollStatus;
                lastPollAt = runtime.LastPollAt;
            }
        }
        proxy.LogInfo($"[Rumble.Bot] Configured={configured}; Running={running}; PollStatus={pollStatus}; LastPollAt={lastPollAt}; API URL=<redacted>");
        return configured && running && pollStatus == "Succeeded";
    }

    public static bool Test(IInlineInvokeProxy proxy)
    {
        proxy.TriggerCodeEvent(RumbleEventNames.ChatMessage, new Dictionary<string, object>
        {
            ["platform"] = "rumble",
            ["eventType"] = "chat.message",
            ["streamId"] = "test",
            ["streamTitle"] = "Rumble.Bot test",
            ["userName"] = "RumbleBotTest",
            ["message"] = "Rumble.Bot test event",
            ["badgesJson"] = "[]",
            ["createdAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["watchingNow"] = 0L,
            ["rawJson"] = "{\"test\":true}"
        });
        return true;
    }

    public static bool OverlayEvent(IInlineInvokeProxy proxy, IDictionary<string, object> arguments)
    {
        var platform = GetString(arguments, "platform").Trim().ToLowerInvariant();
        var message = GetString(arguments, "message");
        if (platform != "twitch" && platform != "youtube" && platform != "kick" && platform != "rumble")
        {
            proxy.LogError("[Rumble.Bot] Overlay Event requires platform=twitch, youtube, kick, or rumble.");
            return false;
        }
        if (string.IsNullOrWhiteSpace(message))
        {
            proxy.LogError("[Rumble.Bot] Overlay Event requires a message argument.");
            return false;
        }

        var eventType = GetString(arguments, "eventType");
        proxy.TriggerCodeEvent(RumbleEventNames.OverlayEvent, new Dictionary<string, object>
        {
            ["platform"] = platform,
            ["eventType"] = string.IsNullOrWhiteSpace(eventType) ? "custom" : eventType,
            ["userName"] = GetEventUser(arguments),
            ["displayName"] = GetEventUser(arguments),
            ["message"] = message,
            ["createdAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["rawJson"] = "{}"
        });
        return true;
    }

    private static RumbleRuntime EnsureRuntime(IInlineInvokeProxy proxy)
    {
        lock (Sync)
        {
            if (runtime == null)
            {
                var adapter = new StreamerBotAdapter(proxy);
                runtime = new RumbleRuntime(adapter, adapter, Path.Combine(DataDirectory, "dedupe.json"));
            }
            return runtime;
        }
    }

    private static string SafeApiUrl(RumbleConfig config)
    {
        try { return config.GetApiUrl(); } catch { return string.Empty; }
    }

    private static string GetString(IDictionary<string, object> arguments, string key) => arguments.TryGetValue(key, out var value) ? Convert.ToString(value) ?? string.Empty : string.Empty;
    private static string GetEventUser(IDictionary<string, object> arguments)
    {
        foreach (var key in new[] { "displayName", "userName", "user", "userLogin", "username", "user_name" })
            if (arguments.TryGetValue(key, out var value) && value is string name && !string.IsNullOrWhiteSpace(name)) return name;
        return string.Empty;
    }
    private static int? GetInt(IDictionary<string, object> arguments, string key) => arguments.TryGetValue(key, out var value) && int.TryParse(Convert.ToString(value), out var result) ? result : (int?)null;

    private static bool TryShowConfiguration(string currentUrl, int currentInterval, out string apiUrl, out int interval)
    {
        using var form = new Form { Text = "Rumble.Bot Configuration", Width = 620, Height = 185, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false, StartPosition = FormStartPosition.CenterScreen };
        var urlLabel = new Label { Left = 12, Top = 18, Width = 120, Text = "Live Stream API URL" };
        var urlBox = new TextBox { Left = 138, Top = 15, Width = 450, Text = currentUrl, UseSystemPasswordChar = true };
        var intervalLabel = new Label { Left = 12, Top = 54, Width = 120, Text = "Poll interval (sec)" };
        var intervalBox = new NumericUpDown { Left = 138, Top = 51, Width = 90, Minimum = 2, Maximum = 300, Value = Math.Max(2, Math.Min(300, currentInterval)) };
        var save = new Button { Left = 418, Top = 92, Width = 82, Text = "Save", DialogResult = DialogResult.OK };
        var cancel = new Button { Left = 506, Top = 92, Width = 82, Text = "Cancel", DialogResult = DialogResult.Cancel };
        form.Controls.AddRange(new Control[] { urlLabel, urlBox, intervalLabel, intervalBox, save, cancel });
        form.AcceptButton = save;
        form.CancelButton = cancel;
        var accepted = form.ShowDialog() == DialogResult.OK;
        apiUrl = urlBox.Text.Trim();
        interval = decimal.ToInt32(intervalBox.Value);
        return accepted;
    }
}
