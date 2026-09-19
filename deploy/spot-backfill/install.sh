#!/usr/bin/env bash
set -euo pipefail
# Run as root with a reviewed, credential-free production manifest as argument.
release_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
manifest_path="${1:?Usage: sudo install.sh /path/to/manifest.json}"
if [[ "$EUID" -ne 0 ]]; then
  printf '%s\n' 'Run as root.' >&2
  exit 1
fi
getent passwd planfix-spot-backfill >/dev/null || useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin planfix-spot-backfill
install -d -m 0755 /opt/planfix-spot-backfill
install -d -m 0750 -o root -g planfix-spot-backfill /etc/planfix-spot-backfill
install -d -m 0750 -o planfix-spot-backfill -g planfix-spot-backfill /var/lib/planfix-spot-backfill
install -m 0644 "$release_dir/backfill.py" "$release_dir/requirements.txt" /opt/planfix-spot-backfill/
install -m 0640 -o root -g planfix-spot-backfill "$manifest_path" /etc/planfix-spot-backfill/manifest.json
python3 -m venv /opt/planfix-spot-backfill/venv
/opt/planfix-spot-backfill/venv/bin/pip install --disable-pip-version-check -r /opt/planfix-spot-backfill/requirements.txt
install -m 0644 "$release_dir/planfix-spot-backfill.service" "$release_dir/planfix-spot-backfill.timer" /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/planfix-spot-backfill.service /etc/systemd/system/planfix-spot-backfill.timer
systemctl daemon-reload
printf '%s\n' 'Installed. Provision credentials, run the read-only check, then enable the timer.'
