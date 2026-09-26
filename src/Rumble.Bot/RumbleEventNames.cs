namespace Rumble.Bot;

public static class RumbleEventNames
{
    public const string ChatMessage = "bridge.rumble.chat_message";
    public const string Rant = "bridge.rumble.rant";
    public const string Follow = "bridge.rumble.follow";
    public const string Subscription = "bridge.rumble.subscription";
    public const string GiftedSubscription = "bridge.rumble.gifted_sub";
    public const string StreamStatus = "bridge.rumble.stream_status";
    public const string OverlayEvent = "bridge.overlay.event";

    public static readonly string[] All =
    {
        ChatMessage,
        Rant,
        Follow,
        Subscription,
        GiftedSubscription,
        StreamStatus,
        OverlayEvent
    };
}
