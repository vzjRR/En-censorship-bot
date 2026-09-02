#!/usr/bin/env bash
#
# Install the ENCLAVE RP censorship platform on the same Oracle Cloud box
# as the store, homepage, and tickets bot.
#
#   sudo bash deploy/install.sh
#
# Follows the same conventions as vzjRR/enclave-home and
# vzjRR/enclave-tickets-bot: its own systemd unit, its own service user,
# an env file in /etc, a version-controlled unit, an auto-picked free port.
#
# What's different from those two: this app has its own database
# (PostgreSQL — the others use flat JSON files) and its own build step
# (TypeScript + Vite — the others run plain JS directly), and it does NOT
# assume it shares a Discord application with the store/home. Those serve
# the public with modest permissions; this one needs Manage Channels and
# the Server Members intent to run a moderation panel, so it gets its own
# bot in the Developer Portal rather than widening what the public-facing
# bot can do.
#
# Safe to re-run: every step checks before acting, same as the store's
# setup.sh. It does NOT touch /etc/caddy/Caddyfile, for the same reason
# enclave-home's installer doesn't — that file is serving live traffic for
# your other apps, and a script that rewrites it is one bad regex away from
# taking them down too. The Caddy snippet is printed at the end for you to
# paste in by hand.

set -euo pipefail

APP_DIR=/opt/enclave-censorship/app
ENV_FILE=/etc/enclave-censorship.env
SERVICE_USER=enclave-censorship
REPO=https://github.com/vzjRR/En-censorship-bot
BRANCH="${BRANCH:-claude/enclave-rp-moderation-platform-nzaf68}"
DB_NAME=enclave_censorship
DB_USER=enclave_censorship
# Single source of truth for the sub-path this deploys under — used both
# for the server's BASE_PATH (in the env file) and for the frontend build
# below. They MUST match: the built HTML references its own assets and API
# calls using this prefix, and if the build doesn't know about it, the
# browser requests unprefixed paths that fall through to whatever else is
# listening on the domain instead of 404ing obviously.
SITE_BASE_PATH=/censorship

log()  { printf '\033[1;35m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m  ! \033[0m%s\n' "$1"; }
ok()   { printf '\033[1;32m  \xE2\x9C\x93 \033[0m%s\n' "$1"; }

[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }

# Without these, `apt-get install` on Ubuntu 24.04 hangs at "Scanning
# processes... Scanning candidates... Scanning linux images..." — that's
# needrestart's post-install hook waiting on an interactive "restart these
# services?" prompt with no way to answer it in a non-interactive script.
# The store's own setup.sh sets the first of these for the same reason;
# NEEDRESTART_MODE=a (automatic) is the belt-and-braces addition that stops
# needrestart's own prompt specifically, since it doesn't always fully defer
# to DEBIAN_FRONTEND on its own.
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

# ------------------------------------------------------------------ node

if ! command -v node >/dev/null; then
    echo "node is not installed — the other Enclave apps need it too, so something is off" >&2
    exit 1
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 18 )); then
    echo "node $node_major is too old; this needs 18 or newer" >&2
    exit 1
fi
ok "node $(node -v)"

# -------------------------------------------------------------- postgres

if ! command -v psql >/dev/null; then
    log "Installing PostgreSQL"
    apt-get update -qq
    apt-get install -y -qq postgresql >/dev/null
else
    ok "postgresql already installed"
fi
systemctl enable --quiet --now postgresql

DB_PASSWORD_FILE="/etc/enclave-censorship.dbpassword"
if [[ ! -f "$DB_PASSWORD_FILE" ]]; then
    log "Provisioning database role and database"
    DB_PASSWORD="$(openssl rand -hex 24)"
    sudo -u postgres psql -v ON_ERROR_STOP=1 >/dev/null <<SQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
                CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD';
            END IF;
        END
        \$\$;
SQL
    if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
        sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" >/dev/null
    fi
    printf '%s' "$DB_PASSWORD" > "$DB_PASSWORD_FILE"
    chmod 600 "$DB_PASSWORD_FILE"
    ok "created role and database '$DB_NAME'"
else
    DB_PASSWORD="$(cat "$DB_PASSWORD_FILE")"
    ok "database role/password already provisioned"
fi
DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"

# ------------------------------------------------------------------ user

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    log "Creating service user $SERVICE_USER"
    useradd --system --home /opt/enclave-censorship --shell /usr/sbin/nologin "$SERVICE_USER"
else
    ok "service user $SERVICE_USER already exists"
fi

# ------------------------------------------------------------- checkout

log "Installing to $APP_DIR"
mkdir -p "$APP_DIR"

if [[ -d "$APP_DIR/.git" ]]; then
    git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
    git -C "$APP_DIR" fetch --quiet --all
    git -C "$APP_DIR" reset --quiet --hard "origin/$BRANCH"
    ok "updated existing checkout to origin/$BRANCH"
else
    git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
    ok "cloned $BRANCH"
fi

# ------------------------------------------------------------------ build

log "Installing dependencies and building (server + web)"
( cd "$APP_DIR" && npm ci --no-audit --no-fund >/dev/null && VITE_BASE_PATH="$SITE_BASE_PATH" npm run build >/dev/null )
ok "build complete (frontend built for base path $SITE_BASE_PATH)"

# ----------------------------------------------------------------- port

# Same lesson enclave-home's installer already paid for: don't assume a
# port is free on a box running several other services. 3000 is the store,
# 3001 is the homepage.
port_free() {
    node -e '
        const net = require("net");
        const server = net.createServer();
        server.once("error", () => process.exit(1));
        server.listen(Number(process.argv[1]), "127.0.0.1", () => {
            server.close(() => process.exit(0));
        });
    ' "$1" 2>/dev/null
}

pick_port() {
    local candidate=$1
    local limit=$((candidate + 40))
    while (( candidate < limit )); do
        if port_free "$candidate"; then
            printf '%s' "$candidate"
            return 0
        fi
        candidate=$((candidate + 1))
    done
    return 1
}

# ------------------------------------------------------------------ env

if [[ -f "$ENV_FILE" ]]; then
    ok "$ENV_FILE already exists — left untouched"
    existing_port="$(grep -m1 '^PORT=' "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]')"
    if [[ -n "$existing_port" ]] && ! port_free "$existing_port"; then
        warn "PORT=$existing_port in $ENV_FILE is already in use by another process."
        warn "The service will fail to start with EADDRINUSE. Pick a free port:"
        suggestion="$(pick_port "$existing_port" || echo '')"
        if [[ -n "$suggestion" ]]; then
            warn "  sed -i 's/^PORT=.*/PORT=$suggestion/' $ENV_FILE"
            warn "  and match it in the Caddy snippet's reverse_proxy line."
        fi
    fi
    PORT_CHOSEN="${existing_port:-3002}"
else
    PORT_CHOSEN="$(pick_port 3002)" || {
        echo "no free port found in 3002-3042" >&2
        exit 1
    }
    if [[ "$PORT_CHOSEN" != "3002" ]]; then
        warn "3002 is taken on this host; using $PORT_CHOSEN instead."
    fi

    SESSION_SECRET="$(openssl rand -hex 32)"

    log "Writing $ENV_FILE (port $PORT_CHOSEN)"
    cat > "$ENV_FILE" <<EOF
# ENCLAVE RP censorship platform. Fill in the Discord blanks below, then:
#   sudo systemctl restart enclave-censorship

NODE_ENV=production
PORT=$PORT_CHOSEN
APP_BASE_URL=https://enclaverp.cc
BASE_PATH=$SITE_BASE_PATH

DATABASE_URL=$DATABASE_URL

# Generated automatically — no need to touch this.
SESSION_SECRET=$SESSION_SECRET

# --- Fill these in from the Discord Developer Portal application
# --- 1544434302308319293 (Bot tab -> Reset Token; OAuth2 tab -> Client Secret).
# --- This is a SEPARATE bot from the store/home one: it needs Manage
# --- Channels + the Server Members intent, which the public-facing bot
# --- deliberately doesn't have.
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=1544434302308319293
DISCORD_CLIENT_SECRET=
# Same physical Discord server as the store/home use — confirm this matches
# before going live (right-click the server icon -> Copy Server ID).
DISCORD_GUILD_ID=1535571261395312680

PLATFORM_OWNER_ID=1303195553068482591
BOT_ID=1544434302308319293
STAFF_LOG_CHANNEL_ID=1539101062152069202
WARNING_CHANNEL_ID=1539103436308611082
BAN_CHANNEL_ID=1539102903745249372

TIMEZONE=Asia/Muscat
EXPIRATION_WORKER_INTERVAL_MS=60000
EVIDENCE_STORAGE_DRIVER=discord
MAX_EVIDENCE_FILE_SIZE_MB=25
EOF
    chmod 640 "$ENV_FILE"
    ok "created — it still needs the three Discord blanks filling in"
fi

chown root:"$SERVICE_USER" "$ENV_FILE"
mkdir -p "$APP_DIR/server/uploads"
chown -R "$SERVICE_USER:$SERVICE_USER" /opt/enclave-censorship

# -------------------------------------------------------------- migrate

# migrate.ts/seed.ts resolve their SQL files relative to process.cwd(), so
# this must run from server/ — and it needs every value in the env file
# (DATABASE_URL, the Discord IDs, etc.) exported into that shell first.
# On a fresh install DISCORD_BOT_TOKEN/CLIENT_SECRET are still blank (you
# haven't pasted them in yet) — config validation requires *something*
# there even though a pure database migration never touches Discord, so
# fall back to harmless placeholders for just this step when they're empty.
log "Running database migrations and seeding default staff roles"
sudo -u "$SERVICE_USER" bash -c "
    set -a
    source '$ENV_FILE'
    : \"\${DISCORD_BOT_TOKEN:=pending-setup}\"
    : \"\${DISCORD_CLIENT_SECRET:=pending-setup}\"
    set +a
    cd '$APP_DIR/server'
    node dist/database/migrate.js
    node dist/database/seed.js
"
ok "database ready"

# --------------------------------------------------------------- service

log "Installing the systemd unit"
install -m 644 "$APP_DIR/deploy/enclave-censorship.service" /etc/systemd/system/enclave-censorship.service
systemctl daemon-reload
systemctl enable --quiet enclave-censorship
ok "enclave-censorship enabled"

# ----------------------------------------------------------------- done

BLOCK_OUT=/tmp/enclaverp-censorship-caddy-snippet.conf
sed -e "s|127\.0\.0\.1:3002|127.0.0.1:${PORT_CHOSEN}|g" \
    "$APP_DIR/deploy/Caddyfile.snippet" > "$BLOCK_OUT"
ok "Caddy snippet written to $BLOCK_OUT (upstream 127.0.0.1:$PORT_CHOSEN)"

cat <<EOF

$(log "Next, by hand")

1. Fill in the three blank Discord values in $ENV_FILE
   (DISCORD_BOT_TOKEN, DISCORD_CLIENT_SECRET — and double-check
   DISCORD_GUILD_ID is really your server), then:

     sudo systemctl restart enclave-censorship
     sudo journalctl -u enclave-censorship -n 30 --no-pager
     curl -s http://127.0.0.1:$PORT_CHOSEN/api/auth/me

   That curl should return {"error":"unauthenticated",...} — that's
   correct, it means the app is up and answering. Do not go to step 2
   until it does. While the service is down, /censorship simply 404s;
   it does not affect enclaverp.cc's homepage or store.

2. Add the censorship platform's route into the existing enclaverp.cc
   block in /etc/caddy/Caddyfile (it currently proxies everything to
   enclave-home on 3001 — this adds a /censorship* route ahead of that
   without disturbing it). See $APP_DIR/deploy/README.md for the exact
   before/after and how to merge it in. The snippet to insert is at:

     $BLOCK_OUT

   Then, before reloading — a syntax error here takes enclaverp.cc down:

     sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
     sudo caddy validate --config /etc/caddy/Caddyfile
     sudo systemctl reload caddy

3. Check it:

     curl -s https://enclaverp.cc/censorship/api/auth/me

4. In the Discord Developer Portal (application 1544434302308319293),
   OAuth2 -> Redirects, make sure this exact URL is listed:

     https://enclaverp.cc/censorship/api/auth/discord/callback

5. Open https://enclaverp.cc/censorship in a browser and log in with the
   Discord account matching PLATFORM_OWNER_ID — that account always has
   full access regardless of the staff list.

EOF
