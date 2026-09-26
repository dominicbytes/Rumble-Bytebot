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
