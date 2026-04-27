# Universal Links / App Links Setup

Diese Dateien müssen unter folgenden URLs erreichbar sein, damit der App-Store-Link-Click eine installierte App direkt öffnet (statt den Browser):

- **Android:** `https://simpletrailer.de/.well-known/assetlinks.json`
- **iOS:** `https://simpletrailer.de/.well-known/apple-app-site-association` (KEINE Datei-Endung, Content-Type `application/json`)

---

## Wer macht's?

Du, sobald die App im Store ist:

### Android (assetlinks.json)
1. Release-Keystore erstellen (siehe `../scripts/build-android-release.sh`).
2. SHA-256-Fingerprint extrahieren:
   ```bash
   keytool -list -v -keystore android/release.keystore -alias simpletrailer
   # Suche "SHA256: AB:CD:EF:..."
   ```
3. In `assetlinks.json` eintragen, dann nach `simpletrailer.de/.well-known/assetlinks.json` deployen.

### iOS (apple-app-site-association)
1. Apple Developer Team-ID aus dem Apple Developer Portal kopieren.
2. In Datei eintragen (Format: `TEAMID.de.simpletrailer.app`).
3. Nach `simpletrailer.de/.well-known/apple-app-site-association` deployen (KEINE `.json`-Endung, Content-Type `application/json`).
4. In Xcode: App → Signing & Capabilities → Associated Domains → `applinks:simpletrailer.de`.

---

## Hosting auf Vercel/Netlify

Vercel: Datei in das Repo unter `public/.well-known/...` legen, oder eigenen Rewrite-Header setzen.

Netlify: in `netlify.toml` ergänzen:
```toml
[[redirects]]
  from = "/.well-known/apple-app-site-association"
  to = "/apple-app-site-association"
  status = 200
  force = true
  conditions = {Method = ["GET"]}

[[headers]]
  for = "/.well-known/apple-app-site-association"
  [headers.values]
    Content-Type = "application/json"
```

---

## Test
```bash
# Android
curl https://simpletrailer.de/.well-known/assetlinks.json | jq

# iOS
curl https://simpletrailer.de/.well-known/apple-app-site-association | jq
```
