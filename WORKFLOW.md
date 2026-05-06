# SimpleTrailer Workflow & System-Übersicht

## 📍 Wo geht alles hin?

**Eine zentrale Email-Adresse: `info@simpletrailer.de`**

Alle automatischen Reports, Alerts und Benachrichtigungen landen dort. Du brauchst **kein zweites Postfach** — alles fliegt in einen Ordner.

| Was | Wann |
|---|---|
| 📊 Wöchentlicher KPI-Report | Montags 9:00 Berlin |
| 🐛 Bug-Triage | Täglich 10:00 Berlin |
| 📱 Insta-Post-Vorschlag | Täglich 9:00 Berlin |
| 🔍 Anomalie-Alerts | Sofort wenn was passiert |
| 🔭 Konkurrenz-Report | 1. jeden Monats |
| 💡 Wöchentliche AI-Empfehlung | Sonntags 20:00 Berlin (auch im Cockpit) |
| 🎫 Echte Buchungen (Stripe-Bestätigungen) | sofort |

→ **Ein Mailfilter mit dem Absender `buchung@simpletrailer.de`** sortiert die Reports in einen Unterordner — saubere Inbox.

---

## 🎯 Wie ist Dein Tag/Woche aufgebaut?

### Morgenroutine (~5 Min)

1. **Mail checken** — Insta-Post von gestern Nacht ist da
2. **Cockpit öffnen** — `simpletrailer.de/admin` → 1 Blick auf KPIs + Anomalien
3. **Wenn Anomalie**: handeln (Stripe-Fehler nachfassen, Mieter kontaktieren, etc.)

### Tagesgeschäft (~15-30 Min)

1. **Insta-Post posten** (~5 Min)
   - Bild in Canva/Midjourney mit Prompt aus Mail erstellen
   - Caption + Hashtags kopieren
   - Posten
2. **Kunden-Mails beantworten** (~10 Min)
   - support-writer-Agent fragen: "Entwirf Antwort auf diese Mail: [Inhalt]"
   - Du checkst, klickst Send
3. **Buchungen prüfen** (~5 Min)
   - Cockpit zeigt überfällige / problematische Buchungen
   - Eskalation falls nötig

### Wochenroutine (~30 Min)

| Tag | Was |
|---|---|
| **Montag** | Wochen-Report durchlesen + 3 Lehren ziehen |
| **Mittwoch** | content-writer für 1-2 neue Ratgeber-Artikel anwerfen |
| **Freitag** | Wochenend-Push überprüfen (Insta + Google-Ads) |
| **Sonntag-Abend** | AI-Empfehlung im Cockpit lesen, Top-Maßnahme für Folgewoche planen |

### Monatsroutine (~1 Std)

1. **Konkurrenz-Report** durchlesen (kommt 1. des Monats)
2. **Buchhaltung** — Lexware Office Belege durchgehen, USt-VA per Klick
3. **GBP-Posts** — 1-2 frische Beiträge im Google Business Profile

---

## 🚀 So pushst Du das Geschäft maximal

Reihenfolge nach **Hebel-Wirkung**:

### 🥇 Top-Priorität (sofort, max. ROI)

1. **Google Ads** mit ads-specialist-Agent setupen
   - Anhänger sind ab 11.05. zugelassen → ab Tag 1 läuft Werbung
   - Budget: 10-15 €/Tag → 300-450 €/Monat
   - Wirkung: 5-15 € CAC pro Buchung
   - Du hast das **ads-specialist** Agent — frag ihn: "Bau mir die komplette Google-Ads-Kampagne"

2. **Google Business Profile** komplett pflegen
   - Telefonnummer eintragen (heute)
   - Wöchentlich 1 Post (Mit content-writer)
   - **Nach jeder Buchung** den Mieter um 5-Sterne-Bewertung bitten — dafür gibt's ab Phase 3 die automatische Review-Request-Mail

3. **Bestehende Conversions optimieren**
   - consultant-Agent regelmäßig fragen: "Wo verlieren wir gerade Kunden?"
   - Daten aus Microsoft Clarity (Heatmaps + Recordings)

### 🥈 Mid-Priorität (in den ersten 2 Monaten)

4. **Empfehlungs-System** einbauen
   - 10 € pro vermittelte Erstbuchung
   - Bestandskunden bringen neue → günstigster Wachstumshebel

5. **Lokal-Marketing** (Flyer, eBay Kleinanzeigen, Bremen-Facebook-Gruppen)
   - content-writer entwirft die Texte
   - Du druckst/postest

6. **B2B-Outreach** — Möbelhäuser, Werkstätten, Umzugsfirmen ansprechen
   - support-writer entwirft personalisierte Mails

### 🥉 Long-Term (3-6 Monate)

7. **SEO** — Long-Tail-Ratgeber-Artikel
   - content-writer für 1 Artikel/Woche → in 3 Monaten organischer Traffic-Boost
8. **Mobile-App** im App Store launchen (sobald D-U-N-S durch ist)
   - mobile-app-architect-Agent durch den Submission-Prozess
9. **Zweiter Anhänger** anschaffen wenn Plane >70% Auslastung über 4 Wochen
10. **Expansion zu Stadt #2** (Hamburg / Oldenburg) wenn Bremen profitabel

---

## 🤖 Welcher Agent für welche Aufgabe?

### Wenn Du etwas schreiben/kommunizieren willst

| Du willst… | Frag… |
|---|---|
| Insta-Post | (läuft autonom — Mail kommt täglich) |
| Newsletter | **content-writer**: "Schreib Welcome-Mail-Serie" |
| Ratgeber-Artikel | **content-writer**: "Schreib Artikel über [Thema]" |
| Google-Ads-Anzeigentexte | **ads-specialist**: "5 Headlines für Wochenend-Kampagne" |
| Antwort auf Kundenmail | **support-writer**: "Entwirf Antwort auf [Mail]" |
| Pressemitteilung | **content-writer**: "Press-Release für Bremer Lokal-Medien" |
| Flyer-Text | **content-writer**: "DIN A6 Flyer für Hornbach-Schwarzes-Brett" |

### Wenn Du etwas wissen willst

| Du willst wissen… | Frag… |
|---|---|
| Was diese Woche dran ist | **consultant**: "Was sollte ich diese Woche angehen?" |
| Wo Du Kunden verlierst | **consultant**: "Wo bricht der Funnel ab?" |
| Wer der Konkurrenz wo steht | **competitor-watcher**: "Aktueller Bremen-Vergleich" |
| Welche Bugs kritisch sind | **bug-triager** (läuft autonom — kommt täglich per Mail) |
| Ob ein AGB-Text rechtlich passt | **legal-checker**: "Prüf §5 in agb.html" |

### Wenn Du etwas bauen willst

| Du willst bauen… | Frag… |
|---|---|
| Code-Änderung sicher prüfen | **code-reviewer** (läuft automatisch vor Push) |
| App-Submission vorbereiten | **mobile-app-architect**: "Bereite Apple-Submission vor" |
| Apple-Rejection beantworten | **mobile-app-architect**: "Antwort auf Reject [Inhalt]" |
| Native Feature einbauen | **mobile-app-architect**: "Push-Notifications integrieren" |

### Wenn Du Marketing/Wachstum willst

| Aufgabe | Agent |
|---|---|
| Komplette Google-Ads-Kampagne planen | **ads-specialist** |
| Performance-Review der Anzeigen | **ads-specialist** |
| Strategie-Roadmap | **consultant** |
| Konkurrenz beobachten | **competitor-watcher** (autonom monatlich) |
| Social-Media-Content | **content-writer** (autonom täglich) + Du genehmigst |

---

## 🔄 Was läuft autonom (ohne Dein Zutun)

```
24/7 unsichtbar im Hintergrund:

⏰ alle 15 Min   → Rückgabe-Erinnerungen an Mieter
🔍 alle  6 Std   → Anomalie-Check + Mail bei Problemen
📱 täglich 9:00  → Insta-Post-Vorschlag im Postfach
🐛 täglich 10:00 → Bug-Report mit Top-5 Sentry-Issues
📊 Mo     9:00   → Wochen-KPI-Report
💡 So     20:00  → AI-Empfehlung der Woche → Cockpit
🔭 1. d.M. 11:00 → Konkurrenz-Report
```

---

## 🎚️ Wo trägst Du was ein?

| Wenn etwas Neues passiert… | …trägst Du ein bei… |
|---|---|
| Neuer Anhänger gekauft | Supabase: `trailers`-Tabelle (über Admin-Panel) |
| Steuernummer da (Finanzamt) | [impressum.html](impressum.html) Zeile mit "folgt nach Mitteilung" |
| USt-IdNr da (BZSt) | [impressum.html](impressum.html) + Stripe-Settings |
| GBP verifiziert | content-writer Beitrag posten + Place-ID in [index.html](index.html) tauschen |
| Anhänger-Lieferung | Echte Fotos auf Webseite + GBP |
| D-U-N-S da | Apple Developer + Google Play Account anlegen → mobile-app-architect |
| Erste Bewertung | Cockpit zeigt sie sobald GBP verbunden |

---

## 🎯 Der Plan für die nächsten 4 Wochen

### Diese Woche (vor 11.05. Anhänger-Zulassung)

- ✅ AI-Stab steht (10 Agents)
- ✅ Cockpit + autonome Routinen aktiv
- 📋 SQL-Migrations in Supabase laufen lassen (`supabase-migration-ai-insights.sql` + `supabase-migration-social-posts.sql`)
- 📋 Sentry-Auth-Token erzeugen + als ENV-Var setzen (für bug-triager)
- 📋 GBP-Telefonnummer eintragen + Beschreibung
- 📋 ads-specialist mit Google-Ads-Setup-Plan beauftragen (Kampagnen ready, aber pausiert bis 11.05.)

### Woche 1 nach Zulassung (12.-18.05.)

- 🚀 Google Ads aktivieren (10 €/Tag Test-Phase)
- 🚀 eBay Kleinanzeigen-Inserat
- 🚀 Bremen-Facebook-Gruppen 2-3 Posts
- 🚀 Test-Buchung selbst durchspielen
- 📋 Echte Anhänger-Fotos einbauen
- 📋 Erste echte Buchung erwartet

### Woche 2-4 (19.05.-08.06.)

- 📈 Google Ads optimieren basierend auf Daten
- 📈 Empfehlungs-System einbauen
- 📈 Newsletter-Anmeldung dazu (DSGVO Double-Opt-In)
- 📈 1-2 Ratgeber-Artikel veröffentlichen (content-writer)
- 📋 Apple Developer Account anlegen (sobald D-U-N-S durch)
- 📋 GBP-Bewertungen aufbauen — bei jeder Buchung Mieter um 5-Sterne fragen

---

## 🆘 Wenn was nicht läuft

| Problem | Wo schauen / Wen fragen |
|---|---|
| Webseite down | UptimeRobot meldet sich (SMS) |
| API-Fehler | Sentry-Dashboard → bug-triager-Mail nächsten Tag |
| Buchung kommt nicht | Stripe-Dashboard → Vercel-Function-Logs |
| Mail kommt nicht an | Resend-Dashboard → SPF/DKIM in DNS prüfen |
| Cockpit zeigt nichts | F12 → Console → Fehler? |
| Cron läuft nicht | Vercel-Dashboard → Crons → Logs |

---

## 💡 Goldene Regel

**Nicht alles allein machen.** Der ganze Stab existiert, damit Du nur entscheidest + delegierst.
- Texte schreiben → content-writer / support-writer / ads-specialist
- Daten verstehen → consultant
- Code prüfen → code-reviewer (läuft autonom)
- Bugs verfolgen → bug-triager (läuft autonom)
- Konkurrenz im Blick → competitor-watcher (läuft autonom)
- Recht prüfen → legal-checker

**Dein Job:** Cockpit lesen, Empfehlungen umsetzen, Strategie entscheiden. **Nicht** Texte selbst schreiben oder Code-Bugs selbst hunten — dafür sind die Agents da.
