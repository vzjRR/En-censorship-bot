# Handover — ENCLAVE RP Censorship Platform

This file exists to hand this project off to a different coding agent
(Codex) after it was built and maintained by Claude Code. It captures
everything that isn't already written down in `README.md` /
`deploy/README.md`, plus tribal knowledge from the build history that will
save you from re-discovering the same bugs. Read this file, then
`README.md` (architecture, features, env vars, RBAC table, setup), then
`deploy/README.md` (production deployment on the actual box) before making
changes.

## 1. Where this actually runs

- Repo: `vzjRR/En-censorship-bot`.
- **Working branch: `claude/enclave-rp-moderation-platform-nzaf68`.** This is
  not a throwaway branch name — `deploy/install.sh` hardcodes
  `BRANCH="${BRANCH:-claude/enclave-rp-moderation-platform-nzaf68}"` and the
  production box's checkout tracks it. `deploy/update.sh` just pulls
  whatever branch is currently checked out there. **If you start pushing to
  `main` or a differently-named branch, production will not pick up your
  changes** until you either keep committing to this branch, merge into it,
  or manually repoint the box's checkout and `deploy/install.sh`'s default.
  Renaming it is fine, just update both places together.
- Production deploy target is a single Oracle Cloud box that already hosts
  `enclave-home`, a store, and a tickets bot — this app is deliberately
  isolated from them (own systemd unit `enclave-censorship`, own Postgres
  role/db `enclave_censorship`, own Discord application/bot token, own
  port). Full runbook: `deploy/README.md`. Routine update command the owner
  runs after every change: `sudo bash /opt/enclave-censorship/app/deploy/update.sh`.
- The owner (Discord user ID in `PLATFORM_OWNER_ID`) communicates in Arabic
  and reports bugs primarily via Discord screenshots. Several real bugs in
  this project were only diagnosable by reading a screenshot of garbled
  Discord message rendering — when they report something "looks wrong on
  Discord," ask for a screenshot if one isn't already attached.

## 2. Stack recap

Monorepo, two npm workspaces:
- `server/` — Express + TypeScript + Drizzle ORM + PostgreSQL + discord.js
  bot, all in one process (`server/src/main.ts` starts the HTTP server, the
  bot client, and the expiration worker together).
- `web/` — React + TypeScript + Tailwind + Vite SPA, built and served as
  static files by the same Express process in production.

`README.md` §2 has the full directory map and design-decision rationale
(server-side-only authorization, platform owner as a hardcoded rule not a
DB row, append-only moderation records, DB-driven expiration sweep,
idempotent writes, pluggable evidence storage). That's still accurate —
read it before touching auth or the moderation services.

## 3. Features shipped that README.md doesn't fully describe

`README.md` §3 predates several features that were added afterward and
never got backfilled into it. Treat this section as the actual current
feature set on top of what README documents, and consider updating
README §3/§14 to match next time you're in there:

- **Configurable "punishment roles"** (`server/src/settings/punishmentRoles.service.ts`,
  Settings → Punishment Roles UI, `PUNISHMENT_ROLES_KEY = "punishment_roles"`
  in `system_settings`): lets staff map specific warning numbers (and bans)
  to a Discord role that gets auto-granted to the player when issued and
  auto-revoked when the warning/ban is revoked or expires. Grant/revoke go
  through `grantMemberRole`/`revokeMemberRole` in
  `server/src/bot/services/memberService.ts` and are best-effort — a grant
  failure never blocks the warning/ban itself, but is recorded via the
  `PUNISHMENT_ROLE_GRANT_FAILED` audit action so it's visible in the
  dashboard instead of only in server logs. **The #1 cause of "the role
  never gets granted" is Discord's own role hierarchy: the bot's highest
  role in Server Settings → Roles must sit ABOVE any role it's asked to
  grant.** This is a Discord platform constraint, not fixable in code —
  confirmed directly with the project owner after a live incident.
- **Toggleable revoke notifications** (`server/src/settings/revokeNotifications.service.ts`,
  `REVOKE_NOTIFICATIONS_KEY = "revoke_notifications"`): two independent
  on/off switches (warnings, bans) controlling whether revoking a
  warning/ban posts a Discord channel message about it. Default both `true`.
- **On-duty enforcement** (`server/src/moderation/dutyGuard.ts`): issuing a
  warning or ban requires an active `staff_sessions` row for that Discord
  user (`assertOnDuty`, throws `NotOnDutyError` → HTTP 403 `not_on_duty`).
  Applies to everyone, including the platform owner — there is no bypass.
  This is checked first, before any other validation, in both
  `createWarning` and `createBan`.
- **Staff welcome DM, player DM, and Manager alert DM** — the newest
  feature set, see §5 below for the full template list.
- **Singleton platform roles**: at most one *active* staff member may hold
  the `manager` or `deputy_manager` role key at a time
  (`SINGLETON_ROLE_KEYS` in `server/src/staff/staff.service.ts`). Enforced
  on both add and role-change. Violating it throws `StaffValidationError`
  (see §6) rather than a generic error, so the API returns a clear 400.
  Custom roles an owner adds later are **not** singleton-constrained — only
  these two built-in keys are.
- **Owner-only selective data wipe** (Settings → Data Wipe): lets the
  platform owner clear specific tables (staff, warnings, bans, audit logs,
  sessions, etc.) independently. Gated to the platform owner only, not any
  permission a regular role can hold.

## 4. The message template system

`server/src/settings/templates.service.ts` defines `TEMPLATE_DEFINITIONS`,
a record keyed by `TemplateKey`. Each entry has `label`, `description`,
`placeholders: string[]`, and a `default` string. Overrides are stored as
one JSON blob in `system_settings` under key `message_templates`;
`getEffectiveTemplates()` merges override-or-default per key.
`server/src/bot/services/messageTemplates.ts` has one builder function per
key that resolves placeholders and calls `renderTemplate`.

**The frontend needs zero changes when you add a new template key.**
`web/src/pages/settings/MessagesPanel.tsx` renders whatever
`GET /settings/templates` returns, dynamically, keyed by whatever
`TemplateKey`s exist server-side. If you add a 12th template, add it to
`TEMPLATE_DEFINITIONS` + a builder function + wire the builder into
whatever service sends it, and the Settings UI picks it up automatically.

Current template keys (11):

| Key | Sent when | Sent to |
|---|---|---|
| `staff_login` | Duty clock-in ("دخول الرقابة") | Staff log channel |
| `staff_logout` | Duty clock-out ("خروج الرقابة") | Staff log channel |
| `warning` | Warning issued | Warning log channel |
| `ban` | Ban issued | Ban log channel |
| `warning_revoked` | Warning revoked (if toggle on) | Warning log channel |
| `ban_revoked` | Ban revoked (if toggle on) | Ban log channel |
| `staff_welcome` | A member is added as staff | DM to the new staff member |
| `warning_player_dm` | Warning issued | DM to the warned player |
| `ban_player_dm` | Ban issued | DM to the banned player |
| `manager_alert_warning` | Warning issued | DM to the active Manager (skipped if the Manager issued it themselves) |
| `manager_alert_ban` | Ban issued | DM to the active Manager (skipped if the Manager issued it themselves) |

All eleven are editable from Settings → Messages, gated by the
`messages.manage` permission (Owner, Manager, Deputy Manager by default).

### Critical gotcha: never backtick-wrap a mention placeholder

Discord does not parse mentions (`<@userId>`, `<@&roleId>`) or any markdown
inside inline code spans (backtick-quoted text). Wrapping a mention
placeholder in backticks in a template renders as raw garbled text (e.g.
`` `<@123456789012345678>` `` shows up as literal, sometimes
BiDi-reordered, garbage instead of a colored mention pill) instead of a
clickable mention. This was a real production bug, diagnosed from a user
screenshot. **Any placeholder that resolves to a `<@…>` or `<@&…>` mention
must never be inside backticks in a template's default string, and if you
let staff edit templates freely, this is worth validating/warning about in
the UI eventually** — it isn't currently caught automatically, only fixed
in the shipped defaults.

### `staffRole` display is intentionally restricted

Per explicit owner instruction, the Discord *role* of the acting staff
member (`staffRole`, either a role mention or role name depending on
context) is only ever shown in the `staff_login`/`staff_logout` templates.
It was deliberately removed from the `warning`/`ban`/`warning_revoked`/
`ban_revoked` defaults. Don't re-add it there without the owner asking for
it back — this was a specific, considered reversal of an earlier design.

### Two independent "role" concepts — don't conflate them

- `staff_members.roleId → staff_roles` — the **platform permission role**
  (what the dashboard's RBAC actually checks). Seeded defaults: Manager /
  Deputy Manager / Staff, editable/extensible from Settings.
- `staff_members.discordRoleId` / `discordRoleName` — the **Discord role**
  shown in messages, manually chosen per staff member via "Edit Discord
  Role" in the Staff list. Purely cosmetic/display; carries no permission
  weight.

These are two separate singleton pools. `SINGLETON_ROLE_KEYS` (manager,
deputy_manager) applies only to the platform role, never to the Discord
role field.

### The platform owner's own role self-corrects on every login

`ensurePlatformOwnerStaffRecord()` in `server/src/staff/staff.service.ts`
resets the owner's `staff_members.roleId` back to the dedicated
`platform_owner` role **on every login** if it's found to be anything
else:

```ts
if (existing.status !== "ACTIVE" || existing.roleId !== ownerRole.id) {
  // ...reset roleId back to ownerRole.id...
}
```

`platform_owner` is deliberately **not** in `SINGLETON_ROLE_KEYS` — it's a
separate bookkeeping-only role key (`PLATFORM_OWNER_ROLE_KEY`), independent
from the `manager`/`deputy_manager` singleton pool. Practical implication:
if the owner ever manually reassigns their own staff row to "Manager" via
the dashboard (blocking someone else from holding that singleton slot),
**they don't need a destructive data wipe to fix it** — simply logging out
and back in re-triggers `ensurePlatformOwnerStaffRecord` and restores their
row to `platform_owner`, freeing the Manager slot. This was confirmed
correct in code and communicated to the owner; it was not independently
re-confirmed working by them at time of writing — if they report it didn't
work, check `requireAuth.ts`'s owner branch (see next section) first.

## 5. Auth / session refresh gotcha (already fixed, but easy to regress)

`server/src/api/middleware/requireAuth.ts` has two branches: platform owner
and regular staff. The staff branch always re-reads `discordRoleName`/
`discordRoleId` from the DB on every request. **The owner branch used to
not do this** — it was a real bug (owner changes their Discord role
display, dashboard keeps showing the stale one indefinitely) fixed by
adding the same DB refresh to the owner branch, wrapped in try/catch so a
broken/unreachable staff table can never block owner login (this
invariant — owner access must survive staff-table failures — is
load-bearing; don't remove the try/catch). If you touch `requireAuth.ts`,
keep both branches refreshing role display fields from the DB on every
request, and keep the owner path fail-open on staff-table errors.

## 6. Error-handling pattern for business-rule rejections

`server/src/staff/staff.service.ts` exports `StaffValidationError extends
Error` — used for things that are the *caller's* fault, not a server bug
(duplicate staff member, singleton-role conflict). Routes
(`server/src/api/routes/staff.routes.ts`) catch it explicitly and map to
HTTP 400 with the error's own message:

```ts
if (err instanceof StaffValidationError) return next(new ApiError(400, "validation_error", err.message));
```

Without this, a plain `throw new Error(...)` falls through the generic
error handler to a 500 in production, which hid the actual reason from the
UI ("Unexpected server error" with no detail) — a real bug that took a
user screenshot to catch. Follow this pattern for any new
business-rule-rejection you add anywhere in the app: a dedicated
`XValidationError` class per domain (there's also `BanValidationError` in
`bans.service.ts`), caught at the route layer, never a bare `Error` for
something a user actually did wrong.

## 7. Best-effort Discord side-effect pattern

`sendChannelMessage`, `sendDirectMessage` (both in
`server/src/bot/services/logService.ts`), `grantMemberRole`,
`revokeMemberRole` (in `server/src/bot/services/memberService.ts`) **never
throw**. They always return `{ status: "SENT" | "FAILED", error?: string,
messageId?: string }`, and every caller proceeds regardless of the result.
This is intentional: a Discord outage, a DM-disabled user, a missing
permission, etc. must never corrupt or block the underlying moderation
record (the warning/ban itself always gets written to Postgres — Discord
is a notification layer on top, not the source of truth). If you add a new
Discord side effect, follow this contract rather than letting it throw.

## 8. Testing

```bash
cd server
npm test                 # or: npx vitest run
npx tsc -p tsconfig.test.json --noEmit
```

Vitest + Supertest against a **real** Postgres database (`enclave_rp_test`
by default, override with `TEST_DATABASE_URL`) — no mocked DB layer. As of
this handover: 13 test files, 72 tests, all passing.

Established pattern for intercepting Discord bot calls in tests (see
`server/tests/notifications.test.ts`, `punishmentRoles.test.ts`,
`revokeNotifications.test.ts` for worked examples):

```ts
vi.resetModules();
vi.doMock("../src/bot/services/logService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/bot/services/logService.js")>();
  return { ...actual, sendDirectMessage: vi.fn(async (id, content) => { /* capture */ return { status: "SENT" }; }) };
});
// Re-import BOTH the module under test AND, if the test goes through an
// HTTP route, helpers.js/buildApp itself — routes were loaded into the
// OLD module registry before the mock was registered, so re-importing
// only the service under test is not enough for route-level tests.
const { addStaffMember } = await import("../src/staff/staff.service.js");
// ...
vi.doUnmock("../src/bot/services/logService.js");
vi.resetModules();
```

`server/tests/helpers.ts` has reusable fixtures: `seedDefaultRoles`,
`createStaffMember`, `nextDiscordId`, `startDutyFor` (goes through the real
HTTP duty-login route), `putOnDuty` (direct DB insert of an ACTIVE
`staff_sessions` row, faster when duty-state is a precondition, not the
thing under test), `sessionUserFor`, `loginAs`.

**Gotcha if you're on this exact dev sandbox**: the local PostgreSQL
cluster has been observed to stop between unrelated shell sessions here.
If `npm test` fails with a connection error, try
`sudo pg_ctlcluster 16 main start` before assuming the test itself is
broken. This is sandbox-specific, not a production concern.

## 9. Full permission list (RBAC)

`server/src/auth/permissions.ts`, `PERMISSIONS` const — 19 keys total
(README §14 has the same list with descriptions and default role
assignments, still accurate):

```
dashboard.view
staff.view, staff.manage
duty.toggle, duty.view_all
warnings.view, warnings.create, warnings.revoke
bans.view, bans.create, bans.revoke
players.view
statistics.view
audit.view
settings.manage
messages.manage
channels.manage
test_mode.manage
data.export
```

`PERMISSION_LABELS_AR` (same file) maps every one of these to an
Arabic-language description string, used to render the "what this role can
do" bullet list in the `staff_welcome` DM
(`formatPermissionsListAr()`). If you add a 20th permission, add its
Arabic label here too or the welcome DM will silently omit it from the
bullet list (permissions without a mapped label are filtered out, not
shown as a blank line — so the failure mode is "quietly incomplete," not
a crash).

## 10. Full audit action list

`server/src/audit/audit.service.ts`, `AUDIT_ACTIONS` const:

```
STAFF_ADDED, STAFF_REMOVED, STAFF_ROLE_CHANGED, STAFF_UPDATED,
STAFF_LOGIN, STAFF_LOGOUT,
WARNING_CREATED, WARNING_EXPIRED, WARNING_REVOKED,
BAN_CREATED, BAN_EXPIRED, BAN_REVOKED,
ROLE_CONFIG_CREATED, ROLE_CONFIG_UPDATED, ROLE_CONFIG_DELETED,
SETTINGS_UPDATED, MESSAGE_TEMPLATE_UPDATED, CHANNEL_ROUTING_UPDATED,
TEST_MODE_ENABLED, TEST_MODE_DISABLED,
ACCESS_DENIED, LOGIN_SUCCESS, DATA_WIPED,
PUNISHMENT_ROLE_GRANT_FAILED
```

Audit logs are append-only (never edited or deleted programmatically) and
exportable as CSV (`data.export` permission). `PUNISHMENT_ROLE_GRANT_FAILED`
exists specifically so a silent Discord permission/hierarchy failure is
visible on the dashboard, not just in server logs — keep that pattern
(record an audit entry, don't just `console.error`) for any other
best-effort side effect you add that can fail non-fatally.

## 11. Open item raised by the owner — not yet independently confirmed

The owner's most recent request (translated from Arabic) was, in
substance: after a data wipe their own staff record disappeared and they
re-added themselves as Manager, which then blocked assigning Manager to
another staff member (Zadjali) due to the singleton rule; they asked
either for a way to log in without auto-creating a staff row, or some
other fix, while keeping their own full access.

Per §4's "platform owner self-corrects on login" behavior, the actual fix
communicated to the owner was: **log out and back in** — this resets their
own row back to `platform_owner` and frees the Manager slot, with no wipe
needed. This is correct per the code as it stands, but the owner had not
yet confirmed it worked as of this handover. If they report it *didn't*
work, the first things to check are (a) `requireAuth.ts`'s owner branch
still calling `findStaffById` and refreshing correctly (§5), and (b)
whether `ensurePlatformOwnerStaffRecord` is actually being invoked on their
login path (it's called from wherever the OAuth callback finalizes the
session — trace from `server/src/api/routes/auth.routes.ts`). No separate
"log in without being added as staff" feature was built, since the
simpler existing behavior should already solve it — only build that if the
owner confirms the self-correction genuinely doesn't work for them.

## 12. Recent commit history (newest first, for context)

```
Add staff welcome DM and player/manager notification DMs
Fix "Unexpected server error" when Add Staff hits the singleton-role rule
Remove staff role from warning/ban messages — only shown in login/logout
Surface punishment-role grant failures instead of failing silently
Fix duplicate name in ban messages and stale owner Discord role
Fix mentions rendering as raw text: never wrap them in backticks
Add on/off toggle for warning/ban revoke Discord notifications
Discord role mentions, ban message fixes, revoke notifications, mobile UI, on-duty enforcement
Owner-only data wipe, punishment roles, PWA installability, baked-in message defaults
Discord role/rule separation, singleton roles, player+staff mentions, settings gating, evidence ordering fix
Fix post-login redirect ignoring BASE_PATH, sending users to domain root
Fix frontend build missing VITE_BASE_PATH, breaking /censorship assets
Add production deploy scripts matching the existing enclaverp.cc box
Add editable message templates, channel routing, and Test Mode
Build ENCLAVE RP moderation control platform
```

Nearly every commit past the initial build was a direct response to a bug
the owner found by using the real, deployed platform and sending a
screenshot or an Arabic description — this is a good project to treat
owner reports as authoritative reproduction steps, not just feature
requests, even when phrased informally.

## 13. Before you ship anything

1. `cd server && npx tsc -p tsconfig.test.json --noEmit && npx vitest run`
2. `cd web && npx tsc --noEmit && npx vite build`
3. Commit to `claude/enclave-rp-moderation-platform-nzaf68` (or update the
   deployed branch pointer if you deliberately rename it — see §1) and push.
4. Tell the owner to run
   `sudo bash /opt/enclave-censorship/app/deploy/update.sh` on the box, or
   do it yourself if you have shell access to it.
5. The owner reads/writes Arabic; when replying to them, match that
   unless they've switched languages first.
