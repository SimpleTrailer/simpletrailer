/**
 * SimpleTrailer — zentrale helle E-Mail-Vorlage (Single Source of Truth).
 *
 * E-Mail-sicher: Tabellen-Layout + Inline-Styles + System-Fonts → rendert
 * zuverlässig in Gmail, Outlook und Apple Mail (kein Flexbox/Grid, keine
 * externen Stylesheets). Helles Design passend zur Website:
 * Papier-Hintergrund, weiße Karte mit Orange-Akzent, schwarzer Footer als Rahmen.
 *
 * Verwendung:
 *   const T = require('./_email-template');
 *   const html = T.layout({ heading, bodyHtml: T.p('…') + T.cta(T.btn('…','…')), replyNote });
 */

const C = {
  paper: '#F6F3EE', card: '#FFFFFF', ink: '#111213', body: '#4A4742', muted: '#8A857D',
  orange: '#E85D00', orangeTint: '#FFF4EA', green: '#15803D', greenTint: '#E8F8EE',
  border: '#E7E2D9', band: '#111213',
};
const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/** Absatz */
function p(html) {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.62;color:${C.body};">${html}</p>`;
}

/** Button (primär = orange, ghost = weiß mit Rahmen) */
function btn(label, href, ghost = false) {
  const bg = ghost ? '#FFFFFF' : C.orange;
  const col = ghost ? C.ink : '#FFFFFF';
  const brd = ghost ? `border:1.5px solid ${C.border};` : 'border:1px solid ' + C.orange + ';';
  return `<a href="${href}" style="display:inline-block;background:${bg};color:${col};text-decoration:none;font-weight:800;font-size:15px;padding:14px 32px;border-radius:11px;${brd}font-family:${FONT};">${label}</a>`;
}

/** CTA-Wrapper (zentriert) */
function cta(inner) {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:6px 0 2px;">${inner}</td></tr></table>`;
}

/** Info-Zeilen: items = [[label, value], …] */
function rows(items) {
  const body = items.map(([k, v], i) => {
    const last = i === items.length - 1;
    const bb = last ? 'none' : `1px solid ${C.border}`;
    const isTotal = String(k).toLowerCase().includes('gesamt');
    return `<tr>
      <td style="padding:11px 16px;border-bottom:${bb};color:${C.muted};font-size:14px;${isTotal ? 'background:#FBF8F3;' : ''}">${k}</td>
      <td style="padding:11px 16px;border-bottom:${bb};text-align:right;font-weight:700;color:${isTotal ? C.orange : C.ink};font-size:${isTotal ? '16px' : '14px'};${isTotal ? 'background:#FBF8F3;' : ''}">${v}</td>
    </tr>`;
  }).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid ${C.border};border-radius:12px;border-collapse:separate;overflow:hidden;margin:4px 0 20px;">${body}</table>`;
}

/** Hinweis-Box: kind = grey | green | orange */
function callout(html, kind = 'grey') {
  const m = { grey: [C.paper, C.border, C.body], green: [C.greenTint, '#BFE8CD', '#14532D'], orange: [C.orangeTint, '#F4D3B4', '#7A3D00'] };
  const [bg, bd, col] = m[kind] || m.grey;
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;"><tr><td style="background:${bg};border:1px solid ${bd};border-radius:12px;padding:14px 18px;color:${col};font-size:14px;line-height:1.55;">${html}</td></tr></table>`;
}

/** Code-Box (Zahlenschloss-Code o. Ä.) */
function codeBox(label, code) {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;"><tr><td align="center" style="background:${C.greenTint};border:1px dashed #9ED3B0;border-radius:14px;padding:20px;">
    <div style="font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#3f7553;margin-bottom:6px;">${esc(label)}</div>
    <div style="font-size:30px;font-weight:900;letter-spacing:6px;color:#14532D;font-family:Menlo,Consolas,monospace;">${esc(code)}</div>
  </td></tr></table>`;
}

/** Gutschein-Banner (orange) */
function voucher({ headline, big, code, validity }) {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;"><tr><td align="center" style="background:${C.orange};border-radius:14px;padding:24px;">
    <div style="font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#ffe6d4;margin-bottom:4px;">${esc(headline)}</div>
    <div style="font-size:34px;font-weight:900;color:#ffffff;line-height:1;margin-bottom:10px;">${esc(big)}</div>
    <div style="display:inline-block;background:rgba(0,0,0,.22);border:1px dashed rgba(255,255,255,.55);border-radius:8px;padding:7px 16px;font-size:17px;font-weight:800;letter-spacing:2px;color:#ffffff;">${esc(code)}</div>
    ${validity ? `<div style="font-size:12px;color:#ffe6d4;margin-top:11px;">${esc(validity)}</div>` : ''}
  </td></tr></table>`;
}

/** Foto-Banner (z. B. Anhänger-Foto im Mietvertrag). src kann cid:… oder URL sein. */
function photo(src, captionHtml) {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;"><tr><td style="border-radius:12px;overflow:hidden;">
    <img src="${src}" alt="Anhänger" width="100%" style="display:block;width:100%;max-height:220px;object-fit:cover;border-radius:12px;" />
    ${captionHtml ? `<div style="font-size:12px;color:${C.muted};margin-top:8px;">${captionHtml}</div>` : ''}
  </td></tr></table>`;
}

/**
 * Gesamt-Layout.
 * @param {object} o
 * @param {string} o.heading    Überschrift in der Karte
 * @param {string} o.bodyHtml   fertiges Body-HTML (p/rows/callout/cta …)
 * @param {string} [o.replyNote] kleiner Hinweis unter der Karte (z. B. "Fragen? Antworte …")
 * @param {string} [o.preheader] versteckter Vorschautext (Inbox-Snippet)
 */
function layout({ heading, bodyHtml, replyNote = '', preheader = '' }) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${C.paper};">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;">${preheader}</div>` : ''}
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${C.paper};font-family:${FONT};">
<tr><td align="center" style="padding:34px 16px 44px;">
  <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;">
    <tr><td align="center" style="padding-bottom:6px;font-family:${FONT};"><span style="font-size:24px;font-weight:800;letter-spacing:-.5px;color:${C.ink};">Simple</span><span style="font-size:24px;font-weight:800;letter-spacing:-.5px;color:${C.orange};">Trailer</span></td></tr>
    <tr><td align="center" style="padding-bottom:22px;"><div style="width:34px;height:3px;background:${C.orange};border-radius:3px;line-height:3px;font-size:0;">&nbsp;</div></td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.border};border-top:3px solid ${C.orange};border-radius:14px;padding:34px 30px;">
      <h1 style="margin:0 0 16px;font-size:23px;font-weight:800;line-height:1.22;color:${C.ink};font-family:${FONT};">${heading}</h1>
      ${bodyHtml}
    </td></tr>
    ${replyNote ? `<tr><td align="center" style="padding:16px 20px 0;color:${C.muted};font-size:13px;line-height:1.5;">${replyNote}</td></tr>` : ''}
    <tr><td height="22" style="font-size:0;line-height:22px;">&nbsp;</td></tr>
    <tr><td align="center" style="background:${C.band};border-radius:12px;padding:24px 30px;">
      <div style="font-size:15px;font-weight:800;color:#ffffff;margin-bottom:6px;font-family:${FONT};">Simple<span style="color:${C.orange};">Trailer</span></div>
      <div style="color:#b9b5ad;font-size:12px;line-height:1.7;font-family:${FONT};">SimpleTrailer GbR · Waltjenstr. 96, 28237 Bremen<br><a href="https://simpletrailer.de" style="color:#e0ddd6;text-decoration:none;">simpletrailer.de</a> · <a href="mailto:info@simpletrailer.de" style="color:#e0ddd6;text-decoration:none;">info@simpletrailer.de</a></div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

module.exports = { layout, p, btn, cta, rows, callout, codeBox, voucher, photo, esc, COLORS: C };
