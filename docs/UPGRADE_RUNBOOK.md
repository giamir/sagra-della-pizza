# Upgrade & rollback runbook — 3-till fleet

Setup: **1 host** (runs the server on `:7331`, owns the only live database) + **2 clients**
(thin, push all writes to the host). All tills are Windows.

Key facts that make this safe:

- The database lives at `%APPDATA%\Sagra della Pizza\gestionale.db` — **outside** the
  install directory, so updating, reinstalling, or downgrading the app never touches it.
- The app keeps **automatic snapshots** of the host DB in
  `%APPDATA%\Sagra della Pizza\backups\` (one on each startup, plus one named
  `…-pre-update.db` taken right before every update installs).
- Migrations are additive and forward-only, so an older app version runs fine against a
  newer database — **app rollback usually needs no data restore.**

---

## Before the event (pre-staging)

1. **Archive the installers.** Copy the current `Sagra della Pizza Setup <version>.exe`
   **and the previous version's** onto a USB stick kept at the venue. The update feed only
   guarantees the *newest* installer is downloadable — do not rely on old ones staying online.
2. **Record the layout:** which machine is the host, its IP address, and the version each
   till is currently running (Cassa → menu → Info / Aggiornamenti).

---

## Upgrade procedure (closed hours only)

> Never install mid-service: the host restart drops every client's connection and any
> in-flight client order fails (clients have no offline queue).

1. **Host — manual JSON backup.** On the host: Cassa → Sistema → Backup/Ripristino →
   **Esporta** to the USB stick. (This is in addition to the automatic snapshot.)
2. **Host — install.** On the host, open Aggiornamenti and click **Riavvia e installa**.
   This automatically writes a `…-pre-update.db` snapshot, then installs and relaunches.
   After relaunch, verify:
   - the version shown is the new one;
   - `http://<host-ip>:7331/ping` returns `{ "ok": true, "role": "host", "version": "<new>" }`;
   - Rapporti shows today's orders and cash intact.
3. **Clients — one at a time.** Only after the host is verified, update **client 1**, then
   **client 2**. After each: confirm it connects, stock shows live "rimasti", and a test
   order reaches the host.
4. **Watch the banner.** If a client shows the amber *"Host aggiornato alla versione X —
   questa cassa è alla Y"* banner, that till is on the wrong version. Finish updating it
   before opening.

---

## Rollback procedure

App rollback on Windows = manually run the older installer. `allowDowngrade=false` only
stops the *auto*-updater from downgrading; a manual install is unaffected.

### Case 1 — new version misbehaves, data looks intact (most common)

1. Close the app on the affected till.
2. Run the previous `Setup <oldVersion>.exe` from the USB stick (installs over the new
   version; the database in `%APPDATA%` is untouched).
3. Relaunch. The older app ignores any newer columns/tables and runs normally.
4. Roll back the **host first**, then any clients, so the fleet stays on one version.

### Case 2 — data is corrupted or a migration went wrong

1. Roll back the app as in Case 1.
2. Close the app. In `%APPDATA%\Sagra della Pizza\`:
   - rename the current `gestionale.db` (and any `gestionale.db-wal` / `-shm`) to `.bad`;
   - copy the newest `backups\gestionale-<oldVersion>-…-pre-update.db` to `gestionale.db`.
3. Relaunch and verify Rapporti.
4. If no snapshot is available, use Backup/Ripristino → **Importa** with the JSON export
   instead — note this is a **full destructive replace** of orders, stock, and cash data.

Clients never need a data restore — they hold no master data. Just realign their app
version with the host's.

---

## Where things live (Windows)

| What | Path |
| --- | --- |
| Database | `%APPDATA%\Sagra della Pizza\gestionale.db` |
| Automatic snapshots | `%APPDATA%\Sagra della Pizza\backups\` |
| App install | `C:\Program Files\Sagra della Pizza\` (or the NSIS-selected dir) |
| Host health check | `http://<host-ip>:7331/ping` |
