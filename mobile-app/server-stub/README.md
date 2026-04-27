# Server-Stubs für Mobile-App-Backend

> Diese Endpoints sind **NICHT aktiv**. Sie liegen hier als VORLAGEN.
> Aktivieren = Datei nach `../../api/` kopieren. Erst dann sind sie unter `simpletrailer.de/api/...` erreichbar.

---

## Warum hier und nicht direkt in `api/`?

Weil die Live-Webseite (`api/`-Folder) während der Mobile-App-Entwicklung NICHT angefasst werden darf (User-Vorgabe — sonst Risiko für aktive Buchungen). Diese Stubs warten in einer Schublade auf den Tag, an dem die Mobile-App live geht UND der User explizit zustimmt, sie zu deployen.

---

## Was wo liegt

| Datei | Zweck | Aktivierung-Schritt |
|---|---|---|
| `push-notification-sender.js` | Helper-Modul: sendet Push via FCM | Importieren von Cron / send-reminders |
| `save-push-token.js` | Endpoint: App speichert Push-Token | Nach `api/save-push-token.js` kopieren |
| `delete-account.js` | Endpoint: User löscht eigenes Konto (Apple-Pflicht) | Nach `api/delete-account.js` kopieren |

---

## Aktivierungs-Prozedur (wenn der User zustimmt)

1. **Firebase einrichten:**
   - Projekt auf https://console.firebase.google.com
   - Cloud Messaging aktivieren
   - Server-Key kopieren

2. **Supabase Tabelle anlegen** (SQL aus `push-notification-sender.js` Ende):
   ```sql
   create table if not exists push_tokens (...);
   ```

3. **Env-Variablen in Vercel:**
   ```
   FCM_SERVER_KEY=AAAA...
   ```

4. **Files nach api/ kopieren:**
   ```bash
   cp mobile-app/server-stub/save-push-token.js  api/
   cp mobile-app/server-stub/delete-account.js   api/
   ```

5. **send-reminders.js erweitern** um Push-Versand:
   ```js
   const { sendPickupReminder } = require('./push-notification-sender');
   // im Cron-Loop:
   await sendPickupReminder(booking);
   ```

6. **Webseite (account.html, booking.html) erweitern** um Token-Save + Account-Delete-Button (siehe NEXT-STEPS.md).

---

## Tests

Nach Aktivierung lokal testen:
```bash
# Push token speichern
curl -X POST https://simpletrailer.de/api/save-push-token \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"test_fcm_token","platform":"android"}'

# Account-Delete (VORSICHT — wirklich löschend!)
curl -X POST https://simpletrailer.de/api/delete-account \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirm":true}'
```
