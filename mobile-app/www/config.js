/* SimpleTrailer App – zentrale Konfiguration
 *
 * HIER ÄNDERN, falls du Clean URLs einsetzt oder die Domain wechselst.
 * Nach Änderung: kein Rebuild nötig, NUR `npx cap sync` reicht.
 */
window.SIMPLETRAILER_APP_CONFIG = {
  /** Start-URL die in der WebView geladen wird */
  START_URL: 'https://simpletrailer.de/',

  /** Optional: spezifische Routen für Deep-Links / native Buttons */
  ROUTES: {
    home:       '/',
    booking:    '/booking.html',
    account:    '/account.html',
    precheck:   '/precheck.html',
    return:     '/return.html'
  },

  /** App-Version – wird auch im User-Agent gesendet */
  APP_VERSION: '1.0.0',

  /** Wenn true, lädt die Bridge geo/camera/push-Stubs auch ohne Native (für Browser-Tests) */
  ENABLE_BROWSER_FALLBACK: true
};
