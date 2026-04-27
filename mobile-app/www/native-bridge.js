/* SimpleTrailer Native Bridge
 *
 * Stellt der Webseite (simpletrailer.de) native Capacitor-Plugins zur Verfügung.
 * Die Bridge wird im Bootstrapper geladen UND nach Navigation in der WebView
 * von der Webseite über window.SimpleTrailerBridge aufrufbar.
 *
 * Da wir per `server.url` direkt simpletrailer.de laden, läuft NUR der Bootstrapper
 * mit dieser Bridge — die Webseite selbst hat sie nicht. Lösung: Capacitor injiziert
 * sein eigenes window.Capacitor in jede WebView-Seite. Die Webseite kann später
 * direkt Capacitor.Plugins.X verwenden, sobald wir das in der Webseite einbauen.
 *
 * DIESE Bridge ist primär für den Bootstrapper relevant (Push-Listener registrieren,
 * Status-Bar setzen, Splash ausblenden — Dinge, die einmal beim App-Start passieren).
 */
(function () {
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  const Bridge = {
    isNative,
    platform: window.Capacitor?.getPlatform?.() || 'web',

    async init() {
      if (!isNative) {
        console.log('[Bridge] Web mode – native plugins skipped.');
        return;
      }

      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar').catch(() => ({}));
        if (StatusBar) {
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: '#0D0D0D' });
        }
      } catch (e) { console.warn('[Bridge] StatusBar not available', e); }

      try {
        const { SplashScreen } = await import('@capacitor/splash-screen').catch(() => ({}));
        if (SplashScreen) {
          // Splash bleibt 600ms nach Bridge-Init sichtbar, dann ausblenden
          setTimeout(() => SplashScreen.hide(), 600);
        }
      } catch (e) { console.warn('[Bridge] SplashScreen not available', e); }

      try {
        await this.registerPushListeners();
      } catch (e) { console.warn('[Bridge] Push listeners failed', e); }

      try {
        await this.registerAppListeners();
      } catch (e) { console.warn('[Bridge] App listeners failed', e); }

      console.log('[Bridge] Native init complete on', this.platform);
    },

    async requestPushPermission() {
      if (!isNative) return { granted: false, reason: 'web' };
      const { PushNotifications } = await import('@capacitor/push-notifications').catch(() => ({}));
      if (!PushNotifications) return { granted: false, reason: 'plugin-missing' };
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive === 'granted') {
        await PushNotifications.register();
        return { granted: true };
      }
      return { granted: false, reason: 'denied' };
    },

    async registerPushListeners() {
      if (!isNative) return;
      const { PushNotifications } = await import('@capacitor/push-notifications').catch(() => ({}));
      if (!PushNotifications) return;
      PushNotifications.addListener('registration', (token) => {
        console.log('[Push] Token:', token.value);
        // TODO: Token an Supabase/Backend pushen, sobald Webseite das unterstützt.
        try { window.localStorage.setItem('st_push_token', token.value); } catch (e) {}
      });
      PushNotifications.addListener('pushNotificationReceived', (notif) => {
        console.log('[Push] Received:', notif);
      });
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('[Push] Action:', action);
      });
    },

    async registerAppListeners() {
      if (!isNative) return;
      const { App } = await import('@capacitor/app').catch(() => ({}));
      if (!App) return;
      App.addListener('appUrlOpen', (data) => {
        // Deep-Link Handling — z.B. simpletrailer://booking?id=xxx
        console.log('[App] Deep link:', data.url);
        try {
          const url = new URL(data.url);
          const route = url.pathname || '/';
          const search = url.search || '';
          const target = (window.SIMPLETRAILER_APP_CONFIG?.START_URL || 'https://simpletrailer.de').replace(/\/$/, '') + route + search;
          window.location.href = target;
        } catch (e) { console.warn('[App] Bad deep link', e); }
      });
      App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else App.exitApp();
      });
    },

    async getCurrentLocation() {
      if (!isNative) {
        // Browser-Fallback
        return new Promise((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error('no geolocation'));
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
            reject,
            { enableHighAccuracy: true, timeout: 10000 }
          );
        });
      }
      const { Geolocation } = await import('@capacitor/geolocation').catch(() => ({}));
      if (!Geolocation) throw new Error('Geolocation plugin missing');
      const perm = await Geolocation.requestPermissions();
      if (perm.location !== 'granted') throw new Error('Location permission denied');
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
    },

    async takePhoto() {
      if (!isNative) {
        throw new Error('Camera plugin only available in native build');
      }
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera').catch(() => ({}));
      if (!Camera) throw new Error('Camera plugin missing');
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        saveToGallery: false
      });
      return { base64: photo.base64String, format: photo.format };
    }
  };

  window.SimpleTrailerBridge = Bridge;
})();
