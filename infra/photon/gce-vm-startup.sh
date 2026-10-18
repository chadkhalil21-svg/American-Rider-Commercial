#!/usr/bin/env bash
# Runs on a dedicated Ubuntu 24.04 Compute Engine VM. This is NOT run in CI.
# Installs a version-pinned Photon 1.3.0 with the official USA Photon 1.x dump.
set -Eeuo pipefail
exec > >(tee -a /var/log/ar-photon-bootstrap.log) 2>&1
umask 027
echo "Starting American Rider Photon private U.S. installation"
if [[ "$(id -u)" != "0" ]]; then echo "Run as root"; exit 1; fi
DEVICE=/dev/disk/by-id/google-photon-data
MOUNT=/var/lib/american-rider-photon
JAR=/opt/american-rider-photon/photon-1.3.0.jar
JAR_SHA256=a89707c0045e4807b2a1180e132e68e108d998709f48b6c94b98a6e281f571a5
DUMP_URL=https://download1.graphhopper.com/public/north-america/usa/photon-db-usa-1.0-latest.tar.bz2

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  openjdk-21-jre-headless ca-certificates curl bzip2 tar e2fsprogs
[[ -b "$DEVICE" ]] || { echo "Dedicated disk missing: $DEVICE"; exit 1; }
mkdir -p "$MOUNT" /opt/american-rider-photon
FSTYPE=$(blkid -o value -s TYPE "$DEVICE" || true)
if [[ -z "$FSTYPE" ]]; then
  mkfs.ext4 -F "$DEVICE"
elif [[ "$FSTYPE" != ext4 ]]; then
  echo "Refusing to overwrite a non-ext4 disk"
  exit 1
fi
UUID=$(blkid -o value -s UUID "$DEVICE")
grep -q "UUID=$UUID " /etc/fstab || printf 'UUID=%s %s ext4 defaults,nofail 0 2\n' "$UUID" "$MOUNT" >> /etc/fstab
mountpoint -q "$MOUNT" || mount "$MOUNT"

id -u ar-photon >/dev/null 2>&1 || useradd --system --home-dir "$MOUNT" \
  --shell /usr/sbin/nologin ar-photon
curl --fail --location --retry 4 --connect-timeout 20 \
  https://github.com/komoot/photon/releases/download/1.3.0/photon-1.3.0.jar -o "$JAR.part"
printf '%s  %s\n' "$JAR_SHA256" "$JAR.part" | sha256sum -c -
mv -f "$JAR.part" "$JAR"
chmod 0644 "$JAR"

if [[ ! -d "$MOUNT/photon_data" ]]; then
  # Download on data disk so the boot disk is small. Never untar over a live DB.
  curl --fail --location --retry 4 --connect-timeout 25 \
    "$DUMP_URL" -o "$MOUNT/usa.tar.bz2"
  curl --fail --location --retry 4 --connect-timeout 25 \
    "$DUMP_URL.md5" -o "$MOUNT/usa.tar.bz2.md5"
  EXPECTED=$(awk 'NR==1 {print $1}' "$MOUNT/usa.tar.bz2.md5")
  [[ "$EXPECTED" =~ ^[0-9a-fA-F]{32}$ ]] || { echo "Invalid upstream archive checksum"; exit 1; }
  printf '%s  %s\n' "$EXPECTED" "$MOUNT/usa.tar.bz2" | md5sum -c -
  mkdir -p "$MOUNT/import-pending"
  tar -xjf "$MOUNT/usa.tar.bz2" -C "$MOUNT/import-pending"
  [[ -d "$MOUNT/import-pending/photon_data" ]] || {
    echo "Downloaded dataset did not contain photon_data. Refusing activation."
    exit 1
  }
  mv "$MOUNT/import-pending/photon_data" "$MOUNT/photon_data"
  rmdir "$MOUNT/import-pending" || true
  rm -f "$MOUNT/usa.tar.bz2" "$MOUNT/usa.tar.bz2.md5"
fi
chown -R ar-photon:ar-photon "$MOUNT"
cat >/etc/systemd/system/american-rider-photon.service <<'SERVICE'
[Unit]
Description=American Rider private Photon United States search
Wants=network-online.target
After=network-online.target
[Service]
Type=simple
User=ar-photon
Group=ar-photon
WorkingDirectory=/var/lib/american-rider-photon
ExecStart=/usr/bin/java -Xms1g -Xmx4g -jar /opt/american-rider-photon/photon-1.3.0.jar serve -listen-ip 0.0.0.0 -listen-port 2322
Restart=on-failure
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
LimitNOFILE=65535
[Install]
WantedBy=multi-user.target
SERVICE
systemctl daemon-reload
systemctl enable --now american-rider-photon
echo "Photon process started. Checking local search readiness..."
for i in $(seq 1 90); do
  if curl -fsS --max-time 5 'http://127.0.0.1:2322/api?q=Miami&countrycode=US&limit=2' \
    | grep -q '"features"'; then
    echo "Photon USA search is responsive on private port 2322"
    exit 0
  fi
  sleep 4
done
echo "Photon did not pass health check. Review journalctl -u american-rider-photon"
exit 1
