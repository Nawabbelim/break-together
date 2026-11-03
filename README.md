# Tea Break Together ☕💗

Run with VS Code Live Server (right-click index.html → Open with Live Server).

## Firebase setup

1. Realtime Database → **Data** tab → copy the URL at the top → paste as `databaseURL` in `script.js`.
2. Rules tab (testing only — NOT secure, anyone can read/write):

```json
{ "rules": { "rooms": { "$roomId": { ".read": true, ".write": true } } } }
```

Click **Publish**. For production you need Firebase Authentication + room-based rules.

## Notifications

- In-app live updates work whenever the tab/widget is open (Firebase realtime listeners).
- Browser notifications (🔔 button) appear only while the tab is open in the background.
- True push when the site is CLOSED needs Firebase Cloud Messaging + a service worker — not implemented.

## Not implemented yet

Firebase Auth, secure rules, push notifications, old-data cleanup, an "on break" participant status.

## Floating buddy (always on top while you work)

Click ↘ (or the ☕ button) to pop out a small window that floats over ALL your apps and tabs. It shows incoming requests, lets you agree/wait/request with a reason, and chimes on new requests.

- Works on desktop Chrome/Edge 116+ (Document Picture-in-Picture). Not on Firefox/Safari/mobile — there you get the in-page widget only.
- Keep the main Tea Break tab open (it can be in the background). Closing it stops live updates.
- Browsers don't allow a page to open this window on its own, so click ↘ once after joining your room.
