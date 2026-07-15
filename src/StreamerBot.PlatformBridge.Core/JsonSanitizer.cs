using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace StreamerBot.PlatformBridge.Core;

public static class JsonSanitizer
{
    private static readonly HashSet<string> SecretNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "stream_key",
        "access_token",
        "refresh_token",
        "client_secret",
        "authorization",
        "password",
        "api_url"
    };

    public static string SanitizeFragment(JToken fragment)
    {
        if (fragment == null)
        {
            throw new ArgumentNullException(nameof(fragment));
        }

        var clone = fragment.DeepClone();
        RemoveSecrets(clone);
        return clone.ToString(Formatting.None);
    }

    private static void RemoveSecrets(JToken token)
    {
        if (token is JObject obj)
        {
            var properties = new List<JProperty>(obj.Properties());
            foreach (var property in properties)
            {
                if (SecretNames.Contains(property.Name))
                {
                    property.Remove();
                }
                else
                {
                    RemoveSecrets(property.Value);
                }
            }
        }
        else if (token is JArray array)
        {
            foreach (var child in array)
            {
                RemoveSecrets(child);
            }
        }
    }
}
