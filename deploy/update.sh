#!/usr/bin/env bash
#
# Update an existing install to the latest commit on the deployed branch.
#
#   sudo bash /opt/enclave-censorship/app/deploy/update.sh
#
# Rebuilds and re-migrates every time — both are safe to run against an
# already-up-to-date checkout (the build is deterministic, and Drizzle
# tracks which migrations already applied).

set -euo pipefail

APP_DIR=/opt/enclave-censorship/app
ENV_FILE=/etc/enclave-censorship.env
SERVICE_USER=enclave-censorship

log()  { printf '\033[1;35m==>\033[0m %s\n' "$1"; }
ok()   { printf '\033[1;32m  \xE2\x9C\x93 \033[0m%s\n' "$1"; }

[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }

log "Pulling latest"
# The checkout is owned by the service user; git run as anyone else refuses
# it as "dubious ownership" — same reasoning as enclave-tickets-bot's
# update steps.
sudo -u "$SERVICE_USER" git -C "$APP_DIR" pull --quiet
ok "pulled"

log "Installing dependencies and rebuilding"
# The frontend must be built knowing its own BASE_PATH — pull whatever is
# actually configured in the live env file rather than assuming, so this
# self-heals if that value is ever changed.
site_base_path="$(grep -m1 '^BASE_PATH=' "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]')"
( cd "$APP_DIR" && npm ci --no-audit --no-fund >/dev/null && VITE_BASE_PATH="$site_base_path" npm run build >/dev/null )
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
ok "build complete (frontend built for base path '$site_base_path')"

log "Applying any new database migrations"
sudo -u "$SERVICE_USER" bash -c "
    set -a
    source '$ENV_FILE'
    set +a
    cd '$APP_DIR/server'
    node dist/database/migrate.js
"
ok "migrations applied"

log "Restarting"
systemctl restart enclave-censorship
sleep 2
systemctl is-active --quiet enclave-censorship && ok "enclave-censorship is running" || {
    echo "service did not come back up — check: journalctl -u enclave-censorship -n 50" >&2
    exit 1
}
