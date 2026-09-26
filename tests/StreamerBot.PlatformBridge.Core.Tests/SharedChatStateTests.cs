using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using StreamerBot.PlatformBridge.Core;
using Xunit;

namespace StreamerBot.PlatformBridge.Core.Tests;

public sealed class SharedChatStateTests
{
    [Fact]
    public void Apply_PersistsSelectionsAndClearAcrossReaders()
    {
        string stored = "";
        Func<string> read = () => stored;
        Action<string> write = value => stored = value;
        SharedChatState.Apply(new Dictionary<string, object> { ["operation"] = "platform", ["platform"] = "rumble", ["enabled"] = false }, read, write);
        SharedChatState.Apply(new Dictionary<string, object> { ["operation"] = "platform", ["platform"] = "joystick", ["enabled"] = true }, read, write);
        var cleared = JObject.Parse(SharedChatState.Apply(new Dictionary<string, object> { ["operation"] = "clear" }, read, write));
        var restored = JObject.Parse(SharedChatState.Apply(new Dictionary<string, object> { ["operation"] = "get" }, read, write));
        Assert.False(restored.SelectToken("bytebotChatState.Enabled.rumble")!.Value<bool>());
        Assert.True(restored.SelectToken("bytebotChatState.Enabled.joystick")!.Value<bool>());
        Assert.Equal(3, restored.SelectToken("bytebotChatState.Revision")!.Value<int>());
        Assert.Equal(cleared.ToString(), restored.ToString());
        Assert.False(string.IsNullOrEmpty(restored.SelectToken("bytebotChatState.ClearedAt")!.Value<string>()));
    }

    [Theory]
    [InlineData("platform", "unknown", "true")]
    [InlineData("platform", "rumble", "invalid")]
    [InlineData("delete", "rumble", "true")]
    public void Apply_InvalidOperation_DoesNotWrite(string operation, string platform, string enabled)
    {
        var written = false;
        Assert.Throws<ArgumentException>(() => SharedChatState.Apply(new Dictionary<string, object>
        { ["operation"] = operation, ["platform"] = platform, ["enabled"] = enabled }, () => "", value => written = true));
        Assert.False(written);
    }
}
