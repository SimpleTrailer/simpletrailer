# GitHub Actions für mobile-app

> Diese Workflows laufen, sobald der Branch nach GitHub gepusht wird.

## android-build.yml

Baut bei jedem Push auf `mobile-app-development` oder `main` (wenn `mobile-app/**` geändert wurde) eine debug-APK in der Cloud — auch wenn lokal kein JDK/Android-SDK installiert ist.

**Aktivierung:**
1. Branch nach GitHub pushen.
2. Auf GitHub: Actions-Tab → "Android Build" → erster Run startet automatisch.
3. Wenn fertig: APK unter "Artifacts" downloadbar (gültig 30 Tage).

**Manuell auslösen:** Auf GitHub → Actions → "Android Build" → "Run workflow" → mobile-app-development.

## Was noch fehlt (für später)

- `android-release.yml` — bauet signed Release-AAB für Play Store. Braucht Keystore als GitHub Secret.
- `ios-build.yml` — braucht macOS-Runner (kostenpflichtig auf privaten Repos, gratis auf öffentlichen). Braucht Apple-Signing-Cert + Provisioning-Profile als Secret.
