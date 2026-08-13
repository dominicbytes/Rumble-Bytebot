(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const endpoint = params.get("ws") || "ws://127.0.0.1:8080/";
  const chat = document.getElementById("chat");
  const status = document.getElementById("status");
  const maximumRows = 250;
  let retry = 1000;

  function connect() {
    const socket = new WebSocket(endpoint);
    socket.addEventListener("open", () => {
      retry = 1000;
      setStatus("Connected", "online");
      socket.send(JSON.stringify({
        request: "Subscribe",
        id: "platform-bridge-chat",
        events: {
          Twitch: ["ChatMessage"],
          YouTube: ["Message"],
          Kick: ["ChatMessage"],
          Custom: ["CodeEvent"]
        }
      }));
    });
    socket.addEventListener("message", event => receive(event.data));
    socket.addEventListener("close", () => {
      setStatus("Reconnecting", "offline");
      window.setTimeout(connect, retry);
      retry = Math.min(30000, retry * 2);
    });
    socket.addEventListener("error", () => socket.close());
  }

  function receive(raw) {
    let envelope;
    try { envelope = JSON.parse(raw); } catch { return; }
    if (!envelope.event || !envelope.data) return;
    const source = String(envelope.event.source || "").toLowerCase();
    const type = String(envelope.event.type || "");
    if (source === "custom" && type === "CodeEvent") {
      const name = envelope.data.eventName || envelope.data.name;
      if (name !== "bridge.rumble.chat_message") return;
      append(normalizeRumble(envelope.data.arguments || envelope.data.args || envelope.data));
      return;
    }
    if (source === "twitch" && type === "ChatMessage") append(normalizeNative("twitch", envelope.data));
    if (source === "youtube" && type === "Message") append(normalizeNative("youtube", envelope.data));
    if (source === "kick" && type === "ChatMessage") append(normalizeNative("kick", envelope.data));
  }

  function normalizeRumble(data) {
    return { platform: "rumble", name: data.userName || "Unknown", text: data.message || "", badges: parseBadges(data.badgesJson), emotes: [] };
  }

  function normalizeNative(platform, data) {
    const user = data.user || data.author || {};
    const message = data.message && typeof data.message === "object" ? data.message : {};
    return {
      platform,
      name: user.display || user.displayName || user.name || data.userName || data.displayName || data.authorName || "Unknown",
      text: message.message || message.text || data.message || data.text || "",
      badges: normalizeAssets(user.badges || data.badges, true),
      emotes: normalizeAssets(message.emotes || data.emotes, false)
    };
  }

  function parseBadges(value) {
    if (!value) return [];
    try { return normalizeAssets(typeof value === "string" ? JSON.parse(value) : value, true); } catch { return []; }
  }

  function normalizeAssets(value, allowLabels) {
    if (!Array.isArray(value)) return [];
    return value.map(asset => typeof asset === "string" ? (safeUrl(asset) ? { url: asset } : { label: asset }) : asset)
      .filter(asset => asset && (safeUrl(asset.url || asset.imageUrl || asset.ImageUrl || asset.image) || (allowLabels && (asset.label || asset.name || asset.Name || asset.title))));
  }

  function append(model) {
    const row = document.createElement("article");
    row.className = "message";
    row.dataset.platform = model.platform;
    const stripe = document.createElement("span");
    stripe.className = "platform";
    const content = document.createElement("div");
    content.className = "content";
    const meta = document.createElement("span");
    meta.className = "meta";
    model.badges.forEach(badge => meta.appendChild(renderAsset(badge, "badge")));
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = model.name;
    meta.appendChild(name);
    const text = document.createElement("span");
    text.className = "text";
    text.textContent = String(model.text);
    content.append(meta, text);
    model.emotes.forEach(emote => content.appendChild(renderAsset(emote, "emote")));
    row.append(stripe, content);
    chat.appendChild(row);
    while (chat.childElementCount > maximumRows) chat.firstElementChild.remove();
    row.scrollIntoView({ block: "end" });
  }

  function renderAsset(asset, className) {
    const url = asset.url || asset.imageUrl || asset.ImageUrl || asset.image;
    if (!safeUrl(url)) {
      const label = document.createElement("span");
      label.className = "badge badge-label";
      label.textContent = asset.label || asset.name || asset.Name || asset.title || "badge";
      return label;
    }
    const img = document.createElement("img");
    img.className = className;
    img.src = url;
    img.alt = asset.name || asset.Name || asset.title || "";
    img.loading = "lazy";
    return img;
  }

  function safeUrl(value) {
    try { return new URL(value, location.href).protocol === "https:"; } catch { return false; }
  }

  function setStatus(text, className) {
    status.textContent = text;
    status.className = className;
  }

  connect();
})();
