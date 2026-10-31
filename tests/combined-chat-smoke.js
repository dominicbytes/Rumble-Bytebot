const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

// The same standard chat ships in every Bytebot repository; test whichever copy this repository has.
const appPath = [
  "../src/Rumble.Bot/combined-chat/app.js",
  "../src/JoystickTV.Bot/combined-chat/app.js",
  "../src/Altstream.Bot/combined-chat/app.js"
].map(file => path.resolve(__dirname, file)).find(file => fs.existsSync(file));
const appSource = fs.readFileSync(appPath, "utf8");
const storage = new Map();

class Element {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.className = "";
    this.textContent = "";
    this.parent = null;
    this.scrollCount = 0;
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach(child => this.appendChild(child));
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  replaceWith(node) {
    node.parent = this.parent;
    this.parent.children[this.parent.children.indexOf(this)] = node;
  }

  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }

  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
  }

  get childElementCount() { return this.children.length; }
  get firstElementChild() { return this.children[0]; }
  scrollIntoView() { this.scrollCount++; }
}

function createPage() {
  const elements = new Map(["chat", "status", "platforms", "clear-chat", "control-status", "jump-latest"]
    .map(id => [id, new Element(id === "chat" ? "main" : "span")]));
  const chat = elements.get("chat");
  const status = elements.get("status");
  const timers = [];
  const intervals = [];
  const sockets = [];
  const windowListeners = {};
  const document = {
    hidden: false,
    scrollingElement: null,
    getElementById: id => elements.get(id),
    createElement: tag => new Element(tag),
    createTextNode: text => Object.assign(new Element("#text"), { textContent: text }),
    addEventListener() {}
  };

  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor() {
      this.readyState = MockWebSocket.CONNECTING;
      this.listeners = {};
      this.sent = [];
      sockets.push(this);
    }

    addEventListener(name, callback) {
      (this.listeners[name] ||= []).push(callback);
    }

    send(value) {
      const request = JSON.parse(value);
      this.sent.push(request);
      if (request.request === "Subscribe") this.subscription = request;
    }
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
    document,
    window: {
      addEventListener(name, callback) { (windowListeners[name] ||= []).push(callback); },
      setInterval(callback) { intervals.push(callback); },
      setTimeout: callback => { timers.push(callback); return timers.length; }
    }
  });

  vm.runInContext(appSource, context, { filename: appPath });
  return {
    chat, status, sockets, document, elements,
    runTimer: () => timers.shift()?.(),
    runIntervals: () => intervals.forEach(callback => callback()),
    fireWindow: (name, event = {}) => (windowListeners[name] || []).forEach(callback => callback(event))
  };
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
// Joystick sends a follower-count update after each follow; v2 passes the type through as follower_count_updated.
for (const type of ['follower_count_updated', 'FollowerCountUpdated', 'subscriber_count_updated']) {
  joystickEvent('stream_event', { streamEventType: type, eventId: `count-${type}` });
}
assert.equal(joystickPage.chat.children.length, 0, 'Follower-count and other count updates must not create chat rows');
assert.equal(JSON.parse(storage.get(historyKey) || '[]').length, 0, 'Count updates must not fill history');

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
const cachedFollowerCountNotice = { ...cachedCountNotice, text: 'Someone: Follower count updated',
  parts: [{ type: 'text', text: 'Someone: Follower count updated' }], id: 'cached-follower-count' };
storage.set(historyKey, JSON.stringify([cachedCountNotice, cachedFollowerCountNotice, ...savedJoystickRows]));
const joystickRestoredPage = createPage();
assert.equal(joystickRestoredPage.chat.children.length, joystickCases.length, 'Cached viewer-count notices must not reappear');
joystickRestoredPage.sockets[0].open();
joystickRestoredPage.sockets[0].message({
  event: { source: 'Custom', type: 'CodeEvent' },
  data: { eventName: 'bridge.joystick.followed', arguments: { userName: 'NewFollower', eventId: 'new-follow' } }
});
assert.equal(JSON.parse(storage.get(historyKey)).length, joystickCases.length + 1, 'Saved history must exclude cached count notices');
console.log('Joystick count-update filtering regression tests passed.');

storage.clear();
storage.set('bytebot-platforms-v1:ws://127.0.0.1:8080/', JSON.stringify(['joystick']));
const presencePage = createPage();
presencePage.sockets[0].open();
for (const [index, name] of ['user_entered', 'user_left'].entries()) {
  for (const payload of [
    { eventName: `bridge.joystick.${name}`, arguments: { userName: 'PresenceViewer', eventId: `presence-arguments-${index}` } },
    { name: `bridge.joystick.${name}`, args: { userName: 'PresenceViewer', eventId: `presence-args-${index}` } }
  ]) {
    presencePage.sockets[0].message({ event: { source: 'Custom', type: 'CodeEvent' }, data: payload });
  }
}
assert.equal(presencePage.chat.children.length, 0, 'Presence events must not create chat rows');
assert.equal(JSON.parse(storage.get(historyKey) || '[]').length, 0, 'Presence events must not fill history');

for (const [index, message] of ['User entered', 'User left'].entries()) {
  presencePage.sockets[0].message({
    event: { source: 'Custom', type: 'CodeEvent' },
    data: { eventName: 'bridge.joystick.chat_message', arguments: { userName: 'Chatter', message, messageId: `presence-text-${index}` } }
  });
}
assert.equal(presencePage.chat.children.length, 2, 'Actual chat mentioning presence must remain visible');
const savedChatRows = JSON.parse(storage.get(historyKey));
const cachedPresenceRows = ['user_entered', 'user_left'].map((type, index) => ({
  kind: 'event', platform: 'joystick', eventType: `bridge.joystick.${type}`,
  text: `PresenceViewer: User ${index ? 'left' : 'entered'}`,
  parts: [{ type: 'text', text: `PresenceViewer: User ${index ? 'left' : 'entered'}` }],
  badges: [], createdAt: new Date().toISOString(), id: `cached-presence-${index}`
}));
storage.set(historyKey, JSON.stringify([...cachedPresenceRows, ...savedChatRows]));
const presenceRestoredPage = createPage();
assert.equal(presenceRestoredPage.chat.children.length, 2, 'Cached presence notices must not reappear');
presenceRestoredPage.sockets[0].open();
presenceRestoredPage.sockets[0].message({
  event: { source: 'Custom', type: 'CodeEvent' },
  data: { eventName: 'bridge.joystick.followed', args: { userName: 'StillVisible', eventId: 'presence-follow' } }
});
assert.equal(presenceRestoredPage.chat.children.length, 3, 'Follow events must remain visible');
assert.equal(JSON.parse(storage.get(historyKey)).length, 3, 'Saved history must exclude cached presence notices');
console.log('Joystick presence filtering regression tests passed.');

// Standard shared chat features.
storage.clear();
const featurePage = createPage();
const featureSocket = featurePage.sockets[0];
featureSocket.open();
const now = new Date().toISOString();
const customEvent = (eventName, args) => featureSocket.message({ event: { source: 'Custom', type: 'CodeEvent' }, data: { eventName, arguments: args } });
const twitchEvent = (type, data) => featureSocket.message({ event: { source: 'Twitch', type }, data });
const rowIds = () => featurePage.chat.children.map(row => row.dataset.messageId);
const rowText = row => row.children[1].children.at(-1).children.map(child => child.textContent).join('');

for (const type of ['ChatMessageDeleted', 'ChatCleared', 'UserBanned', 'UserTimedOut']) {
  assert(featureSocket.subscription.events.Twitch.includes(type), `Twitch.${type} must be subscribed`);
}
featureSocket.message({ id: 'platform-bridge-chat', status: 'ok' });
featurePage.runIntervals();
featurePage.runIntervals();
assert.equal(featureSocket.sent.filter(request => request.request === 'DoAction').length, 1, 'Controls are read once per connection, not on every heartbeat');
assert.equal(featureSocket.sent.filter(request => request.request === 'GetInfo').length, 2, 'Heartbeat still checks the connection');

const twitchChat = (messageId, id, login, text) => twitchEvent('ChatMessage', {
  messageId, createdAt: now, text, user: { id, login, name: login, color: '#FF4500', badges: [] }
});
twitchChat('t1', 'u1', 'alpha', 'one');
twitchChat('t2', 'u2', 'beta', 'two');
twitchChat('t3', 'u1', 'alpha', 'three');
customEvent('bridge.rumble.chat_message', { userName: 'RumbleFan', message: 'rumble', createdAt: now, messageId: 'r1' });
assert.equal(featurePage.chat.children[0].children[1].children[0].children.at(-1).style.color, '#FF4500', 'Native user colors render');

twitchEvent('ChatMessageDeleted', { messageId: 't2', targetUser: { id: 'u2', login: 'beta', name: 'beta' } });
assert.deepEqual(rowIds(), ['t1', 't3', 'r1']);
twitchEvent('UserTimedOut', { targetUser: { id: 'u1', login: 'alpha', name: 'Alpha' } });
assert.deepEqual(rowIds(), ['r1']);
twitchChat('t4', 'u3', 'gamma', 'four');
twitchEvent('UserBanned', { targetUser: { login: 'GAMMA', name: 'Gamma' } });
assert.deepEqual(rowIds(), ['r1'], 'Bans match by login when the id is absent');
twitchChat('t5', 'u4', 'delta', 'five');
twitchEvent('ChatCleared', {});
assert.deepEqual(rowIds(), ['r1'], 'Twitch clear removes only Twitch chat');
assert.equal(createPage().chat.children.length, 1, 'Removed rows stay removed after reload');

customEvent('bridge.rumble.rant', { userName: 'Fan', amountDollars: 5, message: 'gg', createdAt: now });
assert.match(featurePage.chat.children.at(-1).className, /\bpaid-event\b/, 'Rants are highlighted');
twitchEvent('Cheer', { id: 'cheer-1', createdAt: now, user: { name: 'Cheerer' }, bits: 100 });
assert.match(featurePage.chat.children.at(-1).className, /\bpaid-event\b/, 'Cheers are highlighted');
twitchEvent('Follow', { id: 'follow-1', createdAt: now, user_name: 'Follower' });
assert.doesNotMatch(featurePage.chat.children.at(-1).className, /\bpaid-event\b/, 'Follows are not highlighted');

const rowsBeforeAltstream = featurePage.chat.children.length;
customEvent('bridge.altstream.reward_redemption', { userName: 'fan', displayName: 'Fan', rewardName: 'Hydrate', messageId: 'as-r1', createdAt: now });
customEvent('bridge.altstream.shoutout', { targetUserName: 'friend', targetDisplayName: 'Friend', gameName: 'Doom', messageId: 'as-s1', createdAt: now });
customEvent('bridge.altstream.raid_started', { targetDisplayName: 'Friend', messageId: 'as-raid1', createdAt: now });
customEvent('bridge.altstream.raid_cancelled', { messageId: 'as-raid2', createdAt: now });
customEvent('bridge.altstream.raid_received', { userName: 'raider', displayName: 'raider', viewers: 15, messageId: 'as-raid3', createdAt: now });
customEvent('bridge.altstream.highlighted_message', { userName: 'fan', displayName: 'Fan', message: 'look at me', messageId: 'as-h1', createdAt: now });
for (const hidden of ['follow', 'system_message', 'chat_pinned', 'chat_unpinned']) {
  customEvent(`bridge.altstream.${hidden}`, { userName: 'fan', messageId: `as-${hidden}`, createdAt: now });
}
assert.deepEqual(featurePage.chat.children.slice(rowsBeforeAltstream).map(rowText), [
  'Fan redeemed Hydrate', 'Shoutout: check out Friend — streaming Doom', 'Raid started to Friend', 'Raid cancelled',
  'raider is raiding with 15 viewers', 'look at me'
]);
assert(featurePage.chat.children.slice(rowsBeforeAltstream).every(row => row.dataset.platform === 'altstream'));
assert.match(featurePage.chat.children.at(-1).className, /\bchat-message\b.*\bpaid-event\b/, 'Highlighted messages render as accented chat');

const emoteRow = featurePage.chat.children.length;
twitchEvent('ChatMessage', { messageId: 'emote-1', createdAt: now, user: { name: 'Viewer' }, text: 'Hi Kappa',
  emotes: [{ Name: 'Kappa', StartIndex: 3, EndIndex: 7, ImageUrl: 'https://example.test/broken.png' }] });
const emoteBody = featurePage.chat.children[emoteRow].children[1].children[1];
const brokenImage = emoteBody.children.find(child => child.tagName === 'IMG');
brokenImage.onerror();
assert.equal(emoteBody.children.map(child => child.textContent).join(''), 'Hi Kappa', 'Broken emote images fall back to their name');

featurePage.document.scrollingElement = { scrollHeight: 1000, scrollTop: 0, clientHeight: 300 };
const jump = featurePage.elements.get('jump-latest');
// OBS sources cannot scroll: content that grew while a scene was hidden must not pause following.
twitchChat('stuck-1', 'u9', 'reader', 'after a scene switch');
assert(featurePage.chat.children.at(-1).scrollCount > 0, 'Without reader input, new rows stay pinned to the bottom');
assert.equal(jump.hidden, true, 'No new-messages button without reader input');
featurePage.fireWindow('scroll');
twitchChat('stuck-2', 'u9', 'reader', 'after a layout scroll');
assert(featurePage.chat.children.at(-1).scrollCount > 0, 'A scroll the reader did not cause does not pause following');
const pinnedRow = featurePage.chat.children.at(-1);
const pinnedScrolls = pinnedRow.scrollCount;
featurePage.fireWindow('resize');
assert(pinnedRow.scrollCount > pinnedScrolls, 'A resize keeps the newest row in view');
featurePage.fireWindow('keydown', { key: 'a' });
featurePage.fireWindow('scroll');
twitchChat('stuck-3', 'u9', 'reader', 'after typing');
assert(featurePage.chat.children.at(-1).scrollCount > 0, 'Ordinary keys do not pause following');
featurePage.fireWindow('wheel');
featurePage.fireWindow('scroll');
twitchChat('scroll-1', 'u9', 'reader', 'while scrolled up');
const pausedRow = featurePage.chat.children.at(-1);
assert.equal(pausedRow.scrollCount, 0, 'Reading older chat is not interrupted');
assert.equal(jump.hidden, false);
assert.match(jump.textContent, /1 new message/);
twitchChat('scroll-2', 'u9', 'reader', 'second');
assert.match(jump.textContent, /2 new messages/);
jump.listeners.click.forEach(callback => callback({}));
assert.equal(jump.hidden, true);
assert(featurePage.chat.children.at(-1).scrollCount > 0, 'Jump scrolls to the newest row');
featurePage.document.scrollingElement.scrollTop = 0;
featurePage.fireWindow('keydown', { key: 'PageUp' });
featurePage.fireWindow('scroll');
twitchChat('scroll-3', 'u9', 'reader', 'third');
assert.equal(featurePage.chat.children.at(-1).scrollCount, 0, 'Paging up pauses following');
assert.equal(jump.hidden, false);
featurePage.document.scrollingElement.scrollTop = 700;
featurePage.fireWindow('scroll');
assert.equal(jump.hidden, true, 'Scrolling back to the bottom resumes following');
twitchChat('scroll-4', 'u9', 'reader', 'fourth');
assert(featurePage.chat.children.at(-1).scrollCount > 0);
console.log('Standard shared chat feature tests passed.');
