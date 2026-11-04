# Tea Break Together ☕💗

Run with VS Code Live Server (right-click index.html → Open with Live Server).
Notifications and the floating window need `http://127.0.0.1` / `localhost` or `https://` — not a `file://` link.

## Firebase setup

1. Realtime Database → **Data** tab → copy the URL at the top → paste as `databaseURL` in `script.js`.
2. Rules tab (testing only — NOT secure, anyone can read/write):

```json
{ "rules": { "rooms": { ".read": true, ".write": true }, "roomIndex": { ".read": true, ".write": true } } }
```

Click **Publish**. (`roomIndex` is a tiny list of room codes + last-activity time used for auto-cleanup.)

## Rooms

- **Auto-delete:** a room with no activity (messages, requests, replies, or anyone sitting in it) for 2 days is deleted. There's no server, so the cleanup runs whenever anybody opens the app (and when someone tries to enter an expired room) — to users it behaves exactly like "deleted after 2 days".
- **Permanent room `3N`:** never deleted. The first person to join code `3N` creates it and becomes its admin/owner (the Create and Join buttons both work for it). Nobody can delete it; admins can still clear chat/requests.
- **Unique names:** two people in the same room can't use the same name (not case-sensitive). If the old holder of a name is offline it can be reused, except an admin's name. Pressing **Leave** frees your name immediately.

## Admin 👑

- Whoever creates a room is the owner. Admin tools appear in "Admin controls" and next to each person (⭐ make admin, 🚫 remove).
- Admins can remove people (they can't rejoin until *Allow back*), lock the room, rename it, clear chat/requests, delete any break request. Only the owner can delete the room or remove other admins.
- Admin rights are remembered on the device that created the room. Two tabs of the same browser count as the same person — test two users with a second browser/incognito/phone.
- ⚠️ These checks run in the browser; with the open testing rules above a tech-savvy person could bypass them. Real enforcement needs Firebase Authentication + rules.

## Timer, bell & clock sync ⏰

- All times use Firebase server time, so both devices count down to the same instant.
- When someone chooses "wait N min", both people get a 🔔 bell 5 seconds before the end, then a "ready" sound + confetti at the end. Countdown turns red in the last 5 seconds.
- The timer runs in a Web Worker so it stays accurate in background tabs. Browsers only allow sound after you've clicked something on the page once.

## Notifications 🔔

The bell opens a settings panel: shows On / Blocked / Not on yet, sends a test, toggles sound + pop-ups, and if the browser blocked the site it shows how to unblock and updates automatically once you do. Pop-ups appear while the tab is open (even in the background) or the floating buddy is open. When the site is fully closed there are no alerts.

## Floating buddy 🪟

Click ↘ to pop out a small window that floats over all your tabs and apps. Desktop Chrome/Edge 116+ only. Keep the main tab open (background is fine). Press ↘ once after joining (browsers require a click). After a reload you're re-joined automatically — press ↘ again.
