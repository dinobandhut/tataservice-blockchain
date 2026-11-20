# Ubuntu 24.04 LTS Production Deployment Guide — TataService Blockchain

This guide covers deploying **TataService Blockchain (Chain ID `810161`, Native Coin `TATA`, Total Supply `1,000,000,000 TATA`)** onto an Ubuntu 24.04 LTS server (`x86_64`).

## 1. Hardware & Cloud Firewall Prerequisites
- **Recommended Production Validator:** 4 vCPU, 8–16 GB RAM, 200+ GB NVMe SSD.
- **Low-Memory Devnet / Testnet Mode (1 GB RAM VPS + 4 GB Swap):** Use `docker-compose.lowmem.yml` (skipping Prometheus/Grafana on the 1 GB instance).
- **Cloud Security List / VCN Ingress Rules (e.g., Oracle Cloud):**
  - Open `22/tcp` (SSH), `80/tcp`, `443/tcp`
  - Open `30303/tcp` and `30303/udp` (Go-Ethereum P2P)
  - Open `9000/tcp` and `9000/udp` (Lighthouse Libp2p)
  - Keep `8545`, `8546`, `8551`, `5052`, `5062`, `5432`, `4000`, `9090`, and `3001` **closed** to the public internet.

## 2. Option A: Docker Compose Deployment (Recommended)
1. Copy the repository onto your server and enter the project directory.
2. Create your environment file from template and set your real `0x...` genesis addresses and strong passwords:
   ```bash
   cp network/.env.node.example .env
   nano .env
   ```
3. Verify total supply math (`1,000,000,000 TATA`):
   ```bash
   node network/scripts/verify-genesis-supply.mjs
   ```
4. Generate encrypted EIP-2335 validator keystores and `genesis.ssz`:
   ```bash
   chmod +x network/scripts/*.sh
   ./network/scripts/generate-validator-keys.sh
   ./network/scripts/generate-genesis.sh
   ```
5. Start the stack:
   - Standard server (4+ GB RAM):
     ```bash
     docker compose up -d --build
     ```
   - Low-memory 1 GB RAM + 4 GB Swap VPS:
     ```bash
     docker compose -f docker-compose.yml -f docker-compose.lowmem.yml up -d --build
     ```

## 3. Option B: Native Systemd Deployment on Ubuntu 24.04
Run the deployment scripts in sequence as `root`:
```bash
sudo bash deploy/ubuntu-24.04/01-system-hardening.sh
sudo bash deploy/ubuntu-24.04/02-install-clients.sh
sudo bash deploy/ubuntu-24.04/03-setup-node.sh
sudo bash deploy/ubuntu-24.04/04-setup-postgres-app.sh
```
After generating `genesis.ssz` and importing encrypted validator keystores, start all daemons:
```bash
sudo systemctl start geth-tata lighthouse-bn-tata lighthouse-vc-tata tata-explorer-api
sudo systemctl status geth-tata lighthouse-bn-tata lighthouse-vc-tata tata-explorer-api
```

## 4. Enable HTTPS (TLS) with Let's Encrypt
Point your DNS `A` record (e.g., `rpc.yourdomain.com` / `explorer.yourdomain.com`) to your server IP, then run:
```bash
sudo certbot --nginx -d rpc.yourdomain.com -d explorer.yourdomain.com
```

## 5. Encrypted Backup & Recovery
Always stop the validator client momentarily (automated inside the script) before copying `slashing_protection.sqlite`:
```bash
sudo bash deploy/ubuntu-24.04/05-backup-and-restore.sh backup /var/backups/tataservice
```
