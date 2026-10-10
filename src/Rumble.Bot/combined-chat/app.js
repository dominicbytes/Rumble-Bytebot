(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const endpoint = params.get("ws") || "ws://127.0.0.1:8080/";
  const chat = document.getElementById("chat");
  const status = document.getElementById("status");
  const historyKey = `bytebot-combined-chat-v3:${endpoint}`;
  const filterKey = `bytebot-platforms-v1:${endpoint}`;
  const clearKey = `bytebot-chat-cleared-v1:${endpoint}`;
  let clearedAt = "";
  try { clearedAt = localStorage.getItem(clearKey) || ""; } catch { }
  const maximumRows = 200;
  const maximumAge = 7 * 24 * 60 * 60 * 1000;
  const reconnectInterval = 5000;
  const connectionTimeout = 10000;
  const platformLogos = {
    twitch: "assets/twitch.png",
    youtube: "assets/youtube.png",
    kick: "assets/kick.png",
    rumble: "assets/rumble.png",
    joystick: "assets/joystick.svg"
  };
  const subscriptions = {
    Twitch: [
      "ChatMessage", "AdRun", "Announcement", "AutomaticRewardRedemption", "CharityCompleted",
      "CharityDonation", "CharityStarted", "Cheer", "CommunityGoalContribution", "CommunityGoalEnded",
      "CustomPowerUpRedemption", "Follow", "GiftBomb", "GiftPaidUpgrade", "GiftSub", "GoalBegin",
      "GoalEnd", "GoalProgress", "HypeChat", "HypeChatLevel", "HypeTrainEnd", "HypeTrainLevelUp",
      "HypeTrainStart", "PayItForward", "PowerUpRedemption", "PrimePaidUpgrade", "Raid", "RaidSend",
      "RaidStart", "ReSub", "RewardRedemption", "SharedChatRaid", "SharedChatResub", "SharedChatSub",
      "SharedChatSubGift", "ShoutoutCreated", "ShoutoutReceived", "StreamOffline", "StreamOnline", "Sub",
      "WatchStreak", "CoinCheer", "BitsBadgeTier", "HypeTrainUpdate", "CharityProgress",
      "PollCreated", "PollUpdated", "PollCompleted", "PollTerminated", "PollArchived",
      "PredictionCreated", "PredictionUpdated", "PredictionCompleted", "PredictionCanceled", "PredictionLocked",
      "RewardRedemptionUpdated", "RaidCancelled", "SharedChatAnnouncement", "SharedChatCommunitySubGift",
      "SharedChatPrimePaidUpgrade", "SharedChatGiftPaidUpgrade", "SharedChatPayItForward", "Modiversary", "SharedModiversary"
    ],
    YouTube: [
      "Message", "BroadcastEnded", "BroadcastStarted", "GiftMembershipReceived", "JewelsGifted",
      "MemberMileStone", "MembershipGift", "NewSponsor", "NewSubscriber", "PollClosed", "PollStarted",
      "SuperChat", "SuperSticker", "PollUpdated"
    ],
    Kick: [
      "ChatMessage", "Follow", "GiftSubscription", "MassGiftSubscription", "Resubscription",
      "RewardRedemption", "KicksGifted", "StreamOffline", "StreamOnline", "Subscription"
    ],
    Custom: ["CodeEvent"],
    General: ["Custom"]
  };

  let socket = null;
  let reconnectTimer = null;
  let connectionStartedAt = 0;
  let lastResponseAt = 0;
  let history = loadHistory();
  const displayedKeys = new Set();
  const controls = new Map();
  const clearButton = document.getElementById("clear-chat");
  const controlStatus = document.getElementById("control-status");
  let sharedReady = false;
  let sharedRevision = -1;
  let enabled = Object.keys(platformLogos).filter(platform => platform !== "joystick");
  try {
    const stored = JSON.parse(localStorage.getItem(filterKey));
    if (Array.isArray(stored)) enabled = stored.filter(platform => platformLogos[platform]);
  } catch { }
  // Server state is authoritative, including when URLs contain old platform parameters.
  Object.keys(platformLogos).forEach(platform => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = enabled.includes(platform);
    input.disabled = true;
    controls.set(platform, input);
    input.addEventListener("change", () => {
      sendControl("platform", { platform, enabled: input.checked });
    });
    label.append(input, document.createTextNode(platformName(platform)));
    document.getElementById("platforms").appendChild(label);
  });
  clearButton.disabled = true;
  clearButton.addEventListener("click", () => sendControl("clear"));

  history.forEach(model => append(model, false));
  connect();
  window.setInterval(checkConnection, reconnectInterval);
  window.addEventListener("online", reconnectNow);
  window.addEventListener("pageshow", reconnectNow);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) reconnectNow();
  });

  function connect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

    connectionStartedAt = Date.now();
    setStatus("Connecting", "offline");
    let current;
    try { current = new WebSocket(endpoint); } catch { setStatus("Invalid WebSocket URL", "offline"); return; }
    socket = current;
    current.addEventListener("open", () => {
      if (socket !== current) return;
      lastResponseAt = Date.now();
      setStatus("Subscribing", "offline");
      current.send(JSON.stringify({
        request: "Subscribe",
        id: "platform-bridge-chat",
        events: subscriptions
      }));
    });
    current.addEventListener("message", event => { if (socket === current) receive(event.data); });
    current.addEventListener("close", () => {
      if (socket !== current) return;
      socket = null;
      setControlReady(false, "Controls reconnecting");
      setStatus("Reconnecting", "offline");
      scheduleReconnect();
    });
    current.addEventListener("error", () => current.close());
  }

  function scheduleReconnect() {
    if (reconnectTimer !== null) return;
    reconnectTimer = window.setTimeout(connect, reconnectInterval);
  }

  function checkConnection() {
    if (!socket) {
      scheduleReconnect();
      return;
    }
    if ((socket.readyState === WebSocket.CONNECTING && Date.now() - connectionStartedAt > connectionTimeout) ||
      (socket.readyState === WebSocket.OPEN && Date.now() - lastResponseAt > connectionTimeout * 2)) {
      const stale = socket;
      socket = null;
      stale.close();
      setStatus("Reconnecting", "offline");
      scheduleReconnect();
      return;
    }
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ request: "GetInfo", id: "chat-heartbeat" }));
      sendControl("get");
    }
    if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) scheduleReconnect();
  }

  function reconnectNow() {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      connect();
    }
  }

  function receive(raw) {
    let envelope;
    try { envelope = JSON.parse(raw); } catch { return; }
    if (!envelope || typeof envelope !== "object") return;
    lastResponseAt = Date.now();
    if (envelope.bytebotChatState) { applySharedState(envelope.bytebotChatState); return; }
    if (envelope.event?.source === "General" && envelope.event?.type === "Custom" && envelope.data?.bytebotChatState) {
      applySharedState(envelope.data.bytebotChatState); return;
    }
    if (String(envelope.id || "").startsWith("chat-control:") && envelope.status === "error") {
      setControlReady(false, "Import [Combined Chat] Controls to enable shared controls");
      return;
    }
    if (envelope.id === "platform-bridge-chat") {
      setStatus(envelope.status === "ok" ? "Connected" : "Subscription failed", envelope.status === "ok" ? "online" : "offline");
      if (envelope.status === "ok") sendControl("get");
      return;
    }
    if (envelope.authentication) { setStatus("WebSocket authentication required", "offline"); return; }
    if (!envelope.event || !envelope.data) return;
    const source = String(envelope.event.source || "").toLowerCase();
    const type = String(envelope.event.type || "");

    if (source === "custom" && type === "CodeEvent") {
      receiveCustom(envelope.data);
      return;
    }
    if (!platformLogos[source]) return;
    const data = { ...envelope.data, timeStamp: envelope.data.timeStamp || envelope.timeStamp };
    if (isChatEvent(source, type)) append(normalizeNative(source, data));
    else append(normalizeNativeEvent(source, type, data));
  }

  function receiveCustom(data) {
    const name = data.eventName || data.name;
    if (name === "bridge.rumble.stream_status") return;
    const args = data.arguments || data.args || data;
    if (name === "bridge.joystick.chat_message") {
      let emotes = [];
      try { emotes = normalizeAssets(JSON.parse(args.emotesJson || "[]"), false); } catch { }
      const text = String(args.message || "");
      append(chatModel("joystick", args.displayName || args.userName, text, parseBadges(args.badgesJson),
        normalizeMessageParts(text, [], emotes), args.createdAt, args.messageId));
      return;
    }
    if (String(name || "").startsWith("bridge.joystick.")) {
      if (args.streamEventType === "ViewerCountUpdated") return;
      const type = String(name).slice("bridge.joystick.".length);
      const user = eventUser(args);
      let text = `${user}: ${humanize(args.streamEventType || type)}`;
      if (type === "tipped") text = `${user} tipped ${args.amountTokens || 0} tokens${args.tipMenuItem ? ` — ${args.tipMenuItem}` : ""}`;
      else if (type === "wheel_spin_claimed") text = `${user} claimed a wheel spin (${args.amountTokens || 0} tokens)${args.prize ? ` — ${args.prize}` : ""}`;
      else if (type === "subscribed") text = `${user} subscribed`;
      else if (type === "gifted_subs") text = `${user} gifted ${args.count || 1} subscriptions`;
      else if (type === "followed") text = `${user} followed`;
      else if (type === "drop_in") text = `${user} dropped in with ${args.viewerCount || 0} viewers`;
      append(eventModel("joystick", name, text, args));
      return;
    }
    if (name === "bridge.rumble.chat_message") {
      append(normalizeRumble(args));
      return;
    }
    if (name === "bridge.overlay.event") {
      append(normalizeOverlayEvent(args));
      return;
    }
    if (String(name || "").startsWith("bridge.rumble.")) append(normalizeRumbleEvent(name, args));
  }

  function isChatEvent(platform, type) {
    return (platform === "youtube" && type === "Message") ||
      ((platform === "twitch" || platform === "kick") && type === "ChatMessage");
  }

  function normalizeRumble(data) {
    return chatModel(
      "rumble",
      data.userName || "Unknown",
      data.message || "",
      parseBadges(data.badgesJson),
      [],
      data.createdAt,
      data.messageId
    );
  }

  function normalizeNative(platform, data) {
    const user = data.user || data.author || {};
    const message = data.message && typeof data.message === "object" ? data.message : {};
    const text = firstString(message.message, message.text, data.message, data.text);
    const emotes = normalizeAssets(message.emotes || data.emotes, false);
    const structuredParts = message.parts || data.parts || data.messageParts;
    return chatModel(
      platform,
      firstString(user.display, user.displayName, user.name, data.userName, data.displayName, data.authorName, "Unknown"),
      text,
      normalizeAssets(user.badges || data.badges, true),
      normalizeMessageParts(text, structuredParts, emotes),
      firstString(data.createdAt, data.timestamp, data.timeStamp),
      firstString(data.messageId, message.msgId, message.id, data.id)
    );
  }

  function chatModel(platform, name, text, badges, parts, createdAt, id) {
    return {
      kind: "chat",
      platform,
      name: String(name || "Unknown"),
      text: String(text || ""),
      badges,
      parts: parts.length ? parts : [{ type: "text", text: String(text || "") }],
      createdAt: validDate(createdAt),
      id: String(id || "")
    };
  }

  function normalizeNativeEvent(platform, type, data) {
    const user = platform === "twitch" ? twitchEventUser(type, data) : eventUser(data);
    const lower = type.toLowerCase();
    const reward = firstString(
      read(data, "reward.title"), read(data, "reward.name"), read(data, "rewardName"),
      read(data, "customPowerUp.title"), read(data, "rewardType"), "a reward"
    );
    const count = firstValue(read(data, "count"), read(data, "giftCount"), read(data, "total"), read(data, "totalGifts"));
    const viewers = firstValue(read(data, "viewers"), read(data, "viewerCount"), read(data, "viewer_count"));
    const amount = firstString(
      read(data, "formattedAmount"), read(data, "amountFormatted"), read(data, "amount"),
      read(data, "purchaseAmount"), read(data, "currencyAmount")
    );
    let text;

    if (lower === "rewardredemptionupdated") text = `${user}'s ${reward} redemption updated${data.status ? `: ${data.status}` : ""}`;
    else if (lower.includes("rewardredemption") || lower.includes("powerupredemption")) text = `${user} redeemed ${reward}`;
    else if (lower === "raidsend" || lower === "raidstart") text = `${humanize(type)}: ${user}${viewers !== "" ? ` (${viewers} viewers)` : ""}`;
    else if (lower.includes("raid")) text = viewers !== "" ? `${user} raided with ${viewers} viewer${String(viewers) === "1" ? "" : "s"}` : `${user} raided the stream`;
    else if (lower === "cheer" || lower === "coincheer") text = `${user} cheered ${firstValue(data.bits, data.coins, 0)} ${lower === "coincheer" ? "coins" : "bits"}`;
    else if (lower === "kicksgifted") text = `${user} sent ${firstValue(data.kicks, data.amount, data.gift?.amount, "a")} Kicks gift`;
    else if (lower === "giftmembershipreceived") text = `${user} received a gifted membership`;
    else if (lower.includes("gift") && (lower.includes("sub") || lower.includes("membership") || lower === "giftbomb")) text = `${user} gifted ${count || 1} subscription${String(count || 1) === "1" ? "" : "s"}`;
    else if (lower.includes("sub") || lower.includes("sponsor") || lower.includes("membership")) text = `${user} subscribed`;
    else if (lower === "follow") text = `${user} followed`;
    else if (lower === "superchat") text = `${user} sent a Super Chat${amount ? ` (${amount})` : ""}`;
    else if (lower === "supersticker") text = `${user} sent a Super Sticker${amount ? ` (${amount})` : ""}`;
    else if (lower === "jewelsgifted") text = `${user} gifted ${count || firstValue(data.jewels, data.amount, "jewels")}`;
    else if (lower.includes("charitydonation")) text = `${user} donated to charity${amount ? ` (${amount})` : ""}`;
    else if (lower.includes("hypechat")) text = `${user} sent a Hype Chat${amount ? ` (${amount})` : ""}`;
    else if (lower.includes("announcement")) text = `${user}: ${firstString(data.text, data.message, "Announcement")}`;
    else if (lower.includes("shoutoutreceived")) text = `${user} sent a shoutout`;
    else if (lower.includes("shoutoutcreated")) text = `Shoutout sent to ${user}`;
    else if (lower.includes("streamonline") || lower.includes("broadcaststarted")) text = `${platformName(platform)} stream started`;
    else if (lower.includes("streamoffline") || lower.includes("broadcastended")) text = `${platformName(platform)} stream ended`;
    else text = `${platformName(platform)}: ${humanize(type)}`;

    return eventModel(platform, type, text, data);
  }

  function normalizeRumbleEvent(name, data) {
    const type = String(name).slice("bridge.rumble.".length);
    const user = eventUser(data);
    let text;
    if (type === "rant") {
      const amount = data.amountDollars || (Number(data.amountCents) / 100).toFixed(2);
      text = `${user} sent a $${amount} Rumble rant${data.message ? `: ${data.message}` : ""}`;
    } else if (type === "follow") text = `${user} followed`;
    else if (type === "subscription") text = `${user} subscribed`;
    else if (type === "gifted_sub") text = `${user} gifted ${data.count || 1} subscription${Number(data.count || 1) === 1 ? "" : "s"}`;
    else text = `Rumble: ${humanize(type)}`;
    return eventModel("rumble", type, text, data);
  }

  function normalizeOverlayEvent(data) {
    const platform = platformLogos[String(data.platform || "").toLowerCase()] ? String(data.platform).toLowerCase() : "rumble";
    const user = eventUser(data);
    const message = firstString(data.message, data.eventMessage, humanize(data.eventType || "Custom event"));
    return eventModel(platform, data.eventType || "custom", user !== "Someone" ? `${user}: ${message}` : message, data);
  }

  function eventModel(platform, type, text, data) {
    return {
      kind: "event",
      platform,
      name: "",
      text: String(text || ""),
      badges: [],
      parts: [{ type: "text", text: String(text || "") }],
      createdAt: validDate(firstString(data.createdAt, data.observedAt, data.timestamp, data.timeStamp)),
      eventType: type,
      id: firstString(data.eventId, data.redemptionId, data.id) ? `${type}:${firstString(data.eventId, data.redemptionId, data.id)}` : ""
    };
  }

  function normalizeMessageParts(text, value, emotes) {
    const supplied = Array.isArray(value) ? value : [];
    const structured = supplied.map(part => {
      const url = part && (part.imageUrl || part.ImageUrl || part.url || part.image);
      if (safeUrl(url)) return { type: "emote", url, alt: firstString(part.text, part.name, part.Name) };
      return { type: "text", text: part && (typeof part.text === "string" ? part.text : part.Text) || "" };
    }).filter(part => part.type === "emote" || part.text);
    if (structured.some(part => part.type === "emote")) return structured;

    const indexed = emotes.map(emote => ({
      asset: emote,
      start: Number(firstValue(emote.StartIndex, emote.startIndex, emote.start, NaN)),
      end: Number(firstValue(emote.EndIndex, emote.endIndex, emote.end, NaN))
    })).filter(item => Number.isInteger(item.start) && Number.isInteger(item.end) && item.start >= 0 && item.end >= item.start)
      .sort((left, right) => left.start - right.start);
    if (indexed.length) {
      const result = [];
      let offset = 0;
      indexed.forEach(item => {
        if (item.start < offset || item.start >= text.length) return;
        if (item.start > offset) result.push({ type: "text", text: text.slice(offset, item.start) });
        result.push({ type: "emote", url: assetUrl(item.asset), alt: assetName(item.asset) });
        offset = Math.min(text.length, item.end + 1);
      });
      if (offset < text.length) result.push({ type: "text", text: text.slice(offset) });
      if (result.some(part => part.type === "emote")) return result;
    }
    return replaceNamedEmotes(text, emotes);
  }

  function replaceNamedEmotes(text, emotes) {
    const named = emotes.filter(emote => assetName(emote) && safeUrl(assetUrl(emote)));
    if (!named.length) return [];
    const result = [];
    let offset = 0;
    while (offset < text.length) {
      let match = null;
      named.forEach(emote => {
        const name = assetName(emote);
        let index = text.indexOf(name, offset);
        while (index >= 0 && ((index > 0 && /[\p{L}\p{N}_]/u.test(text[index - 1])) ||
          /[\p{L}\p{N}_]/u.test(text[index + name.length] || ""))) index = text.indexOf(name, index + 1);
        if (index >= 0 && (!match || index < match.index)) match = { emote, index };
      });
      if (!match) break;
      if (match.index > offset) result.push({ type: "text", text: text.slice(offset, match.index) });
      result.push({ type: "emote", url: assetUrl(match.emote), alt: assetName(match.emote) });
      offset = match.index + assetName(match.emote).length;
    }
    if (offset < text.length) result.push({ type: "text", text: text.slice(offset) });
    return result.some(part => part.type === "emote") ? result : [];
  }

  function parseBadges(value) {
    if (!value) return [];
    try { return normalizeAssets(typeof value === "string" ? JSON.parse(value) : value, true); } catch { return []; }
  }

  function normalizeAssets(value, allowLabels) {
    if (!Array.isArray(value)) return [];
    return value.map(asset => typeof asset === "string" ? (safeUrl(asset) ? { url: asset } : { label: asset }) : asset)
      .filter(asset => asset && (safeUrl(assetUrl(asset)) || (allowLabels && assetName(asset))))
      .map(asset => ({ url: assetUrl(asset), name: assetName(asset),
        start: firstValue(asset.StartIndex, asset.startIndex, asset.start),
        end: firstValue(asset.EndIndex, asset.endIndex, asset.end) }));
  }

  function append(model, persist = true) {
    if (!model || !platformLogos[model.platform] || suppressed(model) || (clearedAt && Date.parse(model.createdAt) <= Date.parse(clearedAt))) return;
    const key = modelKey(model);
    if (displayedKeys.has(key)) return;
    displayedKeys.add(key);

    const row = document.createElement("article");
    row.className = `message ${model.kind === "event" ? "stream-event" : "chat-message"}`;
    row.dataset.platform = model.platform;
    row.dataset.key = key;
    row.hidden = !enabled.includes(model.platform);
    const logo = document.createElement("img");
    logo.className = "platform-logo";
    logo.src = platformLogos[model.platform];
    logo.alt = platformName(model.platform);

    const content = document.createElement("div");
    content.className = "content";
    if (model.kind === "chat") {
      const meta = document.createElement("span");
      meta.className = "meta";
      model.badges.forEach(badge => meta.appendChild(renderAsset(badge, "badge")));
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = model.name;
      meta.appendChild(name);
      content.appendChild(meta);
    }
    const body = document.createElement("span");
    body.className = model.kind === "event" ? "event-text" : "text";
    model.parts.forEach(part => {
      if (part.type === "emote" && safeUrl(part.url)) body.appendChild(renderAsset({ url: part.url, name: part.alt }, "emote"));
      else body.appendChild(document.createTextNode(String(part.text || "")));
    });
    content.appendChild(body);
    row.append(logo, content);
    chat.appendChild(row);
    while (chat.childElementCount > maximumRows) {
      displayedKeys.delete(chat.firstElementChild.dataset.key);
      chat.firstElementChild.remove();
    }
    if (!row.hidden) row.scrollIntoView({ block: "end" });

    if (persist) {
      history.push(model);
      history = pruneHistory(history);
      saveHistory();
    }
  }

  function renderAsset(asset, className) {
    const url = assetUrl(asset);
    if (!safeUrl(url)) {
      const label = document.createElement("span");
      label.className = "badge badge-label";
      label.textContent = assetName(asset) || "badge";
      return label;
    }
    const img = document.createElement("img");
    img.className = className;
    img.src = url;
    img.alt = assetName(asset);
    img.loading = "lazy";
    return img;
  }

  function loadHistory() {
    try {
      const legacy = endpoint === "ws://127.0.0.1:8080/" ? localStorage.getItem("rumble-bytebot-combined-chat-v2") : null;
      const stored = JSON.parse(localStorage.getItem(historyKey) || legacy || "[]");
      return pruneHistory(Array.isArray(stored) ? stored.filter(validModel) : []);
    } catch { return []; }
  }

  function saveHistory() {
    try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch { }
  }

  function pruneHistory(models) {
    const cutoff = Date.now() - maximumAge;
    return models.filter(model => !suppressed(model) && Date.parse(model.createdAt) >= cutoff &&
      (!clearedAt || Date.parse(model.createdAt) > Date.parse(clearedAt))).slice(-maximumRows);
  }

  function suppressed(model) {
    if (model.platform === "joystick" && model.kind === "event" &&
      (model.eventType === "bridge.joystick.user_entered" || model.eventType === "bridge.joystick.user_left")) return true;
    if (model.platform === "joystick" && model.kind === "event" && model.eventType === "bridge.joystick.stream_event") {
      return /^.+: Viewer Count Updated$/.test(model.text);
    }
    return model.platform === "rumble" && model.kind === "event" &&
      (model.eventType === "stream_status" || /^Rumble stream (?:is live|is offline|started|ended)/.test(model.text));
  }

  function sendControl(operation, args = {}) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (operation !== "get" && !sharedReady) return;
    socket.send(JSON.stringify({ request: "DoAction", id: `chat-control:${operation}:${Date.now()}`,
      action: { name: "[Combined Chat] Controls" }, args: { operation, ...args } }));
  }

  function setControlReady(ready, message) {
    sharedReady = ready;
    controls.forEach(input => { input.disabled = !ready; });
    clearButton.disabled = !ready;
    controlStatus.textContent = message;
  }

  function applySharedState(state) {
    if (!state || !Number.isSafeInteger(state.Revision) || !state.Enabled || typeof state.ClearedAt !== "string") return;
    if (state.Revision < sharedRevision) return;
    sharedRevision = state.Revision;
    enabled = Object.keys(platformLogos).filter(platform => state.Enabled[platform] === true);
    controls.forEach((input, platform) => { input.checked = enabled.includes(platform); });
    if (state.ClearedAt && state.ClearedAt !== clearedAt && Number.isFinite(Date.parse(state.ClearedAt))) {
      clearedAt = state.ClearedAt;
      history = pruneHistory(history);
      chat.replaceChildren();
      displayedKeys.clear();
      history.forEach(model => append(model, false));
      saveHistory();
      try { localStorage.setItem(clearKey, clearedAt); } catch { }
    }
    Array.from(chat.children).forEach(row => { row.hidden = !enabled.includes(row.dataset.platform); });
    try { localStorage.setItem(filterKey, JSON.stringify(enabled)); } catch { }
    setControlReady(true, "Controls synced across displays");
  }

  function validModel(model) {
    return model && (model.kind === "chat" || model.kind === "event") && platformLogos[model.platform] &&
      Array.isArray(model.badges) && model.badges.every(badge => badge && typeof badge === "object") &&
      Array.isArray(model.parts) && model.parts.every(part => part && (part.type === "text" || part.type === "emote")) && typeof model.createdAt === "string";
  }

  function modelKey(model) {
    return model.id ? `${model.platform}:${model.kind}:${model.id}` :
      `${model.platform}:${model.kind}:${model.createdAt}:${model.name}:${model.text}`;
  }

  function twitchEventUser(type, data) {
    // EventSub uses directional broadcaster fields; newer events use user objects.
    // Never use the channel owner or the shoutout moderator as the event subject.
    let subject = "";
    if (type === "Raid" || type === "SharedChatRaid") {
      subject = firstString(userLabel(data.raider), data.from_broadcaster_user_name, data.from_broadcaster_user_login);
    } else if (type === "RaidSend" || type === "RaidStart") {
      subject = firstString(userLabel(data.targetUser), data.to_broadcaster_user_name, data.to_broadcaster_user_login);
    } else if (type === "ShoutoutCreated") {
      subject = firstString(data.to_broadcaster_user_name, data.to_broadcaster_user_login, userLabel(data.user));
    } else if (type === "ShoutoutReceived") {
      subject = firstString(data.from_broadcaster_user_name, data.from_broadcaster_user_login);
    } else if (type === "Follow") {
      subject = firstString(userLabel(data.targetUser), data.user_name, data.user_login);
    }
    return subject || eventUser(data);
  }

  function userLabel(user) {
    return typeof user === "string" ? firstString(user) : user && firstString(user.display, user.displayName, user.display_name,
      user.name, user.username, user.userName, user.login, user.user_name, user.user_login) || "";
  }

  function eventUser(data) {
    const users = [data.user, data.redeemer, data.sender, data.author, data.from, data.raider, data.gifter, data.recipient];
    for (const user of users) {
      const name = userLabel(user);
      if (name) return name;
    }
    return firstString(data.displayName, data.userDisplayName, data.userName, data.user_name, data.username, data.userLogin, data.user_login,
      data.redeemerDisplayName, data.redeemerUserName, data.fromDisplayName, data.fromUserName, data.raiderName, "Someone");
  }

  function read(value, path) {
    return path.split(".").reduce((current, key) => current && current[key], value);
  }

  function firstString(...values) {
    const value = values.find(item => typeof item === "string" && item.trim());
    return value || "";
  }

  function firstValue(...values) {
    const value = values.find(item => item !== undefined && item !== null && item !== "");
    return value === undefined ? "" : value;
  }

  function assetUrl(asset) {
    return asset && (asset.url || asset.imageUrl || asset.ImageUrl || asset.image) || "";
  }

  function assetName(asset) {
    return firstString(asset && asset.label, asset && asset.name, asset && asset.Name, asset && asset.title);
  }

  function validDate(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
  }

  function humanize(value) {
    return String(value || "Event").replace(/[._-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, letter => letter.toUpperCase());
  }

  function platformName(platform) {
    return platform === "youtube" ? "YouTube" : platform === "joystick" ? "Joystick.TV" : platform.charAt(0).toUpperCase() + platform.slice(1);
  }

  function safeUrl(value) {
    if (typeof value !== "string" || !value.trim()) return false;
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  }

  function setStatus(text, className) {
    status.textContent = text;
    status.className = className;
  }
})();
