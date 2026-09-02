# Deploying to the existing Oracle Cloud box

This assumes the same box that already runs `enclave-home` (enclaverp.cc),
the store, and the tickets bot. It gets its own directory, service user,
systemd unit, port, and database — nothing here touches theirs, except one
small addition to the Caddy config that makes `enclaverp.cc/censorship`
route to this app instead of 404ing.

## 1. Install

```bash
sudo bash deploy/install.sh
```

This is safe to re-run. It will:

- install PostgreSQL if it isn't already present, and create a
  `enclave_censorship` role/database with a generated password
- create a dedicated `enclave-censorship` system user (this app doesn't
  share a user, or a Discord bot, with the store/home — see below)
- clone (or update) the app into `/opt/enclave-censorship/app`
- `npm ci` + `npm run build` (compiles the server, builds the dashboard)
- write `/etc/enclave-censorship.env` with the database URL and a
  generated session secret already filled in, and the known Discord IDs
  (platform owner, channels, guild) pre-filled — leaving only the bot
  token and client secret blank for you to paste in
- run the database migrations and seed the default staff roles
- install and enable the systemd unit
- print the exact Caddy snippet to add, with its port already substituted

Stop and read its final output — it tells you exactly what's left.

## 2. Why a separate Discord bot

The store and homepage share one Discord application on purpose — it's the
same public-facing bot with modest permissions. This platform needs
**Manage Channels** and the **Server Members** privileged intent to run
staff verification, duty tracking, and Test Mode. Rather than widen what
the public bot can do, it gets its own application
(`1544434302308319293`) with its own token — install.sh does **not**
inherit credentials from `/etc/enclave.env` the way `enclave-home` does.

Get the bot token and client secret from
https://discord.com/developers/applications → that application → Bot tab
/ OAuth2 tab, and paste them into `/etc/enclave-censorship.env`, then:

```bash
sudo systemctl restart enclave-censorship
sudo journalctl -u enclave-censorship -n 30 --no-pager
curl -s http://127.0.0.1:3002/api/auth/me   # match the port install.sh chose
```

That curl should return `{"error":"unauthenticated",...}` — that means the
app is up. Don't move on to step 3 until it does; while the service is
down, `/censorship` just 404s and nothing else on the box is affected.

## 3. Add the Caddy route

`enclave-home`'s installer already added a block for `enclaverp.cc` to
`/etc/caddy/Caddyfile` that looks like this:

```caddyfile
enclaverp.cc, www.enclaverp.cc {
	tls ...

	import cloudflare_only

	encode zstd gzip

	reverse_proxy 127.0.0.1:3001 {
		header_up X-Real-IP {remote_host}
		header_up X-Forwarded-For {remote_host}
	}

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		-Server
	}

	log {
		output file /var/log/caddy/enclave-home.log {
			roll_size 20mb
			roll_keep 5
		}
	}
}
```

Wrap the routing decision in a `route` block so `/censorship*` goes to this
app and everything else still goes to `enclave-home`, unchanged:

```caddyfile
enclaverp.cc, www.enclaverp.cc {
	tls ...

	import cloudflare_only

	encode zstd gzip

	route {
		handle /censorship* {
			reverse_proxy 127.0.0.1:3002 {
				header_up X-Real-IP {remote_host}
				header_up X-Forwarded-For {remote_host}
			}
		}
		handle {
			reverse_proxy 127.0.0.1:3001 {
				header_up X-Real-IP {remote_host}
				header_up X-Forwarded-For {remote_host}
			}
		}
	}

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		-Server
	}

	log {
		output file /var/log/caddy/enclave-home.log {
			roll_size 20mb
			roll_keep 5
		}
	}
}
```

Only two things changed: the single `reverse_proxy` line became a `route`
block containing that same line (now under `handle {}`, matched last) plus
a new `handle /censorship* {}` matched first. `install.sh` already wrote
this exact `handle /censorship*` stanza, with your actual port substituted,
to the path it printed — copy it in rather than retyping it.

Use `handle`, not `handle_path` — `handle` forwards the full
`/censorship/...` path to the app, which is what it expects (it uses the
`/censorship` prefix itself to build the OAuth2 redirect URL and to know
where its own routes start). `handle_path` would strip the prefix before
forwarding and break login.

Then, carefully — a syntax error here takes `enclaverp.cc` down entirely:

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 4. Verify

```bash
curl -s https://enclaverp.cc/censorship/api/auth/me
```

Same `{"error":"unauthenticated",...}` response, now over the real domain.

In the Discord Developer Portal, application `1544434302308319293` →
OAuth2 → Redirects, make sure this exact URL is present:

```
https://enclaverp.cc/censorship/api/auth/discord/callback
```

Then open `https://enclaverp.cc/censorship` in a browser and log in with
the Discord account matching `PLATFORM_OWNER_ID` — that account always has
full access, independent of the staff list.

## Updating

```bash
sudo bash /opt/enclave-censorship/app/deploy/update.sh
```

Pulls, rebuilds, applies any new migrations, and restarts the service. No
Caddy changes are needed for a normal update — only if the port ever
changes (it won't, once chosen).

## Operating it

| | |
| --- | --- |
| Logs | `journalctl -u enclave-censorship -f` |
| Restart | `sudo systemctl restart enclave-censorship` |
| Stop | `sudo systemctl stop enclave-censorship` |
| Status | `systemctl status enclave-censorship` |

## Back up

The database holds everything (staff, warnings, bans, audit logs) — back it
up like any other Postgres database on the box:

```bash
sudo -u postgres pg_dump enclave_censorship | gzip > enclave-censorship-$(date +%F).sql.gz
```

Worth putting in the same daily cron job as the tickets bot's `data/`
backup.

## Memory

This box is an Oracle Cloud Always Free micro shape (1 GB RAM, 2 GB swap —
`setup.sh` from the store repo already added the swap file). Postgres plus
this app plus the store, homepage, and tickets bot on the same box is fine
at this platform's expected traffic, but if you ever see `journalctl -u
enclave-censorship` show OOM kills, the first thing to check is
`sudo -u postgres psql -c "SHOW shared_buffers;"` — Ubuntu's default
PostgreSQL install already tunes this conservatively for a small host, so
it's unlikely to be the culprit, but it's the first place to look.
