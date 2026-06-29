/*
 * SimpleTrailer — E-Mail-Tippfehler-Warnung
 *
 * Schlägt bei offensichtlichen Vertippern eine Korrektur vor
 * ("Meinten Sie max@gmail.com?") — direkt am Eingabefeld, beim Verlassen.
 *
 * - Hängt sich AUTOMATISCH an alle <input type="email"> der Seite.
 * - Rein clientseitig: kein externer Dienst, keine Abhängigkeit, kein Tracking.
 * - Blockiert NICHTS: zeigt nur einen anklickbaren Vorschlag, Kunde entscheidet.
 *
 * Zweck: fängt den häufigsten Grund für "Vertrag/Rechnung kommt nie an" ab —
 * den Schreibfehler in der Mail (gmial.com, hotmial.de, .con statt .com …).
 */
(function () {
  'use strict';

  // Häufige Domains in DE — gegen diese wird auf Tippnähe geprüft.
  var DOMAINS = [
    'gmail.com', 'googlemail.com', 'web.de', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch',
    'hotmail.com', 'hotmail.de', 'outlook.com', 'outlook.de', 'live.de', 'live.com',
    'yahoo.com', 'yahoo.de', 't-online.de', 'icloud.com', 'me.com',
    'freenet.de', 'aol.com', 'mail.de', 'posteo.de', 'mailbox.org'
  ];
  // Häufige Top-Level-Domains (für Fälle wie ".con" → ".com" vertippt).
  var TLDS = ['com', 'de', 'net', 'org', 'at', 'ch', 'eu', 'info', 'io', 'me'];

  // Bekannte, gültige TLDs — diese werden NIE als Tippfehler "korrigiert".
  // Schützt echte Länder-/Firmen-Adressen (.cz/.es/.it/.fr …) vor Falschvorschlägen.
  var KNOWN_TLDS = [
    'com', 'de', 'net', 'org', 'at', 'ch', 'eu', 'info', 'io', 'me',
    'cz', 'es', 'it', 'fr', 'nl', 'pl', 'dk', 'se', 'be', 'uk', 'co',
    'app', 'dev', 'shop', 'online', 'biz', 'live', 'email', 'us', 'ca', 'au'
  ];

  // Levenshtein-Distanz (wie viele Zeichen-Änderungen zwischen zwei Wörtern).
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    if (!m) return n;
    if (!n) return m;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) {
      for (j = 1; j <= n; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      }
    }
    return d[m][n];
  }

  // Nächstliegenden Treffer aus einer Liste finden (innerhalb maxDist).
  // Exakter Treffer → null (kein Vorschlag nötig).
  function closest(part, list, maxDist) {
    var best = null, bestD = maxDist + 1;
    for (var i = 0; i < list.length; i++) {
      if (part === list[i]) return null;
      var dd = lev(part, list[i]);
      if (dd < bestD) { bestD = dd; best = list[i]; }
    }
    return bestD <= maxDist ? best : null;
  }

  // Aus einer (mutmaßlich vertippten) Mail einen Korrektur-Vorschlag ableiten.
  function suggest(email) {
    email = String(email || '').trim().toLowerCase();
    var at = email.lastIndexOf('@');
    if (at < 1) return null;
    var local = email.slice(0, at);
    var domain = email.slice(at + 1);
    if (!domain || domain.indexOf('.') < 0) return null;

    // 1) Ganze Domain ein klarer Tippfehler? (gmial.com → gmail.com)
    //    Distanz ≤2 (fängt auch Dreher wie "ia"↔"ai" in gmial). ABER nur vorschlagen,
    //    wenn die Wurzel VOR dem ersten Punkt (SLD) abweicht. Ist die SLD identisch und
    //    nur die Endung anders (gmx.com vs gmx.de), ist es eine ECHTE andere Domain.
    var dFix = closest(domain, DOMAINS, 2);
    if (dFix) {
      var dDot = domain.lastIndexOf('.'), fDot = dFix.lastIndexOf('.');
      var sameSld = dDot > 0 && fDot > 0 && domain.slice(0, dDot) === dFix.slice(0, fDot);
      if (!sameSld) return local + '@' + dFix;
    }

    // 2) Nur die Endung vertippt? (firma.con → firma.com)
    //    Nur, wenn die getippte Endung selbst KEINE bekannte gültige TLD ist
    //    (lässt echte .cz/.es/.it/.fr-Adressen in Ruhe).
    var dot = domain.lastIndexOf('.');
    var sld = domain.slice(0, dot);
    var tld = domain.slice(dot + 1);
    if (KNOWN_TLDS.indexOf(tld) === -1) {
      var tFix = closest(tld, TLDS, 1);
      if (tFix && tFix !== tld) return local + '@' + sld + '.' + tFix;
    }

    return null;
  }

  // Warn-Hinweis an ein E-Mail-Feld hängen.
  function attach(input) {
    if (!input || input.dataset.stcTypo) return;
    input.dataset.stcTypo = '1';

    var hint = document.createElement('div');
    // Orange (#E85D00) ist auf hellem UND dunklem Hintergrund gut lesbar.
    hint.style.cssText = 'display:none;margin-top:6px;font-size:.82rem;line-height:1.45;color:#E85D00;';
    input.insertAdjacentElement('afterend', hint);

    function check() {
      var s = suggest(input.value);
      if (s) {
        hint.innerHTML = '⚠️ Meinten Sie ' +
          '<button type="button" style="background:none;border:0;color:#E85D00;font-weight:800;cursor:pointer;text-decoration:underline;padding:0;font:inherit;">' +
          s.replace(/</g, '&lt;') + '</button>?';
        hint.querySelector('button').onclick = function () {
          input.value = s;
          hint.style.display = 'none';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        hint.style.display = 'block';
      } else {
        hint.style.display = 'none';
      }
    }

    input.addEventListener('blur', check);
    // Während des Tippens den Hinweis wieder ausblenden (nicht nerven).
    input.addEventListener('input', function () {
      if (hint.style.display !== 'none') hint.style.display = 'none';
    });
  }

  function init() {
    var els = document.querySelectorAll('input[type="email"]');
    for (var i = 0; i < els.length; i++) attach(els[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
