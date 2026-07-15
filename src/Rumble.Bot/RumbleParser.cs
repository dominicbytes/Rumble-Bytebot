using System;
using System.Collections.Generic;
using System.Globalization;
using Newtonsoft.Json.Linq;
using StreamerBot.PlatformBridge.Core;

namespace Rumble.Bot;

public static class RumbleParser
{
    public static RumblePollResult Parse(string json)
    {
        var root = JObject.Parse(json);
        var observations = new List<RumbleObservation>();

        AddPeople(root.SelectToken("followers.recent_followers"), "recent_followers", RumbleEventNames.Follow, "user.follow", "followed_on", observations);
        AddPeople(root.SelectToken("subscribers.recent_subscribers"), "recent_subscribers", RumbleEventNames.Subscription, "subscription", "subscribed_on", observations);
        AddGifted(root.SelectToken("gifted_subs.recent_gifted_subs"), observations);

        PlatformEvent? status = null;
        var statusFingerprint = string.Empty;
        foreach (var stream in AsObjects(root["livestreams"]))
        {
            AddMessages(stream, stream.SelectToken("chat.recent_messages"), "recent_messages", RumbleEventNames.ChatMessage, "chat.message", observations);
            AddMessages(stream, stream.SelectToken("chat.recent_rants"), "recent_rants", RumbleEventNames.Rant, "chat.rant", observations);

            var candidate = BuildStreamStatus(stream);
            var candidateFingerprint = FingerprintSet.Compute(
                Value(stream, "id"), Value(stream, "title"), Value(stream, "is_live"), Value(stream, "watching_now"),
                Value(stream, "likes"), Value(stream, "dislikes"), Category(stream, "primary"), Category(stream, "secondary"));

            if (status == null || Bool(stream["is_live"]))
            {
                status = candidate;
                statusFingerprint = candidateFingerprint;
            }
        }

        return new RumblePollResult(observations, status, statusFingerprint);
    }

    private static void AddMessages(JObject stream, JToken? token, string collection, string eventName, string eventType, ICollection<RumbleObservation> output)
    {
        foreach (var item in AsObjects(token))
        {
            var fields = Base(eventType, item);
            fields["streamId"] = Value(stream, "id");
            fields["streamTitle"] = Value(stream, "title");
            fields["userName"] = Value(item, "username");
            fields["message"] = Value(item, "text");
            fields["badgesJson"] = (item["badges"] ?? new JArray()).ToString(Newtonsoft.Json.Formatting.None);
            fields["createdAt"] = Value(item, "created_on");
            fields["watchingNow"] = Number(stream["watching_now"]);

            object?[] identity;
            if (eventName == RumbleEventNames.Rant)
            {
                fields["expiresAt"] = Value(item, "expires_on");
                fields["amountCents"] = Number(item["amount_cents"]);
                fields["amountDollars"] = Decimal(item["amount_dollars"]);
                identity = new object?[] { fields["streamId"], fields["userName"], fields["createdAt"], fields["message"], fields["amountCents"], fields["amountDollars"] };
            }
            else
            {
                identity = new object?[] { fields["streamId"], fields["userName"], fields["createdAt"], fields["message"] };
            }

            output.Add(new RumbleObservation(collection, FingerprintSet.Compute(identity), new PlatformEvent(eventName, fields)));
        }
    }

    private static void AddPeople(JToken? token, string collection, string eventName, string eventType, string dateProperty, ICollection<RumbleObservation> output)
    {
        foreach (var item in AsObjects(token))
        {
            var userName = First(item, "username", "user");
            var fields = Base(eventType, item);
            fields["userName"] = userName;
            fields["displayName"] = First(item, "display_name", "username", "user");
            fields["createdAt"] = Value(item, dateProperty);

            object?[] identity;
            if (eventName == RumbleEventNames.Subscription)
            {
                fields["amountCents"] = Number(item["amount_cents"]);
                fields["amountDollars"] = Decimal(item["amount_dollars"]);
                identity = new object?[] { userName, fields["createdAt"], fields["amountCents"] };
            }
            else
            {
                identity = new object?[] { userName, fields["createdAt"] };
            }

            output.Add(new RumbleObservation(collection, FingerprintSet.Compute(identity), new PlatformEvent(eventName, fields)));
        }
    }

    private static void AddGifted(JToken? token, ICollection<RumbleObservation> output)
    {
        foreach (var item in AsObjects(token))
        {
            var purchaser = First(item, "purchased_by", "username", "user");
            var fields = Base("subscription.gift", item);
            fields["userName"] = purchaser;
            fields["displayName"] = purchaser;
            fields["count"] = Number(item["total_gifts"]);
            fields["remainingCount"] = Number(item["remaining_gifts"]);
            fields["giftType"] = Value(item, "gift_type");
            fields["videoId"] = Value(item, "video_id");
            fields["observedAt"] = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture);
            var fingerprint = FingerprintSet.Compute(purchaser, fields["videoId"], fields["giftType"], fields["count"]);
            output.Add(new RumbleObservation("recent_gifted_subs", fingerprint, new PlatformEvent(RumbleEventNames.GiftedSubscription, fields)));
        }
    }

    private static PlatformEvent BuildStreamStatus(JObject stream)
    {
        var fields = Base("stream.status", stream);
        fields["streamId"] = Value(stream, "id");
        fields["streamTitle"] = Value(stream, "title");
        fields["isLive"] = Bool(stream["is_live"]);
        fields["watchingNow"] = Number(stream["watching_now"]);
        fields["likes"] = Number(stream["likes"]);
        fields["dislikes"] = Number(stream["dislikes"]);
        fields["primaryCategory"] = Category(stream, "primary");
        fields["secondaryCategory"] = Category(stream, "secondary");
        return new PlatformEvent(RumbleEventNames.StreamStatus, fields);
    }

    private static Dictionary<string, object> Base(string eventType, JToken fragment) => new Dictionary<string, object>
    {
        ["platform"] = "rumble",
        ["eventType"] = eventType,
        ["rawJson"] = JsonSanitizer.SanitizeFragment(fragment)
    };

    private static IEnumerable<JObject> AsObjects(JToken? token)
    {
        if (token is JArray array)
        {
            foreach (var child in array)
            {
                if (child is JObject obj)
                {
                    yield return obj;
                }
            }
        }
        else if (token is JObject obj)
        {
            yield return obj;
        }
    }

    private static string First(JObject obj, params string[] names)
    {
        foreach (var name in names)
        {
            var value = Value(obj, name);
            if (value.Length > 0)
            {
                return value;
            }
        }
        return string.Empty;
    }

    private static string Category(JObject stream, string name)
    {
        var token = stream.SelectToken("categories." + name);
        if (token is JObject category)
        {
            return First(category, "title", "slug");
        }
        return Value(token);
    }

    private static string Value(JObject obj, string property) => Value(obj[property]);
    private static string Value(JToken? token) => token?.Type == JTokenType.Null ? string.Empty : token?.ToString() ?? string.Empty;
    private static long Number(JToken? token) => token?.Value<long?>() ?? 0L;
    private static decimal Decimal(JToken? token) => token?.Value<decimal?>() ?? 0m;
    private static bool Bool(JToken? token) => token?.Value<bool?>() ?? false;
}
