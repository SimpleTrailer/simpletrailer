#!/usr/bin/env bash
# =====================================================================
# Traccar-Admin-Reset für SimpleTrailer
# =====================================================================
# Setzt den Traccar-Admin auf info@simpletrailer.de + neues Random-PW.
#
# Verwendung (DIREKT auf dem Hetzner-Server als root):
#   curl -fsSL https://raw.githubusercontent.com/SimpleTrailer/simpletrailer/main/scripts/reset-traccar-admin.sh | bash
#
# Was es macht:
#   1. Backup der Traccar-DB
#   2. Container stoppen
#   3. database.mv.db löschen (= Default-Admin admin/admin wieder aktiv)
#   4. Container starten + 30 Sek warten
#   5. Default-Admin via API auf info@simpletrailer.de + neues Random-PW updaten
#   6. Login verifizieren
#   7. Neues Passwort ausgeben
#
# WAS VERLOREN GEHT:
#   - Alle Devices in Traccar (müssen neu registriert werden — wir haben 2)
#   - Alle Geofences (müssen neu angelegt werden)
#   - 10-Tage-alte Position-History (egal, war eh nicht synchronisiert)
# =====================================================================
set -euo pipefail

echo "════════════════════════════════════════════════════════════"
echo " TRACCAR-ADMIN-RESET"
echo "════════════════════════════════════════════════════════════"

# Sanity-Check: sind wir auf einem Traccar-Server?
if [ ! -d "/opt/traccar" ]; then
  echo "✗ /opt/traccar fehlt — bist du auf dem richtigen Server?"
  exit 1
fi

# Neues sicheres Passwort generieren (24 Zeichen, alphanumeric — keine Sonderzeichen damit Vercel/Eintippen klappt)
NEW_PW="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)"

# 1) Backup
BACKUP_DIR="/root/traccar-backups"
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -a /opt/traccar/data "$BACKUP_DIR/data-$TS" 2>/dev/null || true
echo "▸ Backup: $BACKUP_DIR/data-$TS"

# 2) Container stoppen
echo "▸ Traccar stoppen"
cd /opt/traccar
docker compose stop traccar 2>/dev/null || docker stop traccar 2>/dev/null || true
sleep 2

# 3) H2-DB löschen
echo "▸ H2-DB löschen (Default-Admin admin/admin wird wieder aktiv)"
rm -f /opt/traccar/data/database.mv.db /opt/traccar/data/database.trace.db /opt/traccar/data/database.lock.db

# 4) Container starten
echo "▸ Traccar starten"
docker compose up -d 2>&1 | tail -5
echo "▸ Warte 30 Sek bis Traccar Boot fertig…"
sleep 30

# 5) Auf Bereitschaft warten
echo "▸ Warte auf Traccar-API…"
for i in 1 2 3 4 5 6 7 8 9 10; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -u admin:admin http://localhost:8082/api/server || echo 000)"
  if [ "$CODE" = "200" ]; then
    echo "  ✓ Traccar bereit"
    break
  fi
  echo "  Versuch $i: HTTP $CODE — warte 5 Sek…"
  sleep 5
done

# 6) Default-Admin (User-ID 1) auf info@simpletrailer.de + neues PW updaten
echo "▸ Admin-User updaten"
RESPONSE="$(curl -s -u admin:admin -X PUT 'http://localhost:8082/api/users/1' \
  -H 'Content-Type: application/json' \
  -d "{\"id\":1,\"name\":\"SimpleTrailer Admin\",\"email\":\"info@simpletrailer.de\",\"password\":\"$NEW_PW\",\"administrator\":true}")"

# 7) Verifikation
echo "▸ Verifiziere Login mit neuem PW…"
VERIFY="$(curl -s -o /dev/null -w '%{http_code}' -u "info@simpletrailer.de:$NEW_PW" http://localhost:8082/api/devices)"

echo ""
echo "════════════════════════════════════════════════════════════"
if [ "$VERIFY" = "200" ]; then
  echo "  ✅ ERFOLG"
else
  echo "  ⚠ Verifikation HTTP $VERIFY — bitte trotzdem unten loggen"
fi
echo "════════════════════════════════════════════════════════════"
echo "  Traccar URL:   https://tracker.simpletrailer.de"
echo "  Email:         info@simpletrailer.de"
echo "  Passwort:      $NEW_PW"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  📋 JETZT:"
echo "  1. Passwort kopieren (Bitwarden / Passwort-Manager)"
echo "  2. Vercel ENV TRACCAR_PASSWORD updaten:"
echo "     https://vercel.com/simpletrailers-projects/simpletrailer/settings/environment-variables"
echo "  3. Hetzner Root-PW im Cloud-Dashboard ändern (war einmal im Chat geteilt)"
echo "  4. Tracker müssen in Traccar neu registriert werden (2 IMEIs in Supabase)"
echo ""
