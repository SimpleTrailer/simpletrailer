#!/bin/bash
# =====================================================================
# SimpleTrailer Traccar Self-Host Setup-Script
# =====================================================================
# Läuft auf einem frischen Hetzner Ubuntu 24.04 Server.
# Installiert: Docker, Docker-Compose, Traccar, Caddy (SSL), Watchtower
# (Auto-Updates), Restic (Backups).
#
# NUTZUNG (auf Hetzner-Server via SSH):
#   curl -fsSL https://raw.githubusercontent.com/SimpleTrailer/simpletrailer/main/setup-traccar-server.sh | bash -s -- tracker.simpletrailer.de info@simpletrailer.de
#
# ODER lokal hochladen + ausführen:
#   chmod +x setup-traccar-server.sh
#   sudo ./setup-traccar-server.sh tracker.simpletrailer.de info@simpletrailer.de
#
# Parameter:
#   $1 = Domain (z.B. tracker.simpletrailer.de)
#   $2 = E-Mail für Let's-Encrypt-Zertifikat
# =====================================================================
set -euo pipefail

DOMAIN="${1:-tracker.simpletrailer.de}"
EMAIL="${2:-info@simpletrailer.de}"
TRACCAR_VERSION="latest"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo " SimpleTrailer Traccar Server Setup"
echo "════════════════════════════════════════════════════════════════"
echo " Domain:      $DOMAIN"
echo " E-Mail:      $EMAIL"
echo "════════════════════════════════════════════════════════════════"
echo ""
sleep 2

# 1) System-Update
echo "▸ System aktualisieren..."
apt-get update -y
apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
apt-get install -y curl wget git ufw fail2ban

# 2) Docker installieren
if ! command -v docker &> /dev/null; then
  echo "▸ Docker installieren..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# 3) Firewall konfigurieren
echo "▸ Firewall (UFW) konfigurieren..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp       # SSH
ufw allow 80/tcp       # HTTP (Let's Encrypt)
ufw allow 443/tcp      # HTTPS (Admin-UI)
ufw allow 5027/tcp     # Teltonika TCP
ufw allow 5027/udp     # Teltonika UDP (fallback)
ufw --force enable

# 4) fail2ban gegen Brute-Force-SSH
echo "▸ fail2ban aktivieren..."
systemctl enable fail2ban
systemctl start fail2ban

# 5) Verzeichnis-Struktur
echo "▸ Traccar-Verzeichnisse erstellen..."
mkdir -p /opt/traccar/{conf,logs,data,backups}
mkdir -p /opt/caddy/data

# 6) Traccar-Konfiguration
echo "▸ Traccar-Konfig (traccar.xml) schreiben..."
ADMIN_PASSWORD="$(openssl rand -base64 16 | tr -d '=+/')"
DB_PASSWORD="$(openssl rand -base64 24 | tr -d '=+/')"

cat > /opt/traccar/conf/traccar.xml <<EOF
<?xml version='1.0' encoding='UTF-8'?>
<!DOCTYPE properties SYSTEM 'http://java.sun.com/dtd/properties.dtd'>
<properties>
    <entry key='config.default'>./conf/default.xml</entry>

    <!-- Web-UI -->
    <entry key='web.port'>8082</entry>
    <entry key='web.origin'>https://$DOMAIN</entry>

    <!-- Datenbank: H2 lokal (ausreichend bis ~100 Tracker, später Postgres) -->
    <entry key='database.driver'>org.h2.Driver</entry>
    <entry key='database.url'>jdbc:h2:./data/database;DB_CLOSE_DELAY=-1</entry>
    <entry key='database.user'>sa</entry>
    <entry key='database.password'>$DB_PASSWORD</entry>

    <!-- Geofencing aktivieren -->
    <entry key='geofence.polygon'>true</entry>

    <!-- Events: Wir wollen Schock-Events + Geofence-Events -->
    <entry key='event.enable'>true</entry>
    <entry key='event.ignoreDuplicateAlerts'>true</entry>
    <entry key='event.motion.enable'>true</entry>
    <entry key='event.overspeed.enable'>true</entry>
    <entry key='event.overspeed.limit'>120</entry>
    <entry key='event.overspeed.minimalDuration'>60</entry>

    <!-- API für unsere Vercel-Cron -->
    <entry key='web.console'>true</entry>
</properties>
EOF

# 7) Docker-Compose
echo "▸ Docker-Compose erstellen..."
cat > /opt/traccar/docker-compose.yml <<EOF
version: '3.8'
services:
  traccar:
    image: traccar/traccar:$TRACCAR_VERSION
    container_name: traccar
    restart: unless-stopped
    ports:
      - "8082:8082"
      - "5027:5027"
      - "5027:5027/udp"
    volumes:
      - ./conf/traccar.xml:/opt/traccar/conf/traccar.xml:ro
      - ./logs:/opt/traccar/logs
      - ./data:/opt/traccar/data
    environment:
      - JAVA_OPTS=-Xms256m -Xmx768m
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8082/"]
      interval: 30s
      timeout: 10s
      retries: 3

  caddy:
    image: caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - /opt/caddy/data:/data
    depends_on:
      - traccar

  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - WATCHTOWER_CLEANUP=true
      - WATCHTOWER_SCHEDULE=0 0 4 * * *
      - WATCHTOWER_NOTIFICATIONS_HOSTNAME=$DOMAIN
EOF

# 8) Caddy-Konfig (Reverse-Proxy mit Auto-SSL)
echo "▸ Caddy-Konfig (Auto-SSL via Let's Encrypt)..."
cat > /opt/traccar/Caddyfile <<EOF
$DOMAIN {
    tls $EMAIL
    reverse_proxy traccar:8082

    log {
        output file /data/access.log
        format console
    }

    encode gzip

    header {
        Strict-Transport-Security "max-age=31536000;"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer"
        -Server
    }
}
EOF

# 9) Backup-Script
echo "▸ Tägliches Backup einrichten..."
cat > /opt/traccar/backup.sh <<'BACKUP_EOF'
#!/bin/bash
BACKUP_DIR="/opt/traccar/backups"
DATE=$(date +%Y-%m-%d_%H-%M)
docker exec traccar sh -c "cd /opt/traccar/data && tar czf - ." > "$BACKUP_DIR/traccar-$DATE.tar.gz"
# Behalte nur letzte 14 Backups
ls -tp "$BACKUP_DIR"/traccar-*.tar.gz | tail -n +15 | xargs -d '\n' -r rm --
BACKUP_EOF
chmod +x /opt/traccar/backup.sh

cat > /etc/cron.d/traccar-backup <<EOF
0 3 * * * root /opt/traccar/backup.sh > /dev/null 2>&1
EOF

# 10) Start
echo "▸ Traccar-Stack starten..."
cd /opt/traccar
docker compose up -d

# 11) Warten + Health-Check
echo "▸ Warte 60 Sek bis Traccar bereit ist..."
sleep 60

# 12) Admin-User anlegen via API (Default-Admin ist admin/admin — sofort ändern!)
echo "▸ Admin-Passwort auf zufälligen Wert setzen..."
sleep 5
curl -s -u admin:admin -X PUT "https://$DOMAIN/api/users/1" \
  -H "Content-Type: application/json" \
  -d "{\"id\":1,\"name\":\"SimpleTrailer Admin\",\"email\":\"$EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"administrator\":true}" \
  || echo "⚠ Konnte Admin-Passwort nicht via API setzen — bitte manuell ändern in Web-UI"

# 13) Fertig
echo ""
echo "════════════════════════════════════════════════════════════════"
echo " ✅ FERTIG"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo " Traccar Admin-UI:   https://$DOMAIN"
echo " Login:              $EMAIL"
echo " Initial-Passwort:   $ADMIN_PASSWORD"
echo "                     ⚠ Sofort ändern unter Account → Profile"
echo ""
echo " Tracker-Endpoint:   $DOMAIN:5027 (TCP)"
echo " API-Endpoint:       https://$DOMAIN/api"
echo ""
echo " Vercel-ENVs setzen:"
echo "   TRACCAR_URL       = https://$DOMAIN"
echo "   TRACCAR_USERNAME  = $EMAIL"
echo "   TRACCAR_PASSWORD  = $ADMIN_PASSWORD"
echo ""
echo " Backups:            /opt/traccar/backups (täglich 03:00)"
echo " Auto-Updates:       Täglich 04:00 via Watchtower"
echo " Logs:               docker logs -f traccar"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
echo " WICHTIG: Speichere das Passwort jetzt sicher (z.B. Bitwarden):"
echo "          $ADMIN_PASSWORD"
echo ""
