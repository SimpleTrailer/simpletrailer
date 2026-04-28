# SimpleTrailer – Projektkontext

## Firma
- **Name:** SimpleTrailer GbR
- **Gesellschafter:** Lion Grone, Samuel Obodoefuna
- **Sitz:** Waltjenstr. 96, 28237 Bremen
- **Domain:** simpletrailer.de
- **Email:** info@simpletrailer.de
- **Produkt:** PKW-Anhängervermietung in Bremen, vollautomatisch online buchbar (1-3 Anhänger zum Start, an mehreren Stellplätzen)

## Status (Stand 2026-04-28)
- **Webseite:** LIVE auf simpletrailer.de, verarbeitet echte Stripe-Zahlungen
- **Mobile-App (Capacitor 6):** Backend bereit, native-bridge.js eingebaut, APK kann gebaut werden — wartet auf D-U-N-S für Apple+Google Konten
- **Anhänger:** Lieferung ~2026-05-01 (3 Tage)
- **Google Business Profile:** Postkarten-Verifizierung läuft (~5 Tage)
- **D-U-N-S:** beantragt, 5–14 Werktage Wartezeit

---

## 🎯 Vision: Cockpit-Modus

**Geschäfts-Ziel:** Als Gründer auf einen Blick sehen können:
1. Wie viele Leute sind GERADE auf der Seite? (Live-Visitors)
2. Wo klicken Leute weg? (Drop-off, Heatmaps, Recordings)
3. Wie viele klicken auf "Buchen" und brechen ab? (Funnel)
4. Welche Wochentage / Tageszeiten sind Top? (Muster-Erkennung)
5. Welcher Anhänger ist am beliebtesten? (Auslastung → wann mehr beschaffen)
6. Welche Schutz-Pakete werden gewählt? (Marge optimieren)
7. Was muss als Nächstes nachgerüstet werden? (Backlog)

**Tracking-Stack:**
- **Vercel Analytics** (im Pro-Plan inklusive) — Live-Visitors, Page Views, Top Pages
- **Microsoft Clarity** (gratis, DSGVO-konform) — Session-Recordings, Heatmaps, Rage/Dead Clicks
- **Eigenes Admin-Dashboard** ([admin.html](admin.html)) — Buchungs-Daten aus Supabase: Wochentag-/Tageszeit-Charts, Umsatz-Trend, Anhänger-Auslastung
- **Konfig:** [analytics.js](analytics.js) — eine zentrale Datei mit allen Tracking-IDs

---

## Tech Stack
- **Frontend:** HTML, CSS, Vanilla JS (kein React/Vue — bewusst schlank)
- **Datenbank:** Supabase (PostgreSQL + Auth + Storage)
- **Zahlung:** Stripe (mit `off_session` für automatische Verspätungs-Abbuchung)
- **Email:** Resend (transaktional, `reply_to: info@simpletrailer.de`)
- **Push:** Firebase Cloud Messaging (HTTP V1 API mit OAuth2/JWT)
- **Hosting:** Vercel Pro (Cron-Jobs, Analytics, kein Function-Limit)
- **Mobile:** Capacitor 6 (iOS + Android Wrapper, lädt simpletrailer.de live)
- **AI/Chat:** Anthropic Claude Haiku 4.5 mit Tool Use (live Verfügbarkeits-Check)
- **GPS später:** Teltonika + Traccar (kommt mit Anhänger-Tracking)

---

## Wichtige Dateien

### Webseite (Root)
- [index.html](index.html) — Landing + Karte + Reviews + FAQ
- [booking.html](booking.html) — 5-Schritt-Buchungs-Flow
- [booking-confirm.html](booking-confirm.html) — Erfolgsseite nach Stripe
- [account.html](account.html) — User-Login, eigene Buchungen, Konto-Löschen, Push-Token-Save
- [precheck.html](precheck.html) — Foto-Upload vor Abholung
- [return.html](return.html) — Rückgabe + Foto + Verspätungs-Berechnung
- [admin.html](admin.html) — Admin-Dashboard (3 Tabs: Buchungen, Nutzer, Statistiken)
- [chat-widget.js](chat-widget.js) — Simply-Chatbot (Claude Haiku + Tool Use)
- [native-bridge.js](native-bridge.js) — Defensive Native-API-Schicht (Kamera/Geo/Push/Haptik in Mobile-App, no-op im Browser)
- [analytics.js](analytics.js) — Zentrale Tracking-Konfig (Clarity + Vercel Analytics)

### Backend (Vercel Serverless Functions in `api/`)
- `booking.js` — Buchung erstellen + Stripe-Setup
- `process-return.js` — Rückgabe + Verspätungs-Auto-Charge
- `send-reminders.js` — **Cron alle 15 Min** — Mail+Push 1h vor Rückgabe
- `chat.js` — Claude Haiku mit Tool Use (`check_availability`)
- `_push-sender.js` — FCM V1 API mit OAuth2/JWT (Underscore = nicht als Endpoint)
- `save-push-token.js` — Mobile-App registriert Push-Token
- `delete-account.js` — Konto-Löschung (Apple-Pflicht), anonymisiert Buchungen (10-Jahre-Retention §147 AO)
- `admin.js` — Auth-geschütztes Backend für Admin-Dashboard
- `health.js` — Monitoring-Endpoint
- `get-trailers.js` — Anhänger-Liste für Karte

### Cron-Jobs ([vercel.json](vercel.json))
- `/api/send-reminders` — alle 15 Min (auth via `CRON_SECRET` ENV)

### Mobile App (`mobile-app/`)
- `capacitor.config.ts` — App-ID `de.simpletrailer.app`
- `android/`, `ios/` — Native Projekte
- `package.json` — Plugins: app, camera, geolocation, haptics, network, push-notifications, share, splash-screen, status-bar
- `NEXT-STEPS.md` — User-Aufgaben (npm install, cap sync, APK bauen, Stores)

### Sonstiges
- [supabase-schema.sql](supabase-schema.sql) — DB-Schema (bookings, trailers, push_tokens)
- [vercel.json](vercel.json) — Function-Config + Cron + Rewrites
- [manifest.webmanifest](manifest.webmanifest) — PWA-Manifest
- [sw.js](sw.js) — Service Worker
- [agb.html](agb.html), [datenschutz.html](datenschutz.html), [impressum.html](impressum.html) — Rechtliches

---

## Design
- **Skill:** Nutze immer den Frontend Design Skill für UI-Entscheidungen
- **Stil:** Modern, dunkel (`#0D0D0D`), bold orange Akzent (`#E85D00`)
- **Mobile-first:** Karte/Buttons/Bottom-Sheets touch-optimiert
- **Performance:** Schnelle Ladezeiten, kein React-Overhead, Vanilla-JS
- **Distinctive:** SimpleTrailer soll auffallen — kein generisches AI-Aussehen

---

## Regeln (HART)
- **Sprache:** Antworten immer auf Deutsch
- **Buchungssystem TABU:** Webseite läuft LIVE mit echten Stripe-Zahlungen. Änderungen an [booking.html](booking.html), [api/booking.js](api/booking.js), [api/process-return.js](api/process-return.js), [supabase-schema.sql](supabase-schema.sql) NUR mit explizitem User-OK
- **Native-Bridge ist defensiv:** [native-bridge.js](native-bridge.js) tut im Browser NICHTS (`isNative=false`). Webseite verhält sich für normale Besucher exakt wie ohne Bridge
- **User ist Anfänger:** Schritt für Schritt erklären, vollständigen Code liefern, fragen wenn unklar
- **Commits:** nur auf explizite Anweisung (`commit das`)
- **Reply-Routing:** Alle transaktionalen Mails kommen `from: buchung@simpletrailer.de`, MÜSSEN aber `reply_to: info@simpletrailer.de` haben (`buchung@` ist kein echtes Postfach)

---

## Wartet (User kann nichts beschleunigen)
- **D-U-N-S** (5–14 Werktage seit 2026-04-27) → danach Apple Developer als Organization
- **GBP-Postkarte** (~5 Tage) → danach echte Place-ID einsetzen statt `ChIJ`-Platzhalter (in [index.html](index.html) + [api/process-return.js](api/process-return.js))
- **Anhänger-Lieferung** (~2026-05-01) → danach Fotos auf Webseite + GBP einbauen

---

## Backlog (Reihenfolge nach Wert)
1. **Test-Buchung selbst durchspielen** sobald Anhänger live (Stripe-Testkarte `4242 4242 4242 4242`)
2. **Echte Anhänger-Fotos** in Webseite + Google Business Profile
3. **Empfehlungs-System** ("10 € für jede Empfehlung") — Wachstums-Hebel
4. **Newsletter-Anmeldung** (DSGVO-konform Double-Opt-In) — Re-Marketing
5. **Buchungs-PDF zum Download** für Kunden (zusätzlich zur Email)
6. **Apple Developer + Google Play Konten** als Organization (nach D-U-N-S)
7. **Codemagic CI** für iOS-Build (~30 EUR/Monat, kein Mac nötig)
8. **UptimeRobot Monitoring** für simpletrailer.de + /api/health

---

## Wie wir arbeiten
- **Du:** Lion, Anfänger, schreibt direkt was er will / bemerkt — Claude soll Vorschläge bringen und dann ausführen
- **Claude:** baut, erklärt knapp, dokumentiert in `mobile-app/NEXT-STEPS.md` was User noch tun muss
- **Mobile-App-Branch:** `mobile-app-development` (kein Auto-Merge nach `main`)
- **Webseiten-Branch:** `main` (jeder Push triggert Vercel-Deploy)
