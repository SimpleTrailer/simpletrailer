/*
 * SimpleTrailer Native Bridge
 *
 * Aktiviert native Features (Kamera, Geolocation, Push, Haptics, Status-Bar) NUR
 * wenn die Seite in der Capacitor-App laeuft. Im normalen Browser passiert NICHTS —
 * progressive enhancement ohne Risiko fuer die Live-Webseite.
 *
 * Verwendung in einer Webseite:
 *   <script src="/native-bridge.js" defer></script>
 *
 * Danach steht window.SimpleTrailerNative bereit (auch im Browser, mit isNative=false),
 * sodass Aufrufer einheitlich pruefen koennen.
 */
(function () {
  'use strict';

  const Cap = (typeof window !== 'undefined') ? window.Capacitor : null;
  const isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());

  // Browser-Stub: gibt allen Aufrufern definierte Defaults zurueck, damit kein null-check vergessen wird.
  const stub = {
    isNative: false,
    platform: 'web',
    async takePhoto()         { return null; },
    async getCurrentLocation(){ return null; },
    async share()             { return false; },
    async haptic()            { /* noop */ },
    async setBadge()          { /* noop */ },
    onAppResume() { /* noop */ },
    onPushReceived() { /* noop */ },
    onDeepLink() { /* noop */ }
  };

  if (!isNative) {
    window.SimpleTrailerNative = stub;
    return;
  }

  // ===== Native Mode aktiv =====
  const platform = (Cap.getPlatform && Cap.getPlatform()) || 'unknown';
  const P = Cap.Plugins || {};

  // ── 1. Status-Bar dunkel halten (Capacitor.config setzt es schon, aber zur Sicherheit) ──
  try {
    if (P.StatusBar) {
      P.StatusBar.setStyle({ style: 'DARK' }).catch(() => {});
      if (platform === 'android') {
        P.StatusBar.setBackgroundColor({ color: '#0D0D0D' }).catch(() => {});
      }
    }
  } catch (e) { /* ignore */ }

  // ── 2. Push-Notifications: Permission anfragen + Token in localStorage ablegen ──
  // account.html liest st_push_token und schickt ihn ans Backend.
  (async function setupPush() {
    try {
      if (!P.PushNotifications) return;
      const perm = await P.PushNotifications.checkPermissions();
      let granted = perm.receive === 'granted';
      if (!granted) {
        const req = await P.PushNotifications.requestPermissions();
        granted = req.receive === 'granted';
      }
      if (!granted) return;

      P.PushNotifications.addListener('registration', (t) => {
        try {
          if (t && t.value) {
            localStorage.setItem('st_push_token', t.value);
            // Ungelesen-Marker entfernen, damit account.html erneut speichert wenn Token sich aendert
            const last = localStorage.getItem('st_push_token_saved');
            if (last && last !== t.value) localStorage.removeItem('st_push_token_saved');
          }
        } catch (e) { /* ignore */ }
      });

      P.PushNotifications.addListener('registrationError', (err) => {
        console.warn('Push registration error:', err);
      });

      P.PushNotifications.addListener('pushNotificationReceived', (notif) => {
        try { stub._lastPush = notif; } catch (e) {}
      });

      P.PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        try {
          const data = action && action.notification && action.notification.data;
          if (data && data.deep_link) {
            handleDeepLink(data.deep_link);
          } else if (data && data.booking_id && data.type === 'return_reminder') {
            // Fallback: direkt zur Rueckgabe-Seite
            window.location.href = `/return.html?id=${data.booking_id}${data.return_token ? '&token=' + data.return_token : ''}`;
          }
        } catch (e) { /* ignore */ }
      });

      await P.PushNotifications.register();
    } catch (e) { /* ignore — Push ist optional */ }
  })();

  // ── 3. Deep-Link Handler (App-URL-Open Events) ──
  function handleDeepLink(urlOrPath) {
    try {
      let path = urlOrPath || '';
      // simpletrailer://return?id=...&token=... → /return.html?id=...&token=...
      if (path.startsWith('simpletrailer://')) {
        path = path.replace('simpletrailer://', '/');
        // "/return?..." → "/return.html?..."
        path = path.replace(/^\/(return|account|booking|precheck)(\?|$)/, '/$1.html$2');
      }
      // https://simpletrailer.de/... → relativ machen, damit WebView nicht neu laedt
      if (path.startsWith('https://simpletrailer.de')) {
        path = path.replace('https://simpletrailer.de', '');
      }
      if (path && path !== window.location.pathname + window.location.search) {
        window.location.href = path;
      }
    } catch (e) { /* ignore */ }
  }

  try {
    if (P.App) {
      P.App.addListener('appUrlOpen', (ev) => {
        if (ev && ev.url) handleDeepLink(ev.url);
      });
    }
  } catch (e) { /* ignore */ }

  // ── 4. Public API ──
  const api = {
    isNative: true,
    platform,

    // Native Kamera. Liefert ein File-Objekt zurueck (kompatibel mit existing FileReader-Logik).
    async takePhoto(opts = {}) {
      if (!P.Camera) return null;
      try {
        const photo = await P.Camera.getPhoto({
          quality: opts.quality || 80,
          allowEditing: false,
          resultType: 'dataUrl',
          source: opts.source || 'CAMERA',          // 'CAMERA' | 'PHOTOS' | 'PROMPT'
          saveToGallery: false,
          correctOrientation: true,
          presentationStyle: 'fullscreen',
          width: 1600,
          promptLabelHeader: 'Anhaenger-Foto',
          promptLabelPhoto: 'Aus Galerie waehlen',
          promptLabelPicture: 'Foto aufnehmen',
          promptLabelCancel: 'Abbrechen'
        });
        if (!photo || !photo.dataUrl) return null;

        // dataUrl → Blob → File (damit existierender FormData/FileReader-Code funktioniert)
        const dataUrl = photo.dataUrl;
        const arr = dataUrl.split(',');
        const mime = (arr[0].match(/:(.*?);/) || [,'image/jpeg'])[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8 = new Uint8Array(n);
        while (n--) u8[n] = bstr.charCodeAt(n);
        const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const blob = new Blob([u8], { type: mime });
        const file = new File([blob], `return-${Date.now()}.${ext}`, { type: mime });
        return file;
      } catch (e) {
        // Capacitor wirft bei User-Abbruch — keine Fehlermeldung, einfach null
        return null;
      }
    },

    // Praezise Geolocation (native, funktioniert auch bei schlechter Browser-Geo).
    async getCurrentLocation(opts = {}) {
      if (!P.Geolocation) return null;
      try {
        const perm = await P.Geolocation.checkPermissions();
        if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
          const req = await P.Geolocation.requestPermissions();
          if (req.location !== 'granted' && req.coarseLocation !== 'granted') return null;
        }
        const pos = await P.Geolocation.getCurrentPosition({
          enableHighAccuracy: opts.highAccuracy !== false,
          timeout: opts.timeout || 10000,
          maximumAge: opts.maximumAge || 60000
        });
        return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      } catch (e) {
        return null;
      }
    },

    // Native Share-Sheet (iOS/Android nativ). Optional Plugin — silent fallback.
    async share(opts) {
      try {
        if (P.Share && P.Share.share) {
          await P.Share.share({
            title: opts.title || 'SimpleTrailer',
            text:  opts.text  || '',
            url:   opts.url   || 'https://simpletrailer.de',
            dialogTitle: opts.dialogTitle || 'Teilen'
          });
          return true;
        }
        // Fallback Web-Share
        if (navigator.share) {
          await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
          return true;
        }
      } catch (e) { /* user cancelled */ }
      return false;
    },

    // Haptisches Feedback. style: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'
    async haptic(style = 'light') {
      try {
        if (!P.Haptics) return;
        if (style === 'success' || style === 'warning' || style === 'error') {
          await P.Haptics.notification({ type: style.toUpperCase() });
        } else {
          await P.Haptics.impact({ style: style.toUpperCase() });
        }
      } catch (e) { /* ignore */ }
    },

    onAppResume(cb) {
      try {
        if (P.App && typeof cb === 'function') {
          P.App.addListener('appStateChange', (s) => { if (s.isActive) cb(); });
        }
      } catch (e) { /* ignore */ }
    }
  };

  window.SimpleTrailerNative = api;

  // ── 5. Auto-Aufwertung der Webseite: Buttons mit data-st-haptic bekommen Haptik ──
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-st-haptic]');
    if (!target) return;
    api.haptic(target.getAttribute('data-st-haptic') || 'light');
  }, { passive: true });

})();
