# GPS-Tracking-Setup — Teltonika TAT240 + 1NCE + Self-Hosted Traccar

Komplette Anleitung um Live-Standort + Diebstahl-Alarm + Geofences auf eigenem Server zu betreiben. Kein Lock-in, DSGVO-frisch, skaliert beliebig.

**Aufwand:** ~60 Min für 1. Tracker (davon ~30 Min Click-Zeit für Dich, Rest läuft automatisch), danach ~10 Min pro weiterem Tracker.

---

## ÜBERSICHT — Datenfluss

```
TAT240 (Tracker)  →  1NCE-SIM (Mobilfunk)  →  Dein Hetzner-Server (tracker.simpletrailer.de)
                                                      ↓
                              Vercel Cron (alle 1 Min) liest Position
                                                      ↓
                              Supabase (trailers + trailer_positions)
                                                      ↓
                              Admin-Cockpit Live-Karte + Diebstahl-Alarm
```

**Vorteile Self-Host gegenüber Traccar Cloud:**
- ✅ Daten 100% in deiner Hand (DSGVO sauberer — Teltonika ist nur Hardware-Lieferant, kein Auftragsverarbeiter)
- ✅ Skaliert auf 500+ Tracker mit gleichem Server (5€/Mon fix)
- ✅ Vollständige Geofence + Reports-Features ohne Tarif-Beschränkung
- ✅ Auto-Update, Auto-Backup, Auto-SSL (alles im Setup-Script)

---

## SCHRITT 1 — Tracker auspacken + IMEI ablesen (2 Min)

1. **TAT240 auspacken**
2. **IMEI ablesen**: 15-stellige Zahl auf Etikett (Rückseite + auf Verpackung). Beginnt mit `352...`
3. **SIM-Karte einlegen** (1NCE-Nano-SIM, vorsichtig — der Slot ist klein)
4. **Tracker aktivieren**: Magnet (im Lieferumfang) **3 Sek** an den TAT240 halten → LED blinkt
5. **IMEI notieren** — brauchst Du gleich

---

## SCHRITT 2 — Hetzner-Server bestellen (10 Min)

1. Gehe auf https://accounts.hetzner.com/signUp → Account anlegen mit `info@simpletrailer.de`
2. Im Dashboard: **"Projekt erstellen"** → "SimpleTrailer" nennen
3. **Server hinzufügen**:
   - **Standort**: Falkenstein oder Nürnberg (Deutschland)
   - **Image**: Ubuntu 24.04
   - **Typ**: **CX22** (~5,90€/Monat — 2 vCPU, 4 GB RAM, 40 GB SSD — reicht für 500 Tracker)
   - **Netzwerk**: Public IPv4 + IPv6 (standard)
   - **SSH-Schlüssel**: später erstellen (siehe unten) oder Passwort-Login (für Schnellstart OK)
   - **Name**: `traccar.simpletrailer.de`
4. **Bestellen** → Server-IP wird angezeigt (z.B. `5.75.xxx.xxx`)
5. **Root-Passwort** kommt per Mail an dich

**DSGVO**: Hetzner-AVV automatisch beim Sign-Up bestätigen → für DSE wichtig.

---

## SCHRITT 3 — IONOS DNS-Eintrag setzen (5 Min)

1. Login auf https://my.ionos.de
2. **Domains & SSL** → `simpletrailer.de` klicken
3. **DNS-Einträge** (links)
4. **Eintrag hinzufügen**:
   - **Typ**: `A`
   - **Hostname**: `tracker`
   - **IP-Adresse**: Server-IP von Hetzner (Schritt 2.4)
   - **TTL**: 3600
5. **Speichern**

→ Nach 5-15 Min ist `tracker.simpletrailer.de` erreichbar.

**Test:** Im Terminal `ping tracker.simpletrailer.de` → sollte deine Hetzner-IP zurückgeben.

---

## SCHRITT 4 — Install-Script ausführen (5 Min Click-Zeit, 10 Min Wait)

1. **Mit Server verbinden** (per SSH):
   - Windows: PowerShell öffnen → `ssh root@5.75.xxx.xxx` (deine IP)
   - Passwort eingeben (aus Hetzner-Mail)
2. **Script ausführen** (kopiere diesen Befehl 1:1):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/SimpleTrailer/simpletrailer/main/setup-traccar-server.sh | bash -s -- tracker.simpletrailer.de info@simpletrailer.de
   ```
3. Skript läuft ~10 Min (installiert Docker, Traccar, Caddy mit Auto-SSL, Watchtower für Auto-Updates, Daily-Backups, Firewall, fail2ban)
4. Am **Ende** zeigt das Script:
   ```
   ✅ FERTIG
   Traccar Admin-UI:   https://tracker.simpletrailer.de
   Login:              info@simpletrailer.de
   Initial-Passwort:   xyz123abc...
   ```
5. **Passwort sofort in Bitwarden/Notizen speichern!**

---

## SCHRITT 5 — Login in Traccar + Tracker registrieren (3 Min)

1. Browser → https://tracker.simpletrailer.de
2. Login mit `info@simpletrailer.de` + Passwort aus Schritt 4
3. Oben rechts: **"+"-Symbol → "Geräte"**
4. Eingeben:
   - **Name**: z.B. "Anhänger 1 - Plane"
   - **Identifikator**: die **IMEI** vom TAT240 (Schritt 1)
   - **Kategorie**: "Trailer"
5. **Speichern**

Wiederhole pro Tracker.

---

## SCHRITT 6 — Tracker konfigurieren via App (15 Min)

### 6a) Teltonika-App installieren

Auf Handy:
- **"FOTA WEB"** (Android + iOS) — offizielle Konfig-App via Bluetooth
- Alternativ: **"Teltonika TAT240"** App falls modell-spezifisch verfügbar

### 6b) Per Bluetooth verbinden

1. Bluetooth + Standort am Handy aktivieren
2. TAT240 mit Magnet aufwecken (LED blinkt blau)
3. App öffnen → "Add Device" → IMEI/Name wählen
4. **Standard-PIN**: meistens `5555` oder `1111` (siehe Anleitung)

### 6c) Konfiguration setzen

In der App diese Werte eingeben:

| Parameter | Wert |
|---|---|
| **APN** | `iot.1nce.net` |
| **APN Username** | (leer) |
| **APN Password** | (leer) |
| **Server Domain** | `tracker.simpletrailer.de` (OHNE `https://`) |
| **Server Port** | `5027` |
| **Protocol** | TCP |
| **Periodic Send Period (parked)** | `300` Sek (5 Min wenn steht) |
| **Periodic Send Period (moving)** | `60` Sek (1 Min wenn fährt) |
| **Movement Detection** | Aktiviert |
| **Deep Sleep** | Nach 10 Min Standzeit |

**Speichern + Verbindung trennen.**

### 6d) Verbindungs-Test

1. Tracker mit Magnet kurz wecken
2. 2-5 Minuten warten (er bucht sich ins Mobilnetz ein)
3. In Traccar (https://tracker.simpletrailer.de) → "Geräte"-Liste:
   Tracker sollte **grün** werden (= online), Karte zeigt Position

**Falls nicht online:**
- SIM aktiviert bei 1NCE? https://portal.1nce.com/
- APN exakt `iot.1nce.net`?
- Server-Domain exakt `tracker.simpletrailer.de` (kein `https://`)?

---

## SCHRITT 7 — Vercel ENVs setzen (3 Min)

In https://vercel.com/simpletrailers-projects/simpletrailer/settings/environment-variables:

3 Variablen anlegen (alle als **"Production, Preview, Development"**):

| Name | Wert |
|---|---|
| `TRACCAR_URL` | `https://tracker.simpletrailer.de` |
| `TRACCAR_USERNAME` | `info@simpletrailer.de` |
| `TRACCAR_PASSWORD` | dein Traccar-Passwort aus Schritt 4 |

**Save** → Vercel deployt automatisch neu.

---

## SCHRITT 8 — Datenbank-Migrationen in Supabase (3 Min)

In https://supabase.com/dashboard/project/zcjlfatuelhkghtdyrqh → **SQL Editor**:

1. **New Query** → Inhalt von [supabase-migration-gps-tracking.sql](supabase-migration-gps-tracking.sql) einfügen → **Run**
2. **New Query** → Inhalt von [supabase-migration-calculator-state.sql](supabase-migration-calculator-state.sql) einfügen → **Run**

---

## SCHRITT 9 — IMEI in Supabase-Trailer eintragen (3 Min)

1. Supabase Dashboard → **Tabelle "trailers"**
2. Erste Zeile bearbeiten → Spalte `tracker_imei` → **IMEI** vom TAT240 eintragen
3. **Save**

Wiederhole pro Anhänger.

---

## SCHRITT 10 — Test im Admin-Cockpit (2 Min)

1. https://simpletrailer.de/admin → Login
2. Cockpit-Tab → scroll runter zu **"📍 Live-Anhänger-Standorte"**
3. Innerhalb **1-2 Min** sollte:
   - Karte den Anhänger zeigen
   - Sync-State oben rechts auf "Letzter Sync vor Xs"
   - Kachel unten: Status (Steht / Fährt / Akku)

---

## GEOFENCES EINRICHTEN (im Traccar-UI)

In https://tracker.simpletrailer.de:

### Stellplatz-Geofence (Diebstahl-Schutz)
1. Linke Sidebar: **Geofences** → **"+"**
2. Auf Karte zeichnen: Polygon um den Stellplatz (~150m Radius)
3. **Name**: "Stellplatz Anhänger 1"
4. **Speichern**
5. Bei **Trailer** in der Geräte-Liste → Eigenschaften → Geofence "Stellplatz Anhänger 1" verknüpfen

### Bremen-Rückgabe-Zone
1. Geofences → **"+"** → Polygon um Bremen-Stadtgebiet zeichnen (große Fläche)
2. **Name**: "Bremen-Stadtgebiet"
3. Allen Trailern zuordnen

### EU-Grenze (info-only Alert)
1. Geofences → **"+"** → großer Polygon um EU/Schengen
2. **Name**: "EU/Schengen"
3. Alert wenn verlassen → konfigurierbar im Notifications-Tab

---

## ⚠️ DIEBSTAHL-ALARM

Der Vercel-Cron läuft jede Minute. Wenn ein Anhänger sich **>300m** bewegt UND **keine aktive Buchung** läuft:

- 🚨 **Urgent-Mail** an dich
- 🔔 **Push-Notification**
- **Eintrag in `theft_alerts`** mit Position + Distanz
- **Roter Alert-Bar** im Cockpit oben

Im Alert kannst du klicken:
- **Fehlalarm** — wenn du selbst gefahren bist
- **Untersuche** — auf dem Weg
- **Erledigt** — aufgeklärt

Doppel-Alarme verhindert: 1h Dedupe-Schutz pro Trailer.

---

## TROUBLESHOOTING

### Server nicht erreichbar nach Setup

1. Hetzner-Console öffnen (im Dashboard)
2. Server-Status prüfen — läuft?
3. SSH: `docker ps` → alle 3 Container (traccar, caddy, watchtower) sollten "Up"
4. Logs: `docker logs traccar` → Fehler suchen

### SSL-Zertifikat-Fehler

Wartet auf DNS-Propagation. Manchmal dauert es 15 Min nach IONOS-DNS-Setup. Caddy versucht's automatisch alle paar Minuten erneut. `docker logs caddy` zeigt Status.

### Tracker zeigt Position nicht

1. Bei Traccar im Web-UI → Tracker auswählen → Tab "Verlauf"
2. Wenn da Daten kommen → Vercel-Cron-Logs prüfen: https://vercel.com/simpletrailers-projects/simpletrailer/functions
3. Suche `sync-tracker-positions` → Fehler

### Server-Updates manuell prüfen

```bash
ssh root@deine-server-ip
cd /opt/traccar
docker compose pull
docker compose up -d
```

(Watchtower macht das eh nachts automatisch.)

### Backup wiederherstellen

Backups liegen in `/opt/traccar/backups/`. Restore-Schritt:

```bash
ssh root@deine-server-ip
cd /opt/traccar
docker compose down
tar xzf backups/traccar-2026-05-11_03-00.tar.gz -C data/
docker compose up -d
```

---

## KOSTEN-ÜBERSICHT

| Posten | Pro Monat | Anmerkung |
|---|---|---|
| Hetzner CX22 | ~5,90 € | reicht für 500+ Tracker |
| 1NCE SIM | ~1 €/SIM | 250 MB/Jahr inkl. |
| Vercel-Cron | 0 € | im Pro-Plan |
| Domain-Subdomain | 0 € | tracker.simpletrailer.de existiert eh |
| **Total für 3 Tracker** | **~9 €/Monat** | |
| **Total für 50 Tracker** | **~56 €/Monat** | (Cloud wäre $25+) |

---

## WARTUNG

| Aufgabe | Frequenz | Wie |
|---|---|---|
| Server-Updates (Ubuntu-Pakete) | Monatlich | SSH: `apt update && apt upgrade -y` |
| Traccar-Updates | Automatisch | Watchtower täglich 04:00 UTC |
| Backups checken | Vierteljährlich | SSH: `ls -lh /opt/traccar/backups/` |
| Disk-Space prüfen | Halbjährlich | SSH: `df -h` |
| SSL-Renewal | Automatisch | Caddy macht das selbst |

**Im Cockpit siehst du Server-Status** via Cron-Sync-State — wenn da "Sync-Fehler vor Xh" steht, ist was schief.

---

## DSGVO-CHECKLIST

✅ Server in Deutschland (Hetzner Falkenstein/Nürnberg)
✅ Auftragsverarbeitungsvertrag (AVV) automatisch im Hetzner-Vertrag
✅ Keine Drittland-Übermittlung
✅ Daten-Retention: 90 Tage (siehe DSE-Klausel + Retention-Cron)
✅ Teltonika ist NICHT Auftragsverarbeiter (nur Hardware-Lieferant) — Self-Host vermeidet das DSGVO-Risiko aus der Cloud-Variante

**Was noch zu tun ist** (separat von GPS-Setup):
- AGB-Klausel § 13 einfügen (siehe [Legal-Findings vom Rechts-Prüfer](#))
- DSE-Abschnitt 9 einfügen
- DSFA (Datenschutz-Folgenabschätzung) erstellen — empfohlen vor Go-Live
