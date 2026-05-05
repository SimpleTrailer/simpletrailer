# SimpleTrailer Automationen & AI-Cockpit

Zentrale Übersicht aller autonomen Routinen, des AI-Stabs und des Admin-Cockpits.

## 🎯 AI-Cockpit ([admin.html](admin.html))

Erster Tab nach Login (Default). Zeigt auf einen Blick:

- **Live-Status**: Besucher gerade auf der Seite, Anhänger draußen, verfügbar
- **KPIs**: Heute / Diese Woche / Diesen Monat (Buchungen + Brutto + Netto + Trend)
- **Anomalien**: Stripe-Fehler, überfällige Anhänger, Buchungs-Drops
- **Auslastung**: Pro Anhänger, gerankt
- **Tarif-Verteilung**: Welche Tarife werden gebucht
- **AI-Insight**: Wöchentliche Empfehlung vom consultant-Agent
- **AI-Stab**: Übersicht der 4 Subagents
- **Routinen-Status**: Wann läuft was

**Auto-Refresh:** alle 30 Sekunden.

---

## 🤖 AI-Stab ([.claude/agents/](.claude/agents/))

| Agent | Wofür | Aufruf |
|---|---|---|
| **content-writer** | Marketing-Texte, SEO-Ratgeber, Newsletter, Social-Posts | "lass content-writer einen Ratgeber schreiben über X" |
| **code-reviewer** | Audit vor Push (Stripe-Sicherheit, RLS, Webhooks) | "code-reviewer auf den letzten Commit" |
| **consultant** | Strategie & Wachstum (was kann ich verbessern?) | "consultant: was sollte ich diese Woche angehen?" |
| **mobile-app-architect** | Apple/Google Submission, Apple-Rejection-Antworten | "mobile-app-architect: bereite Apple-Submission vor" |

→ Alle 4 Agents haben SimpleTrailer-Kontext (Anhänger-Specs, Preise, Konkurrenz, Stack, USPs) FEST im Prompt verankert. Sie sind stärker als Allgemein-Claude für ihre Domäne.

---

## ⚙️ Autonome Cron-Routinen (Vercel Cron)

Alle Cron-Endpoints brauchen `CRON_SECRET` als ENV-Var (= gleicher Token wie für `/api/send-reminders`). Vercel sendet ihn automatisch als `Authorization: Bearer <secret>`.

### 1. Anomalie-Check
**Endpoint:** `/api/cron/anomaly-check`
**Schedule:** Alle 6 Stunden (`0 */6 * * *`)
**Was:** Prüft auf Stripe-Fehler-Buchungen, überfällige Anhänger, Buchungs-Drop
**Aktion:** Email an `info@simpletrailer.de` wenn Anomalie

### 2. Wöchentlicher KPI-Report
**Endpoint:** `/api/cron/weekly-report`
**Schedule:** Montags 7:00 UTC = 9:00 Berlin (`0 7 * * 1`)
**Was:** Zusammenfassung der Woche (Buchungen, Umsatz, Top-Tarif, Top-Anhänger)
**Aktion:** Email an `info@simpletrailer.de`

### 3. Wöchentlicher AI-Berater
**Endpoint:** `/api/cron/weekly-advisor`
**Schedule:** Sonntags 18:00 UTC = 20:00 Berlin (`0 18 * * 0`)
**Was:** Lädt 4-Wochen-Daten, ruft Claude Haiku 4.5 mit consultant-Prompt
**Aktion:** Empfehlung wird in `ai_insights`-Tabelle gespeichert → erscheint im Cockpit

### 4. Rückgabe-Erinnerungen (bestand schon)
**Endpoint:** `/api/send-reminders`
**Schedule:** Alle 15 Minuten (`*/15 * * * *`)
**Was:** Erinnert Mieter 1h vor Rückgabe per Mail + Push

---

## 📋 Setup-Steps für Dich (einmalig)

### 1. SQL-Migration ausführen
- Öffne **Supabase Dashboard** → SQL Editor
- Kopiere Inhalt von [supabase-migration-ai-insights.sql](supabase-migration-ai-insights.sql)
- "Run" klicken
- Tabelle `ai_insights` ist angelegt + initialer Placeholder-Eintrag

### 2. ENV-Vars prüfen (sollten alle schon da sein)
In Vercel → Project → Settings → Environment Variables:
- `CRON_SECRET` ✅ (für Cron-Auth)
- `SUPABASE_URL` ✅
- `SUPABASE_SERVICE_KEY` ✅
- `RESEND_API_KEY` ✅ (für Email-Reports)
- `ANTHROPIC_API_KEY` ✅ (für AI-Advisor)

### 3. Deploy via Push
Sobald gepusht: Vercel deployt → Cron-Schedules werden aktiv → erste Routine läuft beim nächsten Cron-Slot.

### 4. Manuelles Triggern zum Testen
```
GET https://simpletrailer.de/api/cron/anomaly-check?token=<CRON_SECRET>
GET https://simpletrailer.de/api/cron/weekly-report?token=<CRON_SECRET>
GET https://simpletrailer.de/api/cron/weekly-advisor?token=<CRON_SECRET>
```

---

## 🚀 Roadmap (was als Nächstes kommt)

### Phase 2 (nächste Sessions)

- **Customer-Lifecycle-Mails** (Welcome, Review-Request, Re-Engagement) — sobald echte Buchungen
- **Empfehlungs-System** mit auto-generierten Codes + 10 € Bonus-Tracking
- **GPS-Tracking-Integration** (TAT240 + 1NCE-SIM, Diebstahl-Alarm-Pipeline)
- **Stripe-Buchungs-Alerts** (sofort-Push bei jeder Buchung)
- **Sentry-Errors im Cockpit anzeigen** (via Sentry-API)

### Phase 3 (mit echten Daten)

- **Konkurrenz-Watcher** (monatliches Scrapen lokaler Anhänger-Vermieter)
- **Dynamic Pricing** (Wochenende teurer, schwache Tage günstiger)
- **A/B-Testing** für Buchungs-CTA
- **Auto-Content-Pipeline**: content-writer schreibt monatliche Ratgeber-Drafts

---

## 🔧 Troubleshooting

### "ai_insights table missing" im Cockpit
→ SQL-Migration aus [supabase-migration-ai-insights.sql](supabase-migration-ai-insights.sql) noch nicht ausgeführt.

### Cron lief nicht
→ Vercel-Dashboard → Project → Crons → Logs prüfen. Wenn 401: `CRON_SECRET` ENV fehlt.

### AI-Advisor liefert leere Empfehlung
→ `ANTHROPIC_API_KEY` prüfen. Bei API-Fehlern stehen Details in Vercel-Function-Logs.

### Weekly-Report kommt nicht per Mail
→ Resend-Dashboard checken (Logs unter "Sent"). DNS für `simpletrailer.de` muss SPF/DKIM für Resend haben.
