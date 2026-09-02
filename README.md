# ENCLAVE RP — Moderation Control Platform

A production-oriented Discord OAuth2 + moderation dashboard + Discord bot for
the ENCLAVE RP Discord/FiveM server. It manages staff access, on-duty
tracking, warnings, bans, evidence, audit logs, and role-based access
control, backed by PostgreSQL and a Discord.js bot.

## 1. Project Overview

The platform has three cooperating pieces that share one codebase and one
database:

1. **Discord Bot** (Discord.js) — posts fixed-format moderation logs (staff
   login/logout, warnings, bans) to designated channels, resolves guild
   members/roles for the dashboard, and never holds any moderation state of
   its own (Postgres is the single source of truth).
2. **API server** (Express + TypeScript) — Discord OAuth2 login, session
   management, RBAC-enforced REST API for staff/warnings/bans/players/audit
   logs/statistics, evidence handling, and a database-driven expiration
   worker.
3. **Web Dashboard** (React + TypeScript + Tailwind) — the staff-facing SPA,
   served by the same Express process in production.

Access to the dashboard is restricted to approved moderation staff via
Discord OAuth2. The Discord user ID configured as `PLATFORM_OWNER_ID` always
has full, server-side-enforced access, independent of the staff database.

## 2. Architecture

```
server/
├── src/
│   ├── auth/           OAuth2 flow, session-derived authorization, RBAC permissions
│   ├── bot/             Discord.js client, member lookups, fixed message templates, log sending
│   ├── staff/            Staff CRUD, staff roles (configurable levels), duty sessions
│   ├── moderation/
│   │   ├── warnings/    Warning issuing/revocation/expiration
│   │   ├── bans/        Ban issuing/revocation/expiration (evidence mandatory)
│   │   └── players/     Player identity resolution, profile, timeline
│   ├── evidence/        MIME/magic-byte validation, Discord-CDN or local storage drivers
│   ├── ids/              Atomic WRN-YYYY-###### / BAN-YYYY-###### code generator
│   ├── audit/            Append-only audit log service
│   ├── statistics/       Dashboard + detailed statistics
│   ├── settings/         System settings key/value store
│   ├── api/
│   │   ├── routes/       One router per resource
│   │   ├── middleware/   requireAuth, requirePermission, CSRF, rate limiting, validation, errors
│   │   └── app.ts        Express app wiring (also serves the built SPA)
│   ├── workers/          Database-driven expiration sweep (no setTimeout-per-record)
│   ├── database/         Drizzle ORM schema, migrations, seed script
│   ├── config/           Zod-validated environment configuration
│   └── main.ts           Process entrypoint (bot + worker + HTTP server)
└── tests/                 Vitest + Supertest integration tests (real Postgres)

web/
└── src/
    ├── context/AuthContext.tsx   Session state, CSRF token, permission checks
    ├── components/                Layout/sidebar, shared UI, duty widget, confirm dialogs
    └── pages/                     Dashboard, Staff, Warnings, Bans, Players, Statistics, Audit, Settings
```

Design choices worth calling out:

- **Authorization is always re-derived server-side**, not trusted from the
  session/client. `requireAuth` re-reads the staff member's status/role from
  the database on every request (except for the Platform Owner, whose access
  is an unconditional server-side rule). This means removing a staff member
  or changing their role takes effect on their very next request, not on
  their next login.
- **The Platform Owner is a hard-coded server-side rule**, not a database
  row. `PLATFORM_OWNER_ID` always gets full access even if the staff table
  is empty, corrupted, or unreachable. A bookkeeping `staff_members` row is
  still auto-provisioned for the owner so duty sessions and the staff list
  work uniformly, but it is never consulted for the authorization decision.
- **Discord role sync**: each staff role can optionally require a specific
  Discord role (`requiredDiscordRoleId`). If a staff member's Discord role is
  removed, their platform access is suspended (their database row is left
  intact) until the role is restored — access is denied on login, and their
  session's cached role snapshot is re-validated against the DB on every
  request.
- **Warnings/bans are never hard-deleted.** Revocation is a status
  transition (`ACTIVE → REVOKED`) that records who/why/when, preserving the
  audit trail. The same applies to staff removal (`ACTIVE → INACTIVE`).
- **Evidence storage is abstracted** behind `evidence/storage.ts`. The
  default driver re-uses Discord's CDN (uploads the file as a message
  attachment in the moderation channel and stores the resulting URL); a
  `local` driver is available for local/dev use. Swapping in S3/R2 later
  only requires a new driver implementing the same `store()` contract.
- **Expiration is a periodic, database-driven sweep**, not
  per-record `setTimeout`s. `warnings.expires_at` / `bans.expires_at` are
  swept on a fixed interval (default 60s) and immediately on process start,
  so state is correctly recovered after any restart.
- **Idempotency**: warning/ban creation accepts an optional client-generated
  `idempotencyKey`; a duplicate submission (double-click, retry) returns the
  original record instead of creating a second one, backed by a unique DB
  index.

## 3. Features

- Discord OAuth2 login, guild-membership + Discord-role verification via the
  bot, server-side session (Postgres-backed, HttpOnly/SameSite cookies).
- Configurable staff roles (Manager / Deputy Manager / Staff by default) with
  a per-role permission set editable from Settings — add new levels
  (Senior Staff, Trial Staff, ...) without a deploy.
- Staff management: add (via Discord member search), edit, change role,
  soft-remove; Discord identity is always resolved server-side from the bot,
  never trusted from the client.
- Duty (on-shift) tracking: "دخول الرقابة" / "خروج الرقابة" buttons post a
  fixed-format message to the staff log channel and persist a
  `staff_sessions` row (`ACTIVE` while on duty, survives a restart).
- Warning system: auto-suggested warning number, free-text or preset reason,
  configurable duration (including Permanent/Custom), optional evidence,
  fixed-format Discord log message, automatic expiration, revocation with
  reason.
- Ban system: same shape as warnings, but evidence is **mandatory** —
  enforced both in the UI (disabled submit button) and server-side (the API
  rejects a ban with no evidence regardless of what the client sends).
  Permanent bans never expire.
- Player profiles: aggregated warnings/bans, active/expired counts, and a
  chronological moderation timeline.
- Global search across Discord ID/username, player name, FiveM identifier,
  warning code, and ban code.
- Statistics: dashboard overview cards, today/week/month breakdowns, most
  active staff, most warned players, most common warning reasons, and
  per-staff personal stats (hours on duty, sessions, warnings/bans issued).
- Append-only audit log for every sensitive action, with CSV export.
- CSV export for warnings, bans, staff sessions, and audit logs
  (`data.export` permission).
- **Editable message templates** (Settings → Messages, `messages.manage`
  permission): the wording of the staff login/logout, warning, and ban
  Discord messages can be rewritten from the dashboard, with a fixed set of
  `{{placeholders}}` per message type. "Reset to Default" restores the
  original required wording at any time.
- **Configurable channel routing** (Settings → Channels, `channels.manage`
  permission): pick which Discord channel each message type is sent to from
  a live list of the server's text channels, instead of being locked to
  whatever `.env` says.
- **Test Mode** (Settings → Test Mode, `test_mode.manage` permission): points
  staff-login/warning/ban messages at three auto-created channels in a
  separate sandbox Discord server, so the whole logging flow can be
  exercised without touching production channels. Disabling it deletes
  everything it created there. Dashboard login/permissions are completely
  unaffected by Test Mode — only where automated messages get sent changes.

## 4. Requirements

- Node.js 20+
- PostgreSQL 14+
- A Discord application with a bot user, invited to your guild with the
  `Server Members Intent` enabled (Developer Portal → Bot → Privileged
  Gateway Intents).

## 5. Discord Developer Portal Setup

1. Create an application at https://discord.com/developers/applications.
2. **Bot**: add a bot user, enable the **Server Members Intent**, copy the
   bot token → `DISCORD_BOT_TOKEN`.
3. **OAuth2**: note the Client ID (`DISCORD_CLIENT_ID`) and generate a
   Client Secret (`DISCORD_CLIENT_SECRET`).
4. **OAuth2 → Redirects**: add
   `https://<your-domain>/api/auth/discord/callback` (and
   `http://localhost:3000/api/auth/discord/callback` for local dev). If you
   deploy under a sub-path (see §12), include that path segment, e.g.
   `https://enclaverp.cc/censorship/api/auth/discord/callback`.
5. Invite the bot to your guild with at least: View Channels, Send Messages,
   Attach Files, Read Message History in the three moderation channels, and
   permission to fetch guild members.
6. Note your **Guild ID** (`DISCORD_GUILD_ID`) and the three channel IDs
   (staff log, warning log, ban log) — right-click in Discord with Developer
   Mode enabled → "Copy ID".

## 6. OAuth2 Setup Notes

- Scope requested is `identify` only — the dashboard never needs write
  access to the user's Discord account. Guild membership and roles are
  verified using the **bot's** credentials (`guild.members.fetch`), which is
  more reliable than the `guilds.members.read` OAuth scope.
- OAuth `state` is generated per login attempt and stored server-side in the
  session; the callback rejects any mismatched or missing state.
- The OAuth access token is used once (to fetch the Discord profile) and
  discarded — it is never persisted or sent to the frontend.

## 7. Bot Setup

The bot runs in the same process as the API server (`server/src/main.ts`).
There is no separate bot process to deploy — starting the server starts the
bot. If the bot fails to connect (bad token, intents not enabled), the API
still starts; Discord logging simply reports `FAILED` on each moderation
action until the bot reconnects (see §16 Troubleshooting).

## 8. Database Setup

```bash
# Local Postgres example
createuser enclave --pwprompt
createdb enclave_rp --owner=enclave
```

Set `DATABASE_URL` in `.env`, then:

```bash
cd server
npm run db:generate   # (only needed if you change the schema)
npm run db:migrate    # applies migrations
npm run db:seed       # creates default staff roles (Manager / Deputy Manager / Staff)
```

## 9. Environment Variables

Copy `.env.example` to `.env` at the repo root and fill in real values.
**Never commit `.env`.**

| Variable | Description |
|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` |
| `PORT` | HTTP port (default 3000) |
| `APP_BASE_URL` | Public **origin** (scheme+host, no path), used for the OAuth2 redirect URI |
| `BASE_PATH` | Optional mount path if served from a sub-path (e.g. `/censorship`), see §12 |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Random secret for signing session cookies (`openssl rand -hex 32`) |
| `DISCORD_BOT_TOKEN` | Bot token (secret) |
| `DISCORD_CLIENT_ID` | OAuth2 application/client ID |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret (secret) |
| `DISCORD_GUILD_ID` | Your Discord server's ID |
| `PLATFORM_OWNER_ID` | Discord user ID with unconditional full access |
| `BOT_ID` | The bot's own Discord user ID |
| `STAFF_LOG_CHANNEL_ID` | Channel for duty login/logout messages |
| `WARNING_CHANNEL_ID` | Channel for warning logs |
| `BAN_CHANNEL_ID` | Channel for ban logs |
| `TIMEZONE` | IANA timezone for all displayed dates (default `Asia/Muscat`) |
| `EXPIRATION_WORKER_INTERVAL_MS` | How often the expiration sweep runs |
| `EVIDENCE_STORAGE_DRIVER` | `discord` (default) or `local` |
| `MAX_EVIDENCE_FILE_SIZE_MB` | Max evidence upload size |

No secret is ever hard-coded in source — every Discord ID/secret above is
read from the environment at startup (`server/src/config`), and requests are
rejected at boot (with a clear error) if a required variable is missing or
malformed.

## 10. Local Development

```bash
npm install                 # installs both workspaces
cp .env.example .env        # fill in real values
cd server && npm run db:migrate && npm run db:seed && cd ..

npm run dev:server          # http://localhost:3000 (API + bot)
npm run dev:web             # http://localhost:5173 (Vite dev server, proxies /api)
```

Open `http://localhost:5173`, click "Login with Discord". The Discord user
matching `PLATFORM_OWNER_ID` always gets in; anyone else needs a
`staff_members` row (add yourself directly via SQL for the very first
manager, or log in as the owner and use Staff → Add Staff).

## 11. Production Deployment

**Deploying to the existing enclaverp.cc box (Oracle Cloud, systemd, Caddy —
no Docker)?** Use `deploy/install.sh` and follow `deploy/README.md` instead
of the generic steps below — it matches the same conventions as
`enclave-home` and `enclave-tickets-bot` (its own systemd unit, its own
service user, an auto-picked port, an `/etc/*.env` file) and prints the
exact Caddy snippet to add for `/censorship`.

Generic manual deployment (any Linux host with Node + Postgres):

```bash
npm install
npm run build                 # builds both server (tsc) and web (vite)
cd server && npm run db:migrate && npm run db:seed && cd ..
NODE_ENV=production node server/dist/main.js
```

The Express server serves the built SPA (`web/dist`) itself — no separate
static host is required.

## 12. Docker

```bash
cp .env.example .env   # fill in real values
docker compose up -d --build
```

`docker-compose.yml` runs Postgres and the app together; the `Dockerfile` is
a multi-stage build (installs deps → builds both workspaces → slim runtime
image running `node server/dist/main.js`). Run migrations once against the
compose Postgres instance (`DATABASE_URL` pointed at the `postgres` service)
before first boot.

### Deploying behind Cloudflare on a sub-path

If the dashboard is reachable at something like
`https://enclaverp.cc/censorship` (Cloudflare/your reverse proxy fronting a
VPS or Oracle Cloud instance) rather than the domain root:

- Set `APP_BASE_URL=https://enclaverp.cc` (origin only, no path).
- Set `BASE_PATH=/censorship`.
- Build the frontend with `VITE_BASE_PATH=/censorship npm run build:web` (or
  export it before `npm run build`) so asset URLs and client-side routing
  use the correct prefix.
- Your reverse proxy/Cloudflare rule must forward the full
  `/censorship/*` path through to the app **unchanged** (do not strip the
  prefix) — the app itself expects to see it, so both the API and the OAuth
  redirect URI resolve correctly.
- Update the Discord application's OAuth2 redirect URI to
  `https://enclaverp.cc/censorship/api/auth/discord/callback`.

## 13. Commands / Scripts

| Command | Description |
|---|---|
| `npm run build` | Build server + web |
| `npm run dev:server` / `dev:web` | Local dev servers |
| `npm test` (root) or `npm run test -w server` | Run the Vitest suite (needs a reachable Postgres) |
| `npm run lint` | Type-check both workspaces |
| `npm run db:generate` | Generate a new Drizzle migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed default staff roles |

## 14. Permissions (RBAC)

Permissions are plain strings stored per-role in `staff_roles.permissions`
(editable from Settings by anyone with `settings.manage`, by default only
Manager). Every permission below can be granted to any role independently —
e.g. hand a trusted Deputy Manager `messages.manage` without also giving
them `staff.manage` or `settings.manage`.

| Permission | Grants |
|---|---|
| `staff.view` / `staff.manage` | View staff list / add, remove, edit, change roles |
| `duty.toggle` | Log in/out of duty |
| `warnings.view` / `.create` / `.revoke` | View / issue / revoke warnings |
| `bans.view` / `.create` / `.revoke` | View / issue / revoke bans |
| `players.view` | Player search + profiles |
| `statistics.view` | Statistics dashboard |
| `audit.view` | Audit log |
| `settings.manage` | Staff roles/permissions editor, generic system settings |
| `messages.manage` | Edit Discord message wording (Settings → Messages) |
| `channels.manage` | Choose which channel each message type is sent to (Settings → Channels) |
| `test_mode.manage` | Enable/disable Test Mode (Settings → Test Mode) |
| `data.export` | CSV export on warnings/bans/staff sessions/audit logs |

Defaults:

| Role | Key permissions |
|---|---|
| **Platform Owner** | Every permission, always — enforced server-side, independent of the database |
| **Manager** | Everything above |
| **Deputy Manager** | Warnings/bans (create+revoke), players, statistics, audit, view staff — no staff/settings/messages/channels/test-mode management |
| **Staff** | Duty toggle, warnings/bans (create only, no revoke), players — nothing administrative |

New levels (e.g. "Senior Staff", "Trial Staff") can be added from Settings
with any combination of the permission set in
`server/src/auth/permissions.ts`.

## 15. Test Mode

Settings → Test Mode lets staff with `test_mode.manage` try out the full
staff-login/warning/ban messaging flow against a sandbox Discord server
without touching the real moderation channels.

**Enable**: enter a Discord server ID (the bot must already be a member of
that server) and click Enable Test Mode. The platform creates a category
("ENCLAVE TEST MODE") with three text channels
(`mod-staff-log-test`, `mod-warnings-test`, `mod-bans-test`) in that server,
and from then on every staff-login/logout, warning, and ban message is sent
there instead of the production channels — nothing else changes: dashboard
login, staff verification, and permissions all keep using the real
`DISCORD_GUILD_ID` guild the whole time, so Test Mode can never lock anyone
out of the dashboard.

**Disable**: "Disable & Clean Up Test Mode" deletes the category and all
three channels it created, then switches message routing back to whatever
was configured before (custom channel routing if you'd set one, otherwise
the `.env` defaults). Any cleanup step that fails (e.g. a channel already
deleted manually, or the bot lost access) is reported back rather than
silently ignored — Test Mode still turns off either way.

The bot needs **Manage Channels** permission in the test server for both
steps to work.

## 16. Testing

```bash
cd server
npm test
```

The suite uses Vitest + Supertest against a real Postgres database
(`enclave_rp_test` by default, override with `TEST_DATABASE_URL`) — it spins
up the real Express app, runs migrations, and exercises the actual
middleware chain (sessions, CSRF, rate limiting, permission checks). A
test-only session-setting endpoint (`/api/__test__/set-session`, mounted
only when `NODE_ENV=test`) stands in for a real Discord OAuth round-trip so
authenticated flows can be tested end-to-end without live Discord calls.

Coverage includes: unauthorized/authorized/manager/owner access; staff
duplicate-prevention, role changes, soft-removal, CSRF-token enforcement;
duty login/logout, duplicate-login rejection, restart-recovery (DB-driven,
no in-memory session state), one-active-session-per-staff at the DB level;
warning creation, missing-reason/missing-player validation, idempotent
double-submission, server-side expiration sweep, revocation with
who/why/when; ban creation, missing/invalid evidence rejection, mandatory
evidence enforcement, permanent-ban non-expiry, idempotent double-submission,
revocation; and a security suite covering unauthorized API calls, forged
session cookies, spoofed-identity rejection on staff creation, permission
forgery/escalation attempts, login rate limiting, and OAuth state validation.
Fixed Discord message templates (staff login/logout, warning, ban) are
locked in with dedicated format tests.

## 17. Troubleshooting

- **"Discord bot failed to start"** on boot: check `DISCORD_BOT_TOKEN` and
  that the Server Members Intent is enabled in the Developer Portal. The API
  still starts; moderation actions succeed but `discordLogStatus` will read
  `FAILED` until the bot reconnects — nothing is lost, the action is retried
  by re-checking Discord connectivity on the next relevant action.
- **"You are not a member of the ENCLAVE RP Discord server"**: the bot could
  not find your Discord ID via `guild.members.fetch` — confirm you are
  actually in the configured `DISCORD_GUILD_ID` guild and the bot is too.
- **"Your staff access is suspended"**: your staff role requires a specific
  Discord role (`requiredDiscordRoleId`) that you no longer hold. Restore
  the Discord role or clear the requirement in Settings.
- **CSRF errors on the dashboard**: the SPA reads its CSRF token from
  `GET /api/auth/me` and sends it back as `X-CSRF-Token`. If you're building
  a new client, replicate this — cookies alone are not sufficient for
  mutating requests.

## 18. Security

- OAuth2 `state` is generated and validated server-side per login attempt.
- Sessions are server-side (Postgres-backed via `connect-pg-simple`),
  cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- CSRF protection via a synchronizer token (session-stored, never in a
  readable cookie) required on every mutating request.
- Authorization is fully server-side and re-derived from the database on
  every request — the frontend's view of permissions is informational only
  and is discarded/overwritten by the server on each call.
- All request bodies/query params/route params are validated with Zod;
  unknown fields are stripped, not silently trusted.
- Evidence uploads are validated by magic bytes (not filename/MIME alone),
  size-capped, and rejected outright on mismatch.
- Rate limiting is applied globally and additionally on login, search,
  write (warning/ban/duty), and admin (staff/settings) operations.
- Warning/ban creation is idempotent via a client-supplied key with a unique
  database constraint, preventing double-submission from creating duplicate
  records.
- No destructive deletes on moderation-relevant data — everything is a
  status transition (`REVOKED`/`INACTIVE`) with an audit trail.
- No secret ever appears in source control; `.env.example` documents every
  variable without real values, and `.gitignore` excludes `.env*`.

## 19. Backup

Back up the Postgres database on your usual schedule
(`pg_dump`/managed-provider snapshots). Evidence stored via the `discord`
driver lives on Discord's CDN (subject to Discord's own retention); evidence
stored via the `local` driver lives under `server/uploads` and should be
included in your backup/volume strategy if you rely on it beyond local
development.

## 20. Database Migrations

Schema changes go through Drizzle: edit `server/src/database/schema/*.ts`,
run `npm run db:generate` (writes a new SQL file under `server/drizzle`),
review it, commit it, and run `npm run db:migrate` in each environment.
Migrations are tracked in Drizzle's own migrations table, so re-running
`db:migrate` is always safe (idempotent).

## 21. Known Limitations / Future Improvements

- Discord role sync is checked at login and re-checked from the database's
  cached `discord_role_ids` on every request; it does not currently poll
  Discord in the background for role changes that happen while a session is
  live — a role removal takes effect the next time the platform re-verifies
  membership (login, or an explicit re-sync).
- Editing/deleting the original Discord log message when a warning/ban
  expires is not implemented; the dashboard (the source of truth) reflects
  `EXPIRED` immediately, but the original Discord message is left as-is.
- The `local` evidence driver is intended for development/self-hosting
  without Discord-CDN dependence; swapping in S3/Cloudflare R2 only requires
  a new driver behind `evidence/storage.ts`'s existing interface.
- CSV export streams into memory for the current query window (capped at a
  few thousand rows) rather than true streaming — sufficient for this
  platform's expected volume, but worth revisiting if the server accumulates
  a very large moderation history.
- Test Mode is a single global on/off switch (one sandbox server active at a
  time), not per-admin — if two admins both try to use it simultaneously,
  the second `enable` call is rejected until the first disables it.
