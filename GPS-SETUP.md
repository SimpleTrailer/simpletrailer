# GPS-Tracking-Setup — Teltonika TAT240 + 1NCE + Traccar Cloud

Komplette Anleitung um Live-Standort der Anhänger ins Admin-Cockpit zu bringen + Diebstahl-Alarm automatisch.

**Aufwand:** ~45 Min pro Tracker beim ersten Mal, danach ~10 Min pro weiterem.

---

## ÜBERSICHT — Datenfluss

```
TAT240 (Tracker)  →  1NCE-SIM (Mobilfunk)  →  Traccar Cloud (Server)
                                                      ↓
                              Vercel Cron (alle 1 Min) liest Position
                                                      ↓
                              Supabase (trailers + trailer_positions)
                                                      ↓
                              Admin-Cockpit Live-Karte + Diebstahl-Alarm
```

---

## SCHRITT 1 — Tracker auspacken + IMEI ablesen (2 Min)

1. **TAT240 auspacken**
2. **IMEI ablesen**: 15-stellige Zahl auf Etikett (Rückseite + auf Verpackung). Beginnt mit `352...`
3. **SIM-Karte einlegen** (1NCE-Nano-SIM, nach Anleitung — vorsichtig, der Slot ist klein)
4. **Tracker aktivieren**: Magnet (im Lieferumfang) **3 Sek** an den TAT240 halten → LED blinkt
5. **IMEI notieren** — brauchst du gleich

---

## SCHRITT 2 — Traccar Cloud Account anlegen (5 Min)

1. Gehe auf https://www.traccar.org/traccar-cloud/
2. **"Get Started"** → Account anlegen mit `info@simpletrailer.de`
3. **Plan wählen**: "Starter" für $4,90/Monat (bis 10 Geräte — passt locker für 3 Anhänger + Erweiterung)
4. Du bekommst:
   - **Server-URL**: z.B. `https://server.traccar.org`
   - **Login**: deine Mail + selbst gewähltes Passwort
5. **Server-URL notieren** — brauchst du gleich

---

## SCHRITT 3 — Tracker bei Traccar registrieren (2 Min)

1. Bei https://www.traccar.org/login/ einloggen
2. Oben rechts: **"+" → "Geräte"**
3. Eingeben:
   - **Name**: z.B. "Anhänger 1 - Plane"
   - **Identifikator**: die **IMEI** von Schritt 1
   - **Kategorie**: "Trailer"
4. **Speichern**

Wiederhole pro Tracker.

---

## SCHRITT 4 — Tracker konfigurieren via App (15 Min, einmalig pro Tracker)

### 4a) Teltonika-App installieren

Lade dir auf dem Handy:
- **"FOTA WEB"** (Android + iOS) — Teltonikas offizielle Konfig-App via Bluetooth
- Alternativ: **"Teltonika TAT240"** App falls modellspezifisch verfügbar

### 4b) Per Bluetooth verbinden

1. Bluetooth + Standort am Handy aktivieren
2. TAT240 mit Magnet aufwecken (LED blinkt blau)
3. App öffnen → "Add Device" → IMEI/Name wählen
4. **Standard-PIN**: meistens `5555` oder `1111` (steht in Anleitung)

### 4c) Konfiguration setzen

In der App diese Werte eingeben:

| Parameter | Wert | Hinweis |
|---|---|---|
| **APN** | `iot.1nce.net` | 1NCE-Standard |
| **APN Username** | (leer) | – |
| **APN Password** | (leer) | – |
| **Server Domain** | `server.traccar.org` | Deine Traccar-URL OHNE `https://` |
| **Server Port** | `5027` | Standard für Teltonika-Protokoll |
| **Protocol** | TCP | Stabiler als UDP |
| **Periodic Send Period (parked)** | `300` Sek | Alle 5 Min wenn steht (Akku-schonend) |
| **Periodic Send Period (moving)** | `60` Sek | Alle 1 Min wenn fährt |
| **Movement Detection** | Aktiviert | Wechselt zwischen Modi |
| **Deep Sleep** | Nach 10 Min Standzeit | TAT240 hält bis 5 Jahre |

**Speichern + Verbindung trennen.**

### 4d) Verbindungs-Test

1. Tracker mit Magnet kurz wecken
2. 2-5 Minuten warten (er bucht sich ins Mobilnetz ein)
3. In Traccar Cloud unter "Geräte" sollte der Tracker **grün** werden (= online)
4. Auf der Karte erscheint ein Pin an der aktuellen Position

**Falls nicht online:**
- SIM-Karte falsch eingelegt? Nochmal prüfen
- APN falsch geschrieben? `iot.1nce.net` exakt
- 1NCE-Dashboard prüfen: SIM aktiviert? https://portal.1nce.com/

---

## SCHRITT 5 — Vercel ENVs setzen (3 Min)

Im SimpleTrailer-Vercel-Dashboard:

1. Gehe auf https://vercel.com/simpletrailers-projects/simpletrailer/settings/environment-variables
2. **3 neue Variablen** anlegen (alle als **"Production, Preview, Development"**):

| Name | Wert |
|---|---|
| `TRACCAR_URL` | `https://server.traccar.org` (oder deine Cloud-URL) |
| `TRACCAR_USERNAME` | `info@simpletrailer.de` (dein Traccar-Login) |
| `TRACCAR_PASSWORD` | dein Traccar-Passwort |

3. **Save** → Vercel deployt automatisch neu

---

## SCHRITT 6 — Datenbank-Migration in Supabase (2 Min)

1. Gehe auf https://supabase.com/dashboard/project/zcjlfatuelhkghtdyrqh
2. Links **SQL Editor** klicken
3. **New Query** → Inhalt von [supabase-migration-gps-tracking.sql](supabase-migration-gps-tracking.sql) einfügen
4. **Run** klicken

Sollte sagen: "Success. No rows returned."

---

## SCHRITT 7 — IMEI in Supabase-Trailer eintragen (3 Min)

1. In Supabase Dashboard → **Tabelle "trailers"** öffnen
2. Erste Zeile (dein Anhänger) bearbeiten
3. Spalte `tracker_imei` → die **IMEI** vom TAT240 eintragen (15-stellige Zahl)
4. **Save**

Wiederhole pro Anhänger mit eigenem Tracker.

---

## SCHRITT 8 — Test im Admin-Cockpit (2 Min)

1. Gehe auf https://simpletrailer.de/admin → Login
2. Cockpit-Tab öffnen
3. Scrolle runter → Section **"📍 Live-Anhänger-Standorte"**
4. Innerhalb **1-2 Minuten** sollte:
   - Karte den Anhänger zeigen
   - Sync-State oben rechts auf "Letzter Sync vor Xs"
   - Kachel unten den Status zeigen (Steht / Fährt / Akku)

---

## ⚠️ DIEBSTAHL-ALARM

Der Cron läuft jede Minute. Wenn ein Anhänger sich **>300m** bewegt UND **keine aktive Buchung** läuft (Status `confirmed` oder `active` mit passendem Zeitfenster):

- 🚨 **Urgent-Mail** an dich
- 🔔 **Push-Notification** (sofern Push aktiv)
- **Eintrag in `theft_alerts`** mit Position + Distanz
- **Roter Alert-Bar** im Cockpit oben

**Im Alert kannst du klicken:**
- **Fehlalarm** — wenn du selbst gefahren bist
- **Untersuche** — wenn du auf dem Weg dahin bist
- **Erledigt** — wenn aufgeklärt

**Doppel-Alarme verhindert:** Innerhalb 1h pro Anhänger nur 1 Alarm.

---

## TROUBLESHOOTING

### "Letzter Sync vor 5h" — Cron meldet sich nicht

1. Vercel-Logs prüfen: https://vercel.com/simpletrailers-projects/simpletrailer/functions
2. Suche nach `sync-tracker-positions` → letzte Ausführung anschauen
3. Häufige Fehler:
   - `TRACCAR_URL fehlt` → ENVs nicht gesetzt → Schritt 5
   - `401 Unauthorized` → Username/Password falsch → Schritt 5
   - `Geräte ohne IMEI` → Schritt 7 erledigen

### Tracker steht in Traccar als "Offline"

- SIM aktiviert bei 1NCE? https://portal.1nce.com/
- Tracker noch wach? Magnet kurz anlegen
- APN korrekt? Nochmal Konfig prüfen via App

### Akku zu schnell leer

- Send-Period erhöhen (z.B. 600s parked / 120s moving)
- Deep Sleep aktiv? Sollte automatisch greifen
- Bei normaler Nutzung: TAT240 hält ~5 Jahre

### Diebstahl-Alarm zu sensibel

In `api/cron/sync-tracker-positions.js` die Distanz-Schwelle anpassen:
- Aktuell: `300m`
- Bei Falschalarmen erhöhen auf `500m` oder `1000m`

---

## KOSTEN-ÜBERSICHT

| Posten | Pro Monat | Anmerkung |
|---|---|---|
| Traccar Cloud Starter | $4,90 | bis 10 Tracker, gratis Demo 30 Tage |
| 1NCE SIM | ~1€/Monat pro SIM | inklusive ~250 MB/Jahr |
| Vercel-Cron | 0€ | inklusive im Pro-Plan |
| **Gesamt für 3 Anhänger** | **~7-8€/Monat** | |

---

## NÄCHSTE SCHRITTE NACH SETUP

Sobald GPS läuft können wir bauen:
- **Mieter-Seite**: "Wo ist mein Anhänger?" im account.html (nur während aktiver Buchung)
- **Geofencing**: Alert wenn Anhänger Bremen-Stadtgebiet verlässt
- **Wartungs-KM-Tracking**: Strecken-Aufzeichnung pro Buchung
- **Public-Karte**: Anhänger-Position auf index.html "live" statt statisch
