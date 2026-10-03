const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const rumblePath = path.resolve(__dirname, "../src/Rumble.Bot/combined-chat/app.js");
const appPath = fs.existsSync(rumblePath) ? rumblePath : path.resolve(__dirname, "../src/JoystickTV.Bot/combined-chat/app.js");
const appSource = fs.readFileSync(appPath, "utf8");
const storage = new Map();

class Element {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.parent = null;
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach(child => this.appendChild(child));
  }

  addEventListener() {}

  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
  }

  get childElementCount() { return this.children.length; }
  get firstElementChild() { return this.children[0]; }
  scrollIntoView() {}
}

function createPage() {
  const chat = new Element("main");
  const status = new Element("span");
  const timers = [];
  const sockets = [];

  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor() {
      this.readyState = MockWebSocket.CONNECTING;
      this.listeners = {};
      sockets.push(this);
    }

    addEventListener(name, callback) {
      (this.listeners[name] ||= []).push(callback);
    }

    send(value) { this.subscription = JSON.parse(value); }
    open() { this.readyState = MockWebSocket.OPEN; this.emit("open", {}); }
    message(value) { this.emit("message", { data: JSON.stringify(value) }); }
    close() { this.readyState = MockWebSocket.CLOSED; this.emit("close", {}); }
    emit(name, event) { (this.listeners[name] || []).forEach(callback => callback(event)); }
  }

  const context = vm.createContext({
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    URL,
    URLSearchParams,
    clearTimeout() {},
    WebSocket: MockWebSocket,
    location: { search: "", href: "http://127.0.0.1:7474/combined-chat/index.html" },
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, value)
    },
    document: {
      hidden: false,
      getElementById: id => id === "chat" ? chat : status,
      createElement: tag => new Element(tag),
      createTextNode: text => Object.assign(new Element("#text"), { textContent: text }),
      addEventListener() {}
    },
    window: {
      addEventListener() {},
      setInterval() {},
      setTimeout: callback => { timers.push(callback); return timers.length; }
    }
  });

  vm.runInContext(appSource, context, { filename: appPath });
  return { chat, status, sockets, runTimer: () => timers.shift()?.() };
}

storage.clear();
const firstPage = createPage();
firstPage.sockets[0].open();
assert(firstPage.sockets[0].subscription.events.Twitch.includes("RewardRedemption"));
assert(firstPage.sockets[0].subscription.events.Kick.includes("Subscription"));

firstPage.sockets[0].message({
  event: { source: "Twitch", type: "ChatMessage" },
  data: {
    messageId: "message-1",
    createdAt: new Date().toISOString(),
    user: { name: "Viewer", badges: [] },
    text: "Hello Kappa",
    emotes: [{ Name: "Kappa", StartIndex: 6, EndIndex: 10, ImageUrl: "https://example.test/kappa.png" }]
  }
});
firstPage.sockets[0].message({
  event: { source: "Twitch", type: "RewardRedemption" },
  data: { id: "event-1", createdAt: new Date().toISOString(), user: { name: "Viewer" }, reward: { title: "Hydrate" } }
});

assert.equal(firstPage.chat.children.length, 2);
const chatRow = firstPage.chat.children[0];
assert.match(chatRow.children[0].src, /assets\/twitch\.png$/);
const messageBody = chatRow.children[1].children[1];
assert.equal(messageBody.children.map(child => child.textContent).join(""), "Hello ");
assert.equal(messageBody.children.filter(child => child.tagName === "IMG").length, 1);
assert(!messageBody.children.some(child => child.textContent.includes("Kappa")));
assert.match(firstPage.chat.children[1].children[1].children[0].children[0].textContent, /Viewer redeemed Hydrate/);

const storedRows = JSON.parse(storage.get("bytebot-combined-chat-v3:ws://127.0.0.1:8080/"));
assert.equal(storedRows.length, 2);

const restoredPage = createPage();
assert.equal(restoredPage.chat.children.length, 2);
restoredPage.sockets[0].close();
restoredPage.runTimer();
assert.equal(restoredPage.sockets.length, 2);

console.log("Combined-chat smoke test passed.");

for (const [id, data, expected] of [
  ['named', { text: 'Hello Kappa', emotes: [{ Name: 'Kappa', ImageUrl: 'https://example.test/kappa.png' }] }, 'Hello '],
  ['parts', { parts: [{ text: 'Hello ' }, { text: 'Kappa', imageUrl: 'https://example.test/kappa.png' }, { text: ' friend' }] }, 'Hello  friend'],
  ['boundary', { text: 'KappaTest Kappa', emotes: [{ Name: 'Kappa', ImageUrl: 'https://example.test/kappa.png' }] }, 'KappaTest ']
]) {
  firstPage.sockets[0].message({ event: { source: 'Twitch', type: 'ChatMessage' }, data: { id, ...data } });
  const body = firstPage.chat.children.at(-1).children[1].children[1];
  assert.equal(body.children.map(child => child.textContent).join(''), expected);
  assert.equal(body.children.filter(child => child.tagName === 'IMG').length, 1);
}
console.log('Emote regression tests passed.');

// Official EventSub-style and nested Streamer.bot schemas; not live captures.
const nameCases = [
  ['Raid', { from_broadcaster_user_name: 'Incoming', to_broadcaster_user_name: 'Owner', viewers: 2 }, 'Incoming raided with 2 viewers'],
  ['Raid', { from_broadcaster_user_login: 'incoming', viewers: 1 }, 'incoming raided with 1 viewer'],
  ['Raid', { raider: { name: 'NestedRaider' }, user: { name: 'WrongActor' }, viewers: 2 }, 'NestedRaider raided with 2 viewers'],
  ['RaidSend', { from_broadcaster_user_name: 'Owner', to_broadcaster_user_name: 'Destination', viewers: 7 }, 'Raid Send: Destination (7 viewers)'],
  ['ShoutoutCreated', { moderator_user_name: 'Moderator', to_broadcaster_user_name: 'Recipient' }, 'Shoutout sent to Recipient'],
  ['ShoutoutReceived', { from_broadcaster_user_name: 'Promoter' }, 'Promoter sent a shoutout'],
  ['ShoutoutCreated', { user: { name: 'NestedRecipient' }, broadcaster: { name: 'Owner' } }, 'Shoutout sent to NestedRecipient'],
  ['ShoutoutReceived', { user: { name: 'NestedPromoter' }, broadcaster: { name: 'Owner' } }, 'NestedPromoter sent a shoutout'],
  ['RaidStart', { targetUser: { name: 'NestedDestination' }, broadcaster: { name: 'Owner' }, viewers: 9 }, 'Raid Start: NestedDestination (9 viewers)'],
  ['Follow', { user_name: 'Follower' }, 'Follower followed'],
  ['Follow', { targetUser: { name: 'NewFollower' }, broadcaster: { name: 'Owner' } }, 'NewFollower followed'],
  ['RaidSend', { targetUser: { name: 'RaidTarget' }, user: { name: 'WrongActor' }, viewers: 7 }, 'Raid Send: RaidTarget (7 viewers)'],
  ['RaidStart', { userName: 'jek_umbreon', viewers: 9 }, 'Raid Start: jek_umbreon (9 viewers)'],
  ['Follow', { targetUser: { name: ' ', login: 'followerlogin' } }, 'followerlogin followed'],
  ['SharedChatRaid', { from_broadcaster_user_name: 'SharedRaider', viewers: 3 }, 'SharedRaider raided with 3 viewers'],
  ['ShoutoutCreated', { to_broadcaster_user_login: 'recipientlogin', user: { name: 'Moderator' } }, 'Shoutout sent to recipientlogin'],
  ['Raid', { raider: { name: '<b>Raider</b>' }, viewers: 2 }, '<b>Raider</b> raided with 2 viewers'],
  ['RewardRedemption', { user: { name: 'Redeemer' }, reward: { title: 'Hydrate' } }, 'Redeemer redeemed Hydrate'],
  ['RewardRedemption', { user_name: 'FlatRedeemer', reward: { title: 'Hydrate' } }, 'FlatRedeemer redeemed Hydrate'],
  ['Raid', { broadcaster: { name: 'Owner' }, viewers: 2 }, 'Someone raided with 2 viewers']
];
for (const [index, [type, data, expected]] of nameCases.entries()) {
  firstPage.sockets[0].message({ event: { source: 'Twitch', type }, data: { id: `name-case-${index}`, ...data } });
  const row = firstPage.chat.children.at(-1);
  assert.equal(row.children[1].children[0].children[0].textContent, expected, `${type} case ${index}`);
  const saved = JSON.parse(storage.get('bytebot-combined-chat-v3:ws://127.0.0.1:8080/')).at(-1);
  assert.equal(saved.text, expected);
  assert.equal(saved.eventType, type);
}
console.log('Event username regression tests passed.');

storage.clear();
const historyKey = 'bytebot-combined-chat-v3:ws://127.0.0.1:8080/';
storage.set('bytebot-platforms-v1:ws://127.0.0.1:8080/', JSON.stringify(['joystick', 'rumble']));
const joystickPage = createPage();
joystickPage.sockets[0].open();
function joystickEvent(name, args) {
  joystickPage.sockets[0].message({
    event: { source: 'Custom', type: 'CodeEvent' },
    data: { eventName: `bridge.joystick.${name}`, arguments: args }
  });
}

// Reproduce the generic event whose saved OBS notice was "Someone: Viewer Count Updated".
for (let index = 0; index < 100; index++) {
  joystickEvent('stream_event', { streamEventType: 'ViewerCountUpdated', eventId: `viewer-count-${index}` });
}
assert.equal(joystickPage.chat.children.length, 0, 'Viewer-count updates must not create chat rows');
assert.equal(JSON.parse(storage.get(historyKey) || '[]').length, 0, 'Viewer-count updates must not fill history');

const joystickCases = [
  ['chat_message', { userName: 'Chatter', message: 'Someone: Viewer Count Updated', messageId: 'chat-viewer-count' }, 'Someone: Viewer Count Updated'],
  ['tipped', { userName: 'Tipper', amountTokens: 20, tipMenuItem: 'Dance', eventId: 'tip' }, 'Tipper tipped 20 tokens — Dance'],
  ['wheel_spin_claimed', { userName: 'Spinner', amountTokens: 10, prize: 'Hydrate', eventId: 'wheel' }, 'Spinner claimed a wheel spin (10 tokens) — Hydrate'],
  ['subscribed', { userName: 'Subscriber', eventId: 'sub' }, 'Subscriber subscribed'],
  ['followed', { userName: 'Follower', eventId: 'follow' }, 'Follower followed'],
  ['drop_in', { userName: 'Raider', viewerCount: 7, eventId: 'drop-in' }, 'Raider dropped in with 7 viewers'],
  ['stream_event', { streamEventType: 'OtherEvent', userName: 'Viewer', eventId: 'other' }, 'Viewer: Other Event']
];
for (const [index, [name, args, expected]] of joystickCases.entries()) {
  joystickEvent(name, args);
  assert.equal(joystickPage.chat.children.length, index + 1, `${name} should still display`);
  const row = joystickPage.chat.children.at(-1);
  assert.equal(row.hidden, false);
  const saved = JSON.parse(storage.get(historyKey)).at(-1);
  assert.equal(saved.text, expected);
}
joystickPage.sockets[0].message({
  event: { source: 'Custom', type: 'CodeEvent' },
  data: { eventName: 'bridge.rumble.stream_status', arguments: { isLive: true } }
});
assert.equal(joystickPage.chat.children.length, joystickCases.length, 'Rumble status filtering must remain intact');

const savedJoystickRows = JSON.parse(storage.get(historyKey));
const cachedCountNotice = {
  kind: 'event', platform: 'joystick', eventType: 'bridge.joystick.stream_event',
  text: 'Someone: Viewer Count Updated', parts: [{ type: 'text', text: 'Someone: Viewer Count Updated' }],
  badges: [], createdAt: new Date().toISOString(), id: 'cached-viewer-count'
};
storage.set(historyKey, JSON.stringify([cachedCountNotice, ...savedJoystickRows]));
const joystickRestoredPage = createPage();
assert.equal(joystickRestoredPage.chat.children.length, joystickCases.length, 'Cached viewer-count notices must not reappear');
joystickRestoredPage.sockets[0].open();
joystickRestoredPage.sockets[0].message({
  event: { source: 'Custom', type: 'CodeEvent' },
  data: { eventName: 'bridge.joystick.followed', arguments: { userName: 'NewFollower', eventId: 'new-follow' } }
});
assert.equal(JSON.parse(storage.get(historyKey)).length, joystickCases.length + 1, 'Saved history must exclude cached count notices');
console.log('Joystick viewer-count filtering regression tests passed.');
