using System;
using Streamer.bot.Plugin.Interface;
using StreamerBot.PlatformBridge.Core;

namespace Rumble.Bot;

internal sealed class StreamerBotAdapter : IEventDispatcher, IPluginLogger
{
    private readonly IInlineInvokeProxy proxy;

    public StreamerBotAdapter(IInlineInvokeProxy proxy)
    {
        this.proxy = proxy ?? throw new ArgumentNullException(nameof(proxy));
    }

    public void Dispatch(PlatformEvent platformEvent) => proxy.TriggerCodeEvent(platformEvent.Name, platformEvent.Arguments);
    public void Debug(string message) => proxy.LogDebug("[Rumble.Bot] " + message);
    public void Info(string message) => proxy.LogInfo("[Rumble.Bot] " + message);
    public void Warn(string message) => proxy.LogWarn("[Rumble.Bot] " + message);
    public void Error(string message) => proxy.LogError("[Rumble.Bot] " + message);
}
