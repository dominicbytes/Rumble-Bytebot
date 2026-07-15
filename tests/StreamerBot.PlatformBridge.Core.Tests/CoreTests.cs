using Newtonsoft.Json.Linq;
using StreamerBot.PlatformBridge.Core;
using Xunit;

namespace StreamerBot.PlatformBridge.Core.Tests;

public sealed class CoreTests
{
    [Fact]
    public void FingerprintSet_IsBoundedAndRejectsDuplicates()
    {
        var set = new FingerprintSet(2);

        Assert.True(set.Add("one"));
        Assert.False(set.Add("one"));
        Assert.True(set.Add("two"));
        Assert.True(set.Add("three"));
        Assert.DoesNotContain("one", set.Snapshot());
        Assert.Equal(2, set.Snapshot().Count);
    }

    [Fact]
    public void JsonSanitizer_RemovesNestedSecrets()
    {
        var source = JObject.Parse("{\"stream_key\":\"secret\",\"nested\":{\"access_token\":\"token\",\"safe\":1}}");

        var sanitized = JsonSanitizer.SanitizeFragment(source);

        Assert.DoesNotContain("secret", sanitized);
        Assert.DoesNotContain("token", sanitized);
        Assert.Contains("safe", sanitized);
    }
}
