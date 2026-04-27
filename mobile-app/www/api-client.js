/* SimpleTrailer API Client
 *
 * Spiegelt 1:1 die Endpoints der Webseite (../api/*).
 * Wird von nativen App-Screens (Onboarding, Push-Handler, evtl. native
 * Bookings-Liste) genutzt — die WebView selbst ruft die API direkt auf.
 *
 * Auth-Token kommt aus localStorage 'st_session' (gleicher Key wie Webseite),
 * sodass Login in der WebView automatisch auch fuer die App-Bridge gilt.
 *
 * Verwendung:
 *   const api = new SimpleTrailerApi();
 *   const trailers = await api.getTrailers();
 *   const bookings = await api.getMyBookings();
 */
(function () {
  const DEFAULT_BASE = 'https://simpletrailer.de';
  const SUPABASE_URL = 'https://zcjlfatuelhkghtdyrqh.supabase.co';

  class SimpleTrailerApi {
    constructor(opts = {}) {
      this.baseUrl = (opts.baseUrl || (window.SIMPLETRAILER_APP_CONFIG?.START_URL || DEFAULT_BASE)).replace(/\/$/, '');
    }

    _getToken() {
      try {
        const saved = localStorage.getItem('st_session');
        if (!saved) return null;
        return JSON.parse(saved).access_token || null;
      } catch (e) { return null; }
    }

    async _fetch(path, options = {}) {
      const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };
      if (options.auth !== false) {
        const token = this._getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(url, { ...options, headers });
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
      if (!res.ok) {
        const err = new Error(data.error || data.message || `HTTP ${res.status}`);
        err.status = res.status;
        err.body = data;
        throw err;
      }
      return data;
    }

    // ===== Trailers =====
    /** Liste aller verfuegbaren Anhaenger */
    async getTrailers() {
      const { trailers } = await this._fetch('/api/get-trailers', { auth: false });
      return trailers || [];
    }

    /** Belegte Zeitfenster (1h Puffer ist serverseitig schon dazugerechnet) */
    async getAvailability(trailerId) {
      const q = trailerId ? `?trailer_id=${encodeURIComponent(trailerId)}` : '';
      const { booked } = await this._fetch(`/api/get-availability${q}`, { auth: false });
      return booked || [];
    }

    // ===== Bookings =====
    /** Eigene Buchungen (sortiert nach created_at desc) — braucht Login */
    async getMyBookings() {
      const { bookings } = await this._fetch('/api/get-user-bookings');
      return bookings || [];
    }

    /** Eine Buchung per id+token (z.B. aus Bestaetigungs-E-Mail) */
    async getBooking(id, token) {
      return this._fetch(`/api/booking?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`, { auth: false });
    }

    // ===== Identity (Fuehrerschein-Verifikation via Stripe Identity) =====
    async getIdentity() {
      return this._fetch('/api/identity');
    }

    async startIdentityVerification() {
      return this._fetch('/api/identity', { method: 'POST' });
    }

    // ===== Auth (direkter Supabase-Call, gleiche Tokens wie Webseite) =====
    async login(email, password) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: this._anonKey(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error_description || 'Login fehlgeschlagen');
      try {
        localStorage.setItem('st_session', JSON.stringify({ access_token: data.access_token }));
      } catch (e) {}
      return data;
    }

    async getMe() {
      const token = this._getToken();
      if (!token) return null;
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: this._anonKey(), Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return null;
      return res.json();
    }

    logout() {
      try { localStorage.removeItem('st_session'); } catch (e) {}
    }

    /** Anon-Key fuer Supabase — wird beim ersten Call von der Webseite extrahiert.
     *  TODO: cleaner waere ein /api/anon-key Endpoint, aber noch nicht da. */
    _anonKey() {
      // Cache aus localStorage falls schon einmal von Webseite gespeichert
      const cached = localStorage.getItem('st_supabase_anon');
      if (cached) return cached;
      // Fallback: hardcoded Anon-Key aus Webseiten-Code (PUBLIC, kein Secret)
      // (siehe booking.html:765 — ist der Supabase Anon Public Key)
      // Wenn der Key sich aendert, hier updaten ODER Endpoint /api/anon-key bauen.
      throw new Error('Anon key not cached — Webseite muss sich erst einmal initialisiert haben. ODER /api/anon-key Endpoint hinzufuegen.');
    }
  }

  window.SimpleTrailerApi = SimpleTrailerApi;
})();
