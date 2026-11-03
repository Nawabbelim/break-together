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
  autoReady = new Set();

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
  $("setupError").textContent = e.message || String(e);
};

function toast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3000);
}
let pip = null; // floating always-on-top window (Document Picture-in-Picture)
function chime() {
  try {
    const c = chime.c || (chime.c = new AudioContext());
    [660, 880].forEach((f, i) => {
      const t = c.currentTime + i * 0.13,
        o = c.createOscillator(),
        g = c.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.4);
    });
  } catch {}
}
function notify(msg) {
  toast(msg);
  chime();
  if (
    !pip &&
    "Notification" in window &&
    Notification.permission === "granted" &&
    document.hidden
  ) {
    const n = new Notification("Tea Break Together ☕", { body: msg });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  }
  const w = $("miniWidget");
  w.classList.add("alert");
  setTimeout(() => w.classList.remove("alert"), 4000);
}

/* ---------- room enter / create ---------- */
async function enterRoom(code, create) {
  userName = $("nameInput").value.trim();
  roomCode = cleanCode(code);
  if (!userName || !roomCode) {
    roomCode = "";
    $("setupError").textContent = "Add your name and a room code first 💗";
    return;
  }
  $("setupError").textContent = "Connecting… ☕";
  $("createBtn").disabled = $("joinBtn").disabled = true;
  try {
    const exists = (await T(get(R("info")))).exists();
    if (create && exists)
      throw new Error(
        "That room code is already taken — pick another, or press Join room 💗",
      );
    if (!create && !exists)
      throw new Error("Room not found 🥺 Check the code or create it.");
    if (create)
      await T(
        set(R("info"), {
          createdAt: serverTimestamp(),
          name: roomCode,
          createdBy: userId,
        }),
      );
    await T(
      set(R(`people/${userId}`), {
        name: userName,
        emoji: myEmoji,
        online: true,
        joinedAt: serverTimestamp(),
      }),
    );
    onDisconnect(R(`people/${userId}`)).update({ online: false });
    $("setupError").textContent = "";
    $("setup").hidden = true;
    $("roomView").hidden = false;
    document.body.classList.add("in-room");
    $("roomTitle").textContent = `Room ${roomCode}`;
    $("roomSub").textContent = "Share this code with your friends: " + roomCode;
    startListening();
    sendMsg(`${userName} joined the room 🌸`, true);
    toast("You're in the break club! 🌷");
  } catch (e) {
    roomCode = "";
    showError(e);
  } finally {
    $("createBtn").disabled = $("joinBtn").disabled = false;
  }
}

function startListening() {
  stops.forEach((s) => s());
  stops = [];
  primed = false;
  seen.clear();
  stops.push(
    onValue(
      R("people"),
      (s) => {
        people = s.val() || {};
        renderPeople();
        renderRequests();
      },
      showError,
    ),
  );
  stops.push(
    onValue(
      R("requests"),
      (s) => {
        requests = s.val() || {};
        detectNew();
        renderRequests();
        primed = true;
      },
      showError,
    ),
  );
  stops.push(
    onValue(R("messages"), (s) => renderChat(s.val() || {}), showError),
  );
}

/* ---------- people ---------- */
function renderPeople() {
  const now = Date.now();
  $("peopleList").innerHTML =
    Object.entries(people)
      .map(([id, p]) => {
        const waiting = Object.values(requests).some(
          (r) =>
            r.responses?.[id]?.status === "wait" &&
            r.responses[id].waitUntil > now,
        );
        const state =
          p.online === false
            ? "Away 💤"
            : waiting
              ? "Waiting ⏰"
              : "Available ✨";
        return `<div class="person ${p.online === false ? "away" : ""}"><span class="avatar">${esc(p.emoji || "🌸")}</span><div><div class="person-name">${esc(p.name)}${id === userId ? " (you)" : ""}</div><div class="person-state">${state}</div></div></div>`;
      })
      .join("") ||
    '<p class="empty">Invite a friend using this room code 🌸</p>';
}

/* ---------- requests ---------- */
const isOpen = (r) =>
  r.status !== "closed" &&
  r.status !== "started" &&
  Date.now() - (r.createdAt || 0) < 7200000;
const respOf = (r, st) =>
  Object.entries(r.responses || {}).filter(
    ([u, x]) => u !== r.from && st.includes(x.status),
  );

function renderRequests() {
  const list = Object.entries(requests)
    .filter(
      ([, r]) =>
        r.status !== "closed" && Date.now() - (r.createdAt || 0) < 7200000,
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
            Math.round((Date.now() - r.createdAt) / 60000),
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
            actions = `<div class="request-actions"><button class="agree" data-act="yes" data-id="${id}">I'm in ☕${my === "yes" ? " ✓" : ""}</button>${[2, 5, 10, 15].map((m) => `<button class="wait" data-act="wait" data-min="${m}" data-id="${id}">⏰ ${m}m</button>`).join("")}<button class="wait" data-act="wait" data-min="custom" data-id="${id}">⏰ …</button><button class="decline" data-act="no" data-id="${id}">Can't now 💗${my === "no" ? " ✓" : ""}</button></div>`;
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
    st.textContent = yes.length
      ? `🎉 ${yes.map(([, x]) => x.name).join(", ")} ready for tea!`
      : "Waiting for friends… 💌";
    if (yes.length)
      box.innerHTML = `<button class="primary" data-act="start" data-id="${id}">We're going! 🚶‍♀️</button>`;
  } else if (answered) {
    const [, r] = answered,
      x = r.responses[userId];
    st.innerHTML =
      x.status === "wait"
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
        createdAt: Date.now(),
        status: "open",
      }),
    );
    $("customReason").value = "";
    toast("Break request sent to everyone! 💌");
  } catch (e) {
    toast(e.message);
  }
}

async function respond(id, status, min) {
  const data = {
    status,
    name: userName,
    updatedAt: Date.now(),
    waitUntil: null,
    waitMinutes: null,
  };
  if (status === "wait") {
    data.waitMinutes = min;
    data.waitUntil = Date.now() + min * 60000;
  }
  try {
    await T(update(R(`requests/${id}/responses/${userId}`), data));
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
        notify(`${r.name} wants a break: ${r.reason}`);
    }
    for (const [u, x] of Object.entries(r.responses || {})) {
      const rk = `${id}:${u}:${x.status}:${x.updatedAt}`;
      if (seen.has(rk)) continue;
      seen.add(rk);
      if (!primed || r.from !== userId || u === userId) continue;
      if (x.status === "yes" || x.status === "ready") burst();
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

/* ---------- countdowns + auto "ready" after waiting ---------- */
function tick() {
  const now = Date.now();
  [document, pip?.document]
    .filter(Boolean)
    .flatMap((d) => [...d.querySelectorAll(".cd")])
    .forEach((el) => {
      const s = Math.max(0, Math.round((el.dataset.until - now) / 1000));
      el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    });
  for (const [id, r] of Object.entries(requests)) {
    const x = r.responses?.[userId];
    const key = `${id}:${x?.updatedAt}`;
    if (
      x?.status === "wait" &&
      x.waitUntil <= now &&
      !autoReady.has(key) &&
      isOpen(r)
    ) {
      autoReady.add(key);
      respond(id, "ready");
    }
  }
}
setInterval(() => roomCode && tick(), 1000);

/* ---------- chat ---------- */
function sendMsg(text, system = false) {
  if (!roomCode || !text) return;
  push(R("messages"), {
    from: userId,
    name: userName,
    text,
    system,
    createdAt: Date.now(),
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
  await update(R(`people/${userId}`), { online: false }).catch(() => {});
  stops.forEach((s) => s());
  stops = [];
  roomCode = "";
  people = {};
  requests = {};
  $("roomView").hidden = true;
  $("setup").hidden = false;
  document.body.classList.remove("in-room");
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
$("notifBtn").addEventListener("click", async () => {
  if (!("Notification" in window))
    return toast("This browser doesn't support notifications");
  const p = await Notification.requestPermission();
  toast(
    p === "granted"
      ? "Browser notifications on 🔔 (while this tab is open)"
      : "Notifications blocked 🥺",
  );
});
$("miniReason").innerHTML = REASONS.map(
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
      width: 320,
      height: 250,
    });
    const l = pip.document.createElement("link");
    l.rel = "stylesheet";
    l.href = new URL("style.css", location.href).href;
    pip.document.head.append(l);
    pip.document.body.className = "pip-body";
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
function burst(n = 26) {
  const ems = ["💗", "✨", "☕", "🌸", "⭐", "🎉", "💖"];
  for (let i = 0; i < n; i++) {
    const s = document.createElement("span");
    s.className = "confetti";
    s.textContent = ems[i % ems.length];
    const a = Math.random() * Math.PI * 2,
      d = 90 + Math.random() * 190;
    s.style.cssText = `--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 60}px;--r:${Math.random() * 720 - 360}deg`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1400);
  }
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
