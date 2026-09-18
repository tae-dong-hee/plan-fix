#!/usr/bin/env bash
# Run as root on the existing frontend VM. Images stay local for rollback.
set -Eeuo pipefail
umask 077

IMAGE="${PLANFIX_IMAGE:-asia-northeast3-docker.pkg.dev/planfix-01/planfix-frontend/frontend:production}"
REGISTRY="${IMAGE%%/*}"
STATE_DIR="${PLANFIX_STATE_DIR:-/var/lib/planfix-frontend}"
RUNTIME_DIR="${PLANFIX_RUNTIME_DIR:-/run/planfix-frontend}"
COMPOSE_FILE="${PLANFIX_COMPOSE_FILE:-/opt/planfix-frontend/compose.yaml}"
LIVE_CONTAINER="planfix-fe-frontend-1"
CANDIDATE_CONTAINER="planfix-frontend-candidate"
HEALTH_TIMEOUT="${PLANFIX_HEALTH_TIMEOUT_SECONDS:-30}"
METADATA_URL="http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
CANDIDATE_CREATED=0
CUTOVER_IN_PROGRESS=0
REJECT_ON_EXIT=0
DESIRED_IMAGE=""
AUTH_DIR=""

log() { printf 'planfix-frontend: %s\n' "$*"; }

valid_image_id() { [[ "$1" =~ ^sha256:[a-f0-9]{64}$ ]]; }

read_current() {
  local line
  IFS= read -r line < "$STATE_DIR/current.env" || return 1
  local image_id="${line#PLANFIX_FRONTEND_IMAGE=}"
  [[ "$line" == "PLANFIX_FRONTEND_IMAGE=$image_id" ]] && valid_image_id "$image_id" || return 1
  printf '%s\n' "$image_id"
}

write_state() {
  local destination="$1" image_id="$2" temporary
  valid_image_id "$image_id" || return 1
  temporary="$(mktemp "$STATE_DIR/.state.XXXXXX")"
  printf 'PLANFIX_FRONTEND_IMAGE=%s\n' "$image_id" > "$temporary"
  mv -f "$temporary" "$destination"
}

compose_up() {
  PLANFIX_FRONTEND_IMAGE="$1" docker compose \
    --project-name planfix-fe --file "$COMPOSE_FILE" \
    up --detach --no-deps --pull never frontend
}

http_ok() {
  local status
  status="$(curl --silent --show-error --fail --connect-timeout 2 --max-time 5 \
    --output /dev/null --write-out '%{http_code}' "$1" 2>/dev/null)" || return 1
  [[ "$status" == 200 ]]
}

version_ok() {
  local response
  response="$(curl --silent --show-error --fail --connect-timeout 2 --max-time 5 \
    "$1/deploy-version.json" 2>/dev/null)" || return 1
  printf '%s' "$response" | python3 -c \
    'import json,sys; sys.exit(0 if json.load(sys.stdin).get("commit") == sys.argv[1] else 1)' \
    "$2" 2>/dev/null
}

wait_healthy() {
  local base_url="$1" revision="${2:-}" deadline=$((SECONDS + HEALTH_TIMEOUT))
  while true; do
    if { [[ -n "$revision" ]] && version_ok "$base_url" "$revision"; } || \
       { [[ -z "$revision" ]] && http_ok "$base_url/"; }; then
      if http_ok "$base_url/api/v1/spots?size=1"; then return 0; fi
    fi
    (( SECONDS < deadline )) || return 1
    sleep 2
  done
}

restore_current() {
  local saved
  saved="$(read_current)" || return 1
  log "Restoring saved image $saved."
  compose_up "$saved" && wait_healthy http://127.0.0.1
}

on_exit() {
  local status=$? saved=""
  trap - EXIT INT TERM
  # current.env is the commit point. An interrupted cutover is restored unless
  # its new image was already committed after successful health checks.
  if [[ "$CUTOVER_IN_PROGRESS" == 1 ]]; then
    saved="$(read_current)" || status=1
    if [[ "$saved" != "$DESIRED_IMAGE" ]]; then
      if [[ "$REJECT_ON_EXIT" == 1 ]]; then
        touch "$STATE_DIR/rejected/${DESIRED_IMAGE#sha256:}"
      fi
      if restore_current; then
        log "Rollback completed."
      else
        log "ERROR: Rollback failed; the next run will retry the saved image."
        status=1
      fi
    fi
  fi
  if [[ "$CANDIDATE_CREATED" == 1 ]]; then
    docker container rm --force "$CANDIDATE_CONTAINER" >/dev/null 2>&1 || true
  fi
  [[ -z "$AUTH_DIR" ]] || rm -rf -- "$AUTH_DIR"
  exit "$status"
}

mkdir -p "$STATE_DIR/rejected" "$RUNTIME_DIR"
exec 9> "$RUNTIME_DIR/deploy.lock"
flock --nonblock 9 || exit 0
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

live_image="$(docker container inspect --format '{{.Image}}' "$LIVE_CONTAINER" 2>/dev/null || true)"
if [[ ! -f "$STATE_DIR/current.env" ]]; then
  valid_image_id "$live_image" || { log "ERROR: No existing image or saved deployment to adopt."; exit 1; }
  write_state "$STATE_DIR/current.env" "$live_image"
  log "Adopted existing frontend image $live_image."
fi
saved_image="$(read_current)" || { log "ERROR: Invalid saved deployment state."; exit 1; }
running="$(docker container inspect --format '{{.State.Running}}' "$LIVE_CONTAINER" 2>/dev/null || true)"
if [[ "$live_image" != "$saved_image" || "$running" != true ]]; then
  restore_current || { log "ERROR: Unable to restore the saved deployment."; exit 1; }
fi

# Delete only this deployer's disposable candidate, including one left by a
# previous power loss. Registry credentials never enter the persistent config.
docker container rm --force "$CANDIDATE_CONTAINER" >/dev/null 2>&1 || true
AUTH_DIR="$(mktemp -d "$RUNTIME_DIR/docker.XXXXXX")"
export DOCKER_CONFIG="$AUTH_DIR"
curl --silent --show-error --fail --connect-timeout 2 --max-time 5 \
  --header 'Metadata-Flavor: Google' "$METADATA_URL" |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' |
  timeout 30 docker login --username oauth2accesstoken --password-stdin "$REGISTRY" >/dev/null 2>&1
timeout 120 docker pull "$IMAGE" >/dev/null
DESIRED_IMAGE="$(docker image inspect --format '{{.Id}}' "$IMAGE")"
valid_image_id "$DESIRED_IMAGE" || { log "ERROR: Registry returned an invalid image ID."; exit 1; }
if [[ "$DESIRED_IMAGE" == "$saved_image" ]]; then exit 0; fi
if [[ -e "$STATE_DIR/rejected/${DESIRED_IMAGE#sha256:}" ]]; then exit 0; fi

revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$DESIRED_IMAGE")"
if [[ ! "$revision" =~ ^[a-f0-9]{40}$ ]]; then
  touch "$STATE_DIR/rejected/${DESIRED_IMAGE#sha256:}"
  log "ERROR: Rejected image without a valid Git commit label."
  exit 1
fi

CANDIDATE_CREATED=1
if ! docker run --detach --name "$CANDIDATE_CONTAINER" \
     --publish 127.0.0.1:18080:80 "$DESIRED_IMAGE" >/dev/null || \
   ! wait_healthy http://127.0.0.1:18080 "$revision"; then
  log "ERROR: Candidate $revision failed validation; live frontend is unchanged. A later run will retry."
  exit 1
fi

# The previous image remains saved and is never pruned, including the legacy
# image that does not yet provide deploy-version.json.
write_state "$STATE_DIR/previous.env" "$saved_image"
CUTOVER_IN_PROGRESS=1
if ! compose_up "$DESIRED_IMAGE" || ! wait_healthy http://127.0.0.1 "$revision"; then
  REJECT_ON_EXIT=1
  log "ERROR: Cutover failed for $revision; rolling back."
  exit 1
fi
write_state "$STATE_DIR/current.env" "$DESIRED_IMAGE"
CUTOVER_IN_PROGRESS=0
log "Deployed frontend commit $revision ($DESIRED_IMAGE)."
