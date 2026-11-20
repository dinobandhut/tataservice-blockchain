#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TataService Blockchain — Ubuntu 24.04 System Hardening & Firewall Setup
# Run as root or with sudo: sudo bash 01-system-hardening.sh
# =============================================================================

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: Please run as root (sudo bash $0)" >&2
  exit 1
fi

apt-get update && apt-get upgrade -y
apt-get install -y curl wget git jq openssl ufw fail2ban ca-certificates gnupg lsb-release unzip

# 1. Create dedicated non-privileged service account
if ! id -u tataservice >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/tataservice --shell /usr/sbin/nologin tataservice
fi

# 2. Ensure 4 GB Swap exists if system has <= 2 GB RAM and no swap
TOTAL_MEM_KB=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
TOTAL_SWAP_KB=$(awk '/SwapTotal/ {print $2}' /proc/meminfo)
if [[ "${TOTAL_MEM_KB}" -le 2097152 ]] && [[ "${TOTAL_SWAP_KB}" -eq 0 ]] && [[ ! -f /swapfile ]]; then
  echo "Low RAM detected (${TOTAL_MEM_KB} kB) with 0 Swap. Creating 4 GB /swapfile..."
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 3. Kernel network & memory hardening
cat <<'EOF' > /etc/sysctl.d/99-tataservice.conf
vm.swappiness = 10
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
fs.file-max = 262144
EOF
sysctl --system

# 4. UFW Firewall (SSH + HTTPS + Execution P2P + Consensus P2P only)
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 30303/tcp
ufw allow 30303/udp
ufw allow 9000/tcp
ufw allow 9000/udp
ufw --force enable

# 5. Enable Fail2Ban SSH brute-force protection
systemctl enable --now fail2ban

echo "[01-system-hardening] Completed successfully."
ufw status verbose
