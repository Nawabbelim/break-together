import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  push,
  onValue,
  onDisconnect,
  serverTimestamp,
  remove,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ⚠️ databaseURL is REQUIRED. Copy the exact URL shown at the top of
// Firebase Console → Build → Realtime Database → Data tab.
// US databases look like https://NAME-default-rtdb.firebaseio.com
// Other regions look like https://NAME-default-rtdb.asia-southeast1.firebasedatabase.app
const firebaseConfig = {
  apiKey: "AIzaSyAMGxg-3o-D__snzO13wwYVYtb1eV4B1EM",
  authDomain: "break-together-6661d.firebaseapp.com",
  databaseURL:
    "https://break-together-6661d-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "break-together-6661d",
  storageBucket: "break-together-6661d.firebasestorage.app",
  messagingSenderId: "613860085016",
  appId: "1:613860085016:web:29c0ccc92df319eb6fe26d",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);


const REASONS = [
  ["☕", "Tea / coffee"],
  ["🍫", "Let's take a break"],
  ["💬", "I want to talk"],
  ["👀", "A little gossip"],
  ["😂", "Let's bitch"],
  ["🚨", "This is serious"],
  ["🆘", "Emergency"],
  ["🥹", "I'm bored, let's break"],
  ["🌸", "Need fresh air"],
  ["🚶", "Walk / stretch"],
  ["😎", "Let's chill"],
  ["🥺", "Need your company"],
  ["🤭", "Something funny happened"],
  ["🤫", "Need to discuss something"],
  ["🌼", "Just breathe"],
  ["🍪", "Snack time"],
  ["🙋🏻", "Come here for a minute"],
];
const AVATARS = ["👩🏻‍💻", "👩🏽‍💻", "👩🏼‍🎤", "🧁", "🐰", "🐱", "🌸", "🍓", "🦋", "🐻"];

const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

let userId = sessionStorage.getItem("teaUserId") || crypto.randomUUID();
sessionStorage.setItem("teaUserId", userId);
const myEmoji =
  sessionStorage.getItem("teaEmoji") ||
  AVATARS[Math.floor(Math.random() * AVATARS.length)];
sessionStorage.setItem("teaEmoji", myEmoji);

let roomCode = "",
  userName = "",
  selectedReason = "Tea / coffee ☕";
let people = {},
  requests = {},
  stops = [],
  toastTimer,
  primed = false;
const seen = new Set(),
  fired = new Set();
let info = null, banned = {}, kept = false;

/* ---------- server-synced clock (fixes "two devices see different time") ---------- */
let serverOffset = 0;
const now = () => Date.now() + serverOffset;
onValue(ref(db, ".info/serverTimeOffset"), (v) => (serverOffset = v.val() || 0));

/* ---------- preferences ---------- */
let prefs = { sound: true, alerts: true };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem("teaPrefs") || "{}") }; } catch {}
const savePrefs = () => localStorage.setItem("teaPrefs", JSON.stringify(prefs));

/* ---------- helpers ---------- */
// Firebase promises NEVER fail when it can't reach the database - they just hang.
// This turns "hangs forever" into a visible error.
const T = (p, ms = 10000) =>
  Promise.race([
    p,
    new Promise((_, rej) =>
      setTimeout(
        () =>
          rej(
            new Error(
              "Can't reach the database. Check that databaseURL in script.js exactly matches the URL in Firebase Console → Realtime Database, and that your rules allow read/write.",
            ),
          ),
        ms,
      ),
    ),
  ]);
const cleanCode = (v) =>
  v
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 12);
const R = (path) => ref(db, `rooms/${roomCode}/${path}`);
const showError = (e) => {
  console.error(e);
  const m = e.message || String(e);
  $("setupError").textContent = m;
  toast(m);
};

function toast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3000);
}
let pip = null; // floating always-on-top window (Document Picture-in-Picture)

/* sounds (Web Audio, no files needed) */
let actx;
function audio() {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    return actx;
  } catch { return null; }
}
["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, audio, { passive: true }));
function tone(f, t, dur, vol) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function playSound(kind = "chime") {
  if (!prefs.sound) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.03;
  if (kind === "bell")
    [0, 0.55].forEach((d) =>
      [[880, 0.16, 1.4], [2429, 0.07, 0.9], [4752, 0.04, 0.5], [7860, 0.02, 0.3]].forEach(([f, v, dur]) => tone(f, t + d, dur, v)));
  else if (kind === "ready")
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, t + i * 0.11, 0.7, 0.12));
  else [660, 880].forEach((f, i) => tone(f, t + i * 0.13, 0.4, 0.1));
}

/* browser notifications */
const ICON = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">☕</text></svg>');
const notifState = () =>
  !("Notification" in window) || !window.isSecureContext ? "unsupported" : Notification.permission;
async function showOS(body, tag) {
  if (notifState() !== "granted" || !prefs.alerts) return;
  const opts = { body, tag, icon: ICON, badge: ICON, renotify: !!tag, vibrate: [150, 80, 150] };
  try {
    const n = new Notification("Tea Break Together ☕", opts);
    n.onclick = () => { window.focus(); n.close(); };
  } catch {}
}
function notify(msg, o = {}) {
  toast(msg);
  playSound(o.sound || "chime");
  if (!pip && document.hidden) showOS(msg, o.tag);
  const w = $("miniWidget");
  if (w) {
    w.classList.add("alert");
    setTimeout(() => w.classList.remove("alert"), 4000);
  }
}

/* keep the tab alive while it's in the background */
function keepAlive() {
  if (kept) return;
  kept = true;
  try { navigator.locks?.request("tea-keepalive", () => new Promise(() => {})); } catch {}
  // Chrome may auto-open the floating window when you switch tabs (best-effort)
  try { navigator.mediaSession?.setActionHandler("enterpictureinpicture", () => openPip()); } catch {}
}

function burst(n = 26) {
  const ems = ["💗", "✨", "☕", "🌸", "⭐", "🎉", "💖"];
  for (let i = 0; i < n; i++) {
    const s = document.createElement("span");
    s.className = "confetti";
    s.textContent = ems[i % ems.length];
    const a = Math.random() * Math.PI * 2,
      d = 90 + Math.random() * 190;
    s.style.cssText = `--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 60}px;--r:${Math.random() * 720 - 360}deg`;
        (pip?.document || document).body.appendChild(s);
    setTimeout(() => s.remove(), 1400);
  }
}

/* ---------- room lifetime: auto-delete after 2 idle days, except the permanent room ---------- */
const PERM_ROOM = "3N"; // never deleted; first person to join becomes its admin
const STALE_MS = 2 * 24 * 3600 * 1000;
let lastTouch = 0;
function touch(force = false) {
  if (!roomCode) return;
  const t = now();
  if (!force && t - lastTouch < 300000) return; // at most every 5 min
  lastTouch = t;
  update(ref(db), { [`rooms/${roomCode}/info/lastActive`]: t, [`roomIndex/${roomCode}`]: t }).catch(() => {});
}
setInterval(() => touch(), 600000); // being in the room counts as activity
async function sweepStale() {
  try {
    const idx = (await T(get(ref(db, "roomIndex")), 8000)).val() || {};
    for (const [code, last] of Object.entries(idx))
      if (code !== PERM_ROOM && now() - last > STALE_MS)
        await update(ref(db), { [`rooms/${code}`]: null, [`roomIndex/${code}`]: null });
  } catch {}
}

/* ---------- room enter / create ---------- */
const adminIds = () => { try { return JSON.parse(localStorage.getItem("teaAdminIds") || "{}"); } catch { return {}; } };
const isAdmin = () => !!info && (info.createdBy === userId || !!info.admins?.[userId]);
const isOwner = (id = userId) => !!info && info.createdBy === id;

async function enterRoom(code, create, auto = false) {
  userName = $("nameInput").value.trim();
  roomCode = cleanCode(code);
  if (!userName || !roomCode) {
    roomCode = "";
    $("setupError").textContent = "Add your name and a room code first 💗";
    return;
  }
  $("setupError").textContent = "Connecting… ☕";
  $("createBtn").disabled = $("joinBtn").disabled = true;
  info = null;
  try {
    const snap = await T(get(R("info")));
    let exists = snap.exists(), inf = snap.val() || {};
    const perm = roomCode === PERM_ROOM;
    if (exists && !perm && inf.lastActive && now() - inf.lastActive > STALE_MS) {
      await T(update(ref(db), { [`rooms/${roomCode}`]: null, [`roomIndex/${roomCode}`]: null }));
      exists = false; inf = {}; // expired -> behaves like it never existed
    }
    if (perm) create = !exists; // first one into 3N creates it and becomes admin
    if (create && exists)
      throw new Error("That room code is already taken — pick another, or press Join room 💗");
    if (!create && !exists) throw new Error("Room not found 🥺 Check the code or create it.");
    // get my admin identity back if I come back on this device
    const saved = adminIds()[roomCode];
    if (exists && saved && (inf.createdBy === saved || inf.admins?.[saved])) {
      userId = saved;
      sessionStorage.setItem("teaUserId", userId);
    }
    if (exists) {
      if ((await T(get(R(`banned/${userId}`)))).exists())
        throw new Error("An admin removed you from this room 🚫");
      const member = (await T(get(R(`people/${userId}`)))).exists();
      const adm = inf.createdBy === userId || inf.admins?.[userId];
      if (inf.locked && !member && !adm)
        throw new Error("This room is locked 🔒 Ask the admin to unlock it.");
      // names must be unique inside a room
      const all = (await T(get(R("people")))).val() || {};
      const clash = Object.entries(all).find(
        ([u, p]) => u !== userId && p?.name && p.name.toLowerCase() === userName.toLowerCase());
      if (clash) {
        const keeper = clash[1].online !== false || inf.createdBy === clash[0] || inf.admins?.[clash[0]];
        if (keeper) throw new Error(`The name "${userName}" is already taken in this room — pick another 💗`);
        await T(remove(R(`people/${clash[0]}`))); // an old offline entry frees its name
      }
    }
    if (create)
      await T(set(R("info"), {
        createdAt: serverTimestamp(),
        name: roomCode,
        createdBy: userId,
        admins: { [userId]: true },
        locked: false,
        permanent: perm,
        lastActive: now(),
      }));
    await T(set(R(`people/${userId}`), {
      name: userName, emoji: myEmoji, online: true, joinedAt: serverTimestamp(),
    }));
    onDisconnect(R(`people/${userId}`)).update({ online: false });
    $("setupError").textContent = "";
    $("setup").hidden = true;
    $("roomView").hidden = false;
    document.body.classList.add("in-room");
    localStorage.setItem("teaSession", JSON.stringify({ name: userName, room: roomCode }));
    localStorage.setItem("teaName", userName);
    startListening();
    touch(true);
    if (!auto) sendMsg(`${userName} joined the room 🌸`, true);
    toast(create ? "Room created — you're the admin 👑" : "You're in the break club! 🌷");
    keepAlive();
    if (notifState() === "default") setTimeout(() => toast("Tip: tap 🔔 to turn on notifications"), 3500);
  } catch (e) {
    roomCode = "";
    if (auto) localStorage.removeItem("teaSession");
    showError(e);
  } finally {
    $("createBtn").disabled = $("joinBtn").disabled = false;
  }
}

function startListening() {
  stops.forEach((x) => x());
  stops = [];
  primed = false;
  seen.clear();
  stops.push(onValue(R("info"), (v) => {
    const was = info;
    info = v.val();
    if (!info) { if (was) forceLeave("This room was deleted by the owner 🗑"); return; }
    if (isAdmin()) {
      const a = adminIds(); a[roomCode] = userId;
      localStorage.setItem("teaAdminIds", JSON.stringify(a));
    }
    renderRoomHeader(); renderAdmin(); renderPeople(); renderRequests();
  }, showError));
  stops.push(onValue(R(`banned/${userId}`), (v) => v.exists() && forceLeave("An admin removed you from this room 🚫")));
  stops.push(onValue(R("banned"), (v) => { banned = v.val() || {}; renderAdmin(); }));
  stops.push(onValue(R("people"), (v) => { people = v.val() || {}; renderPeople(); renderRequests(); }, showError));
  stops.push(onValue(R("requests"), (v) => {
    requests = v.val() || {};
    renderRequests();
    try { detectNew(); } catch (err) { console.error(err); }
    primed = true;
  }, showError));
  stops.push(onValue(R("messages"), (v) => renderChat(v.val() || {}), showError));
}

function renderRoomHeader() {
  const nm = info?.name && info.name !== roomCode ? `${info.name} · ${roomCode}` : `Room ${roomCode}`;
  $("roomTitle").textContent = nm;
  $("roomSub").textContent =
    (info?.locked ? "🔒 Locked — no new people can join. " : "Share this code with your friends: " + roomCode + ". ") +
    (roomCode === PERM_ROOM ? "♾ Permanent room. " : "") +
    (isOwner() ? "You're the owner 👑" : isAdmin() ? "You're an admin ⭐" : "");
}

function teardown() {
  stops.forEach((x) => x());
  stops = [];
  roomCode = "";
  people = {}; requests = {}; info = null; banned = {};
  $("roomView").hidden = true;
  $("setup").hidden = false;
  $("adminPanel").hidden = true;
  document.body.classList.remove("in-room");
  localStorage.removeItem("teaSession");
}
function forceLeave(msg) {
  try { onDisconnect(R(`people/${userId}`)).cancel(); } catch {}
  teardown();
  $("setupError").textContent = msg;
  toast(msg);
}

/* ---------- admin controls ---------- */
function renderAdmin() {
  const p = $("adminPanel");
  p.hidden = !(roomCode && isAdmin());
  if (p.hidden) return;
  const bl = Object.entries(banned);
  $("adminBody").innerHTML = `
    <div class="admin-grid">
      <button class="secondary small" data-admin="lock">${info.locked ? "🔓 Unlock room" : "🔒 Lock room (no new joins)"}</button>
      <button class="secondary small" data-admin="rename">✏️ Rename room</button>
      <button class="secondary small" data-admin="clearchat">🧹 Clear chat</button>
      <button class="secondary small" data-admin="clearreq">🗑 Clear requests</button>
      ${isOwner() && roomCode !== PERM_ROOM ? '<button class="decline" data-admin="delete">💥 Delete room</button>' : ""}
    </div>
    <p class="hint" style="margin:10px 8px 0">👑 owner · ⭐ admin. Use ⭐ / 🚫 next to a person to make them admin or remove them.</p>
    <h4>Removed people</h4>
    ${bl.length ? bl.map(([u, b]) => `<div class="banned"><span>${esc(b.name)}</span><button class="secondary small" data-admin="unban" data-uid="${esc(u)}">Allow back</button></div>`).join("") : '<p class="hint" style="margin:0 8px">Nobody removed.</p>'}`;
}

async function adminClick(e) {
  const b = e.target.closest("[data-admin]");
  if (!b || !roomCode || !isAdmin()) return;
  const { admin: a, uid } = b.dataset;
  try {
    if (a === "kick") {
      const p = people[uid];
      if (!p || uid === userId || isOwner(uid)) return;
      if (info.admins?.[uid] && !isOwner()) return toast("Only the owner can remove another admin 💗");
      if (!confirm(`Remove ${p.name} from the room?`)) return;
      await T(update(ref(db, `rooms/${roomCode}`), {
        [`people/${uid}`]: null,
        [`info/admins/${uid}`]: null,
        [`banned/${uid}`]: { name: p.name, at: now(), by: userId },
      }));
      sendMsg(`${p.name} was removed by an admin 🚫`, true);
    } else if (a === "promote") {
      await T(set(R(`info/admins/${uid}`), true));
      sendMsg(`${people[uid]?.name || "Someone"} is now an admin ⭐`, true);
    } else if (a === "demote") {
      if (isOwner()) await T(remove(R(`info/admins/${uid}`)));
    } else if (a === "lock") await T(update(R("info"), { locked: !info.locked }));
    else if (a === "rename") {
      const n = prompt("New room name", info.name || roomCode);
      if (n?.trim()) await T(update(R("info"), { name: n.trim().slice(0, 24) }));
    } else if (a === "clearchat") {
      if (confirm("Clear the whole chat?")) await T(remove(R("messages")));
    } else if (a === "clearreq") {
      if (confirm("Remove all break requests?")) await T(remove(R("requests")));
    } else if (a === "unban") await T(remove(R(`banned/${uid}`)));
    else if (a === "delete") {
      if (isOwner() && roomCode !== PERM_ROOM && confirm("Delete this room for everyone? This can't be undone."))
        await T(remove(ref(db, `rooms/${roomCode}`)));
    }
  } catch (err) { toast(err.message); }
}

/* ---------- people ---------- */
function renderPeople() {
  const t = now(), adm = isAdmin();
  $("peopleList").innerHTML =
    Object.entries(people)
      .filter(([, p]) => p && p.name)
      .map(([id, p]) => {
        const waiting = Object.values(requests).some(
          (r) => r.responses?.[id]?.status === "wait" && r.responses[id].waitUntil > t);
        const state = p.online === false ? "Away 💤" : waiting ? "Waiting ⏰" : "Available ✨";
        const isAd = !!info?.admins?.[id];
        const badge = isOwner(id) ? " 👑" : isAd ? " ⭐" : "";
        const canManage = adm && id !== userId && !isOwner(id) && (!isAd || isOwner());
        const role = isAd
          ? isOwner() ? `<button data-admin="demote" data-uid="${esc(id)}" title="Remove admin rights">⭐✕</button>` : ""
          : `<button data-admin="promote" data-uid="${esc(id)}" title="Make admin">⭐</button>`;
        const tools = canManage
          ? `<span class="person-tools">${role}<button data-admin="kick" data-uid="${esc(id)}" title="Remove from room">🚫</button></span>` : "";
        return `<div class="person ${p.online === false ? "away" : ""}"><span class="avatar">${esc(p.emoji || "🌸")}</span><div><div class="person-name">${esc(p.name)}${esc(badge)}${id === userId ? " (you)" : ""}</div><div class="person-state">${state}</div></div>${tools}</div>`;
      })
      .join("") || '<p class="empty">Invite a friend using this room code 🌸</p>';
}

/* ---------- requests ---------- */
const isOpen = (r) =>
  r.status !== "closed" &&
  r.status !== "started" &&
  now() - (r.createdAt || 0) < 7200000;
// a finished wait counts as "ready" on every device (no need for the waiter's tab to write it)
const effSt = (x) => (x.status === "wait" && x.waitUntil <= now() ? "ready" : x.status);
const respOf = (r, st) =>
  Object.entries(r.responses || {}).filter(
    ([u, x]) => u !== r.from && st.includes(effSt(x)),
  );

function renderRequests() {
  const list = Object.entries(requests)
    .filter(
      ([, r]) =>
        r.status !== "closed" && now() - (r.createdAt || 0) < 7200000,
    )
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0))
    .slice(0, 8);
  $("requestsList").innerHTML = list.length
    ? list
        .map(([id, r]) => {
          const mine = r.from === userId,
            started = r.status === "started";
          const yes = respOf(r, ["yes", "ready"]),
            waits = respOf(r, ["wait"]),
            no = respOf(r, ["no"]);
          const mins = Math.max(
            0,
            Math.round((now() - r.createdAt) / 60000),
          );
          const my = r.responses?.[userId]?.status;
          const banner = yes.length
            ? `<div class="ready-banner">${yes.length === 1 ? "BOTH READY! 🎉" : "EVERYONE'S READY! 🎉"} ✨<small>Tea break together! ☕💗 — ${yes.map(([, x]) => esc(x.name)).join(", ")} + ${esc(r.name)}</small></div>`
            : "";
          const waitLines = waits
            .map(
              ([, x]) =>
                `<div class="waitline">${esc(x.name)} will be ready in <span class="cd" data-until="${x.waitUntil}"></span> ⏰</div>`,
            )
            .join("");
          const readyLines = respOf(r, ["ready"])
            .map(
              ([, x]) =>
                `<div class="waitline">${esc(x.name)} is ready now ✨</div>`,
            )
            .join("");
          const noLine = no.length
            ? `<div class="request-meta">Can't now: ${no.map(([, x]) => esc(x.name)).join(", ")} 💗</div>`
            : "";
          let actions = "";
          if (started)
            actions = `<div class="request-meta">☕ Break started — enjoy!</div>`;
          else if (mine)
            actions = `<div class="request-actions">${yes.length ? `<button class="primary" data-act="start" data-id="${id}">We're going! 🚶‍♀️</button>` : ""}<button class="secondary" data-act="close" data-id="${id}">Cancel request</button></div>`;
          else
            actions = `<div class="request-actions"><button class="agree" data-act="yes" data-id="${id}">I'm in ☕${my === "yes" ? " ✓" : ""}</button>${[2, 5, 10, 15].map((m) => `<button class="wait" data-act="wait" data-min="${m}" data-id="${id}">⏰ ${m}m</button>`).join("")}<button class="wait" data-act="wait" data-min="custom" data-id="${id}">⏰ …</button><button class="decline" data-act="no" data-id="${id}">Can't now 💗${my === "no" ? " ✓" : ""}</button>${isAdmin() ? `<button class="secondary" data-act="close" data-id="${id}" title="Admin: remove this request">🗑</button>` : ""}</div>`;
          return `<article class="request-card ${mine ? "mine" : ""}"><div class="request-head"><span class="request-who">${esc(r.name)}${mine ? " (you)" : ""} wants a break</span><span class="request-meta">${mins} min ago · ${yes.length} in · ${waits.length} waiting</span></div><div class="request-reason">${esc(r.reason)}</div>${banner}${waitLines}${readyLines}${noLine}${actions}</article>`;
        })
        .join("")
    : '<p class="empty">No break requests yet. Be the first 🌸</p>';
  renderMini();
  tick();
}

function renderMini() {
  const rs = Object.entries(requests)
    .filter(([, r]) => isOpen(r))
    .sort((a, b) => b[1].createdAt - a[1].createdAt);
  const open = rs.find(([, r]) => r.from !== userId && !r.responses?.[userId]);
  const mineOpen = rs.find(([, r]) => r.from === userId);
  const answered = rs.find(
    ([, r]) => r.from !== userId && r.responses?.[userId],
  );
  const box = $("miniActions"),
    st = $("miniStatus");
  box.innerHTML = "";
  $("miniWidget").classList.toggle("has-req", !!open);
  if (open) {
    const [id, r] = open;
    st.textContent = `${r.name} wants: ${r.reason}`;
    box.innerHTML = `<button class="agree" data-act="yes" data-id="${id}">Break together 🤙</button><button class="wait" data-act="wait" data-min="5" data-id="${id}">Wait 5 min ⏰</button>`;
  } else if (mineOpen) {
    const [id, r] = mineOpen,
      yes = respOf(r, ["yes", "ready"]);
    const ws = respOf(r, ["wait"]);
    if (yes.length) st.textContent = `🎉 ${yes.map(([, x]) => x.name).join(", ")} ready for tea!`;
    else if (ws.length)
      st.innerHTML = `⏰ ${esc(ws[0][1].name)} ready in <span class="cd" data-until="${ws[0][1].waitUntil}"></span>`;
    else st.textContent = "Waiting for friends… 💌";
    if (yes.length)
      box.innerHTML = `<button class="primary" data-act="start" data-id="${id}">We're going! 🚶‍♀️</button>`;
  } else if (answered) {
    const [, r] = answered,
      x = r.responses[userId];
    st.innerHTML =
      effSt(x) === "wait"
        ? `⏰ Ready for ${esc(r.name)} in <span class="cd" data-until="${x.waitUntil}"></span>`
        : x.status === "no"
          ? "No worries 💗"
          : `☕ You're in with ${esc(r.name)}!`;
  } else st.textContent = "All quiet… ready for a tiny break?";
}

async function askBreak(e) {
  if (!roomCode) return toast("Join a room first 💗");
  const reason =
    e?.currentTarget?.id === "miniRequestBtn"
      ? $("miniReason").value
      : $("customReason").value.trim() || selectedReason;
  try {
    await T(
      set(push(R("requests")), {
        from: userId,
        name: userName,
        reason,
        createdAt: now(),
        status: "open",
      }),
    );
    $("customReason").value = "";
    toast("Break request sent to everyone! 💌");
    touch();
  } catch (e) {
    toast(e.message);
  }
}

async function respond(id, status, min) {
  const data = {
    status,
    name: userName,
    updatedAt: now(),
    waitUntil: null,
    waitMinutes: null,
  };
  if (status === "wait") {
    data.waitMinutes = min;
    data.waitUntil = now() + min * 60000;
  }
  try {
    await T(update(R(`requests/${id}/responses/${userId}`), data));
    touch();
    toast(
      status === "yes"
        ? "Yay, you're in! ☕"
        : status === "wait"
          ? `I'll be ready in ${min} min ⏰`
          : status === "ready"
            ? "You're ready! 🎉"
            : "No worries 💗",
    );
    if (status === "yes") burst(14);
    if (status === "yes")
      sendMsg(`${userName} agreed to the tea break ☕`, true);
  } catch (e) {
    toast(e.message);
  }
}

function handleAct(e) {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const { act, id } = b.dataset;
  if (act === "start") {
    update(R(`requests/${id}`), { status: "started" });
    sendMsg("Tea break together! ☕💗", true);
  } else if (act === "close") update(R(`requests/${id}`), { status: "closed" });
  else if (act === "wait") {
    let m = b.dataset.min;
    if (m === "custom") {
      m = parseInt(prompt("Wait how many minutes? (1–120)", "7"), 10);
      if (!(m >= 1 && m <= 120)) return;
    }
    respond(id, "wait", Number(m));
  } else respond(id, act);
}

/* ---------- live notifications (diff each snapshot) ---------- */
function detectNew() {
  for (const [id, r] of Object.entries(requests)) {
    const k = "r:" + id;
    if (!seen.has(k)) {
      seen.add(k);
      if (primed && r.from !== userId && isOpen(r))
        notify(`${r.name} wants a break: ${r.reason}`, { tag: id });
    }
    for (const [u, x] of Object.entries(r.responses || {})) {
      const rk = `${id}:${u}:${x.status}:${x.updatedAt}`;
      if (seen.has(rk)) continue;
      seen.add(rk);
      if (!primed || r.from !== userId || u === userId) continue;
           if (x.status === "yes" || x.status === "ready") {
        try {
          burst();
        } catch {}
      }
      notify(
        x.status === "yes"
          ? `${x.name} agreed to your break ☕`
          : x.status === "wait"
            ? `${x.name} will be ready in ${x.waitMinutes} min ⏰`
            : x.status === "ready"
              ? `${x.name} is ready now! 🎉`
              : `${x.name} can't right now 💗`,
      );
    }
  }
}

/* ---------- countdowns, 5-second bell, ready alert ---------- */
// Everyone uses now() = server time, so both devices ring at the same moment.
function tick() {
  const t = now();
  [document, pip?.document]
    .filter(Boolean)
    .flatMap((d) => [...d.querySelectorAll(".cd")])
    .forEach((el) => {
      const ms = el.dataset.until - t;
      const sec = Math.max(0, Math.ceil(ms / 1000));
      const txt = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
      if (el.textContent !== txt) el.textContent = txt;
      el.classList.toggle("soon", ms <= 5000);
    });
  if (!roomCode) return;
  let redraw = false;
  for (const [id, r] of Object.entries(requests)) {
    if (!isOpen(r)) continue;
    for (const [u, x] of Object.entries(r.responses || {})) {
      if (x.status !== "wait" || !x.waitUntil) continue;
      if (u !== userId && r.from !== userId) continue; // only the two people involved
      const left = x.waitUntil - t, me = u === userId;
      const kPre = `pre:${id}:${u}:${x.waitUntil}`, kEnd = `end:${id}:${u}:${x.waitUntil}`;
      if (left <= 5000 && !fired.has(kPre)) {
        fired.add(kPre);
        if (left > 0)
          notify(me ? `⏰ 5 seconds! Get ready for ${r.name} ☕` : `⏰ ${x.name} is ready in 5 seconds!`,
            { sound: "bell", tag: kPre });
      }
      if (left <= 0 && !fired.has(kEnd)) {
        fired.add(kEnd);
        redraw = true;
        if (left > -15000) {
          notify(me ? `🎉 Break time! Go to ${r.name} ☕💗` : `🎉 ${x.name} is ready now! Tea break time ☕`,
            { sound: "ready", tag: kEnd });
          try { burst(); } catch {}
        }
      }
    }
  }
  if (redraw) { renderPeople(); renderRequests(); }
}
// a Worker timer isn't slowed down in background tabs
let tickWorker;
try {
  tickWorker = new Worker(URL.createObjectURL(new Blob(["setInterval(()=>postMessage(1),250)"], { type: "text/javascript" })));
  tickWorker.onmessage = tick;
} catch { setInterval(tick, 250); }

/* ---------- chat ---------- */
function sendMsg(text, system = false) {
  if (!roomCode || !text) return;
  touch();
  push(R("messages"), {
    from: userId,
    name: userName,
    text,
    system,
    createdAt: now(),
  }).catch(console.error);
}
function renderChat(msgs) {
  const list = Object.values(msgs)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-30);
  const log = $("chatLog");
  log.innerHTML = list
    .map((m) =>
      m.system
        ? `<div class="msg system">${esc(m.text)}</div>`
        : `<div class="msg ${m.from === userId ? "me" : ""}"><b>${esc(m.name)}</b> ${esc(m.text)}</div>`,
    )
    .join("");
  log.scrollTop = log.scrollHeight;
}

/* ---------- leave ---------- */
async function leave() {
  if (!roomCode) return;
  sendMsg(`${userName} left 👋`, true);
  try { onDisconnect(R(`people/${userId}`)).cancel(); } catch {}
  await remove(R(`people/${userId}`)).catch(() => {});
  teardown();
}

/* ---------- wiring ---------- */
$("reasons").innerHTML = REASONS.map(
  ([e, l], i) =>
    `<button class="reason ${i === 0 ? "selected" : ""}" data-reason="${esc(l)} ${e}">${e}<span>${esc(l)}</span></button>`,
).join("");
$("reasons").addEventListener("click", (e) => {
  const b = e.target.closest("[data-reason]");
  if (!b) return;
  document
    .querySelectorAll(".reason")
    .forEach((x) => x.classList.remove("selected"));
  b.classList.add("selected");
  selectedReason = b.dataset.reason;
  $("customReason").value = "";
});
$("createBtn").addEventListener("click", () =>
  enterRoom(
    $("roomInput").value || Math.random().toString(36).slice(2, 7),
    true,
  ),
);
$("joinBtn").addEventListener("click", () =>
  enterRoom($("roomInput").value, false),
);
$("requestBtn").addEventListener("click", askBreak);
$("miniRequestBtn").addEventListener("click", askBreak);
$("requestsList").addEventListener("click", handleAct);
$("miniActions").addEventListener("click", handleAct);
$("leaveBtn").addEventListener("click", leave);
$("copyBtn").addEventListener("click", () =>
  navigator.clipboard
    ?.writeText(roomCode)
    .then(() => toast("Room code copied 💗")),
);
$("chatSend").addEventListener("click", () => {
  sendMsg($("chatInput").value.trim());
  $("chatInput").value = "";
});
$("chatInput").addEventListener(
  "keydown",
  (e) => e.key === "Enter" && $("chatSend").click(),
);
$("reacts").addEventListener(
  "click",
  (e) => e.target.tagName === "BUTTON" && sendMsg(e.target.textContent),
);
/* ---------- notification settings ---------- */
function updateBell() {
  const st = notifState(), b = $("notifBtn"), on = st === "granted" && prefs.alerts;
  b.textContent = st === "denied" || st === "unsupported" ? "⛔" : on ? "🔔" : "🔕";
  b.classList.toggle("blocked", st === "denied" || st === "unsupported");
  b.classList.toggle("on", on);
  b.title = { granted: on ? "Notifications on — click for settings" : "Pop-ups muted — click for settings",
    denied: "Notifications are blocked — click to see how to fix", default: "Turn on notifications",
    unsupported: "Notifications not available — click for details" }[st];
}
function renderNotif() {
  const st = notifState();
  const pill = { granted: ["✅ On", "ok"], denied: ["⛔ Blocked in your browser", "bad"],
    default: ["🔕 Not turned on yet", "warn"], unsupported: ["🚫 Not available here", "bad"] }[st];
  $("ndStatus").className = "nd-status " + pill[1];
  $("ndStatus").textContent = pill[0];
  $("ndText").textContent = {
    granted: "You'll get pop-ups when a friend asks for a break and you're on another tab. Sounds and the 5-second bell follow the switches below.",
    default: "Allow notifications to get pinged when a friend asks for a break while you're on another tab.",
    denied: "Browsers only ask once, so pressing the bell again can't change it. Fix it in site settings:",
    unsupported: window.isSecureContext
      ? "This browser has no web notifications. (iPhone: Share → Add to Home Screen, then open it from the home screen.)"
      : "Notifications need a secure page. Open the app with Live Server (http://127.0.0.1…) or https://, not a file:// link.",
  }[st];
  $("ndSteps").hidden = st !== "denied";
  const btn = (k, l) => `<button class="primary" data-nd="${k}">${l}</button>`;
  $("ndActions").innerHTML = st === "default" ? btn("allow", "Turn on notifications 🔔")
    : st === "granted" ? btn("test", "Send a test 🔔")
    : st === "denied" ? btn("recheck", "I've allowed it — check again ✅") : "";
  $("ndSound").checked = prefs.sound;
  $("ndAlerts").checked = prefs.alerts;
}
$("notifBtn").addEventListener("click", () => { renderNotif(); $("notifDialog").showModal(); });
$("ndClose").addEventListener("click", () => $("notifDialog").close());
$("notifDialog").addEventListener("click", (e) => e.target === $("notifDialog") && $("notifDialog").close());
$("notifDialog").addEventListener("click", async (e) => {
  const k = e.target.closest("[data-nd]")?.dataset.nd;
  if (!k) return;
  if (k === "allow") { await Notification.requestPermission(); }
  else if (k === "test") { showOS("It works! You'll be pinged here 💗", "test"); playSound("bell"); }
  else if (k === "recheck" && notifState() === "denied") toast("Still blocked — change it in the site settings, then try again 💗");
  updateBell(); renderNotif();
});
$("ndSound").addEventListener("change", (e) => { prefs.sound = e.target.checked; savePrefs(); });
$("ndAlerts").addEventListener("change", (e) => { prefs.alerts = e.target.checked; savePrefs(); updateBell(); });
try {
  navigator.permissions?.query({ name: "notifications" }).then((p) => {
    p.onchange = () => { updateBell(); renderNotif(); }; // updates live when you change it in site settings
  });
} catch {}
$("peopleList").addEventListener("click", adminClick);
$("adminBody").addEventListener("click", adminClick);
updateBell();
if ($("miniReason")) $("miniReason").innerHTML = REASONS.map(
  ([e, l]) => `<option value="${esc(l)} ${e}">${e} ${esc(l)}</option>`,
).join("");

async function openPip() {
  if (pip) return;
  if (!("documentPictureInPicture" in window)) {
    $("miniWidget").hidden = false;
    $("reopenBtn").hidden = true;
    return toast(
      "Floating over other apps needs Chrome or Edge on desktop 💗 (showing in-page widget)",
    );
  }
  try {
    const w = $("miniWidget");
    pip = await documentPictureInPicture.requestWindow({
      width: 340,
      height: 300,
    });
    const l = pip.document.createElement("link");
    l.rel = "stylesheet";
    l.href = new URL("style.css", location.href).href;
    pip.document.head.append(l);
    pip.document.body.className = "pip-body";
    ["pointerdown", "keydown"].forEach((ev) => pip.document.addEventListener(ev, audio, { passive: true }));
    pip.document.documentElement.style.overflow = "hidden";
    w.classList.add("pip");
    w.hidden = false;
    pip.document.body.append(w);
    pip.setInterval(tick, 1000); // runs in the visible window, so countdowns aren't throttled
    pip.addEventListener("pagehide", () => {
      w.classList.remove("pip");
      w.hidden = true;
      document.body.append(w);
      pip = null;
      $("reopenBtn").hidden = false;
    });
    $("reopenBtn").hidden = true;
    toast("Floating buddy is on ☕ It stays on top while you work");
  } catch (e) {
    pip = null;
    toast("Couldn't open the floating window: " + e.message);
  }
}
$("compactBtn").addEventListener("click", openPip);
$("reopenBtn").addEventListener("click", openPip);
$("expandBtn").addEventListener("click", () => {
  $("app").hidden = false;
  window.focus();
  if (pip)
    toast(
      "Use the back-to-tab icon on the floating window if this tab didn't come forward 💗",
    );
  else $("miniWidget").hidden = true;
});
$("hideBtn").addEventListener("click", () => {
  $("app").hidden = true;
  $("reopenBtn").hidden = false;
});
$("miniHideBtn").addEventListener("click", () => {
  if (pip) pip.close();
  else {
    $("miniWidget").hidden = true;
    $("reopenBtn").hidden = false;
  }
});

/* ---------- extra cuteness: floating background + confetti + ripple ---------- */
const bg = $("bg");
if (bg) {
  ["💗", "✨", "☕", "🌸", "⭐", "🫧", "🍓", "💕"].forEach((e, i) => {
    for (let k = 0; k < 2; k++) {
      const s = document.createElement("span");
      s.textContent = e;
      s.style.cssText = `left:${(i * 12.5 + k * 6 + Math.random() * 5) % 100}%;font-size:${14 + Math.random() * 20}px;animation-duration:${14 + Math.random() * 14}s;animation-delay:${-Math.random() * 20}s`;
      bg.appendChild(s);
    }
  });
}

document.addEventListener("pointerdown", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const r = b.getBoundingClientRect(),
    w = document.createElement("i");
  w.className = "ripple";
  w.style.cssText = `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px`;
  b.appendChild(w);
  setTimeout(() => w.remove(), 600);
});

/* ---------- startup: remember me + auto re-join after reload ---------- */
sweepStale();
try {
  $("nameInput").value = localStorage.getItem("teaName") || "";
  const sess = JSON.parse(localStorage.getItem("teaSession") || "null");
  if (sess?.name && sess?.room) {
    $("nameInput").value = sess.name;
    $("roomInput").value = sess.room;
    enterRoom(sess.room, false, true);
  }
} catch {}
