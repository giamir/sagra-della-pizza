// Renders the real station tickets + receipt to an HTML page, WITHOUT a printer.
//
// It builds the actual ESC/POS byte buffers from the production templates and
// interprets the commands we emit (align / bold / character-size / feed / cut)
// as CSS, so the on-screen result mirrors what the thermal printer would output
// — including the double-height item lines.
//
//   node apps/desktop/scripts/preview-tickets.mjs
//
// Writes ticket-preview.html next to this script and opens it (macOS `open`).

import { register } from 'node:module';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

// Let Node resolve the project's `.js` import specifiers to their `.ts` source,
// and synthesize JSON modules so bare `import x from './x.json'` works without
// import attributes (the real Vite/electron-vite builds handle that for us).
const loader =
  'data:text/javascript,' +
  encodeURIComponent(`
    import { readFileSync } from 'node:fs';
    import { fileURLToPath } from 'node:url';
    export async function resolve(spec, ctx, next) {
      if (spec.endsWith('.js')) {
        try { return await next(spec, ctx); }
        catch (e) { try { return await next(spec.slice(0, -3) + '.ts', ctx); } catch { throw e; } }
      }
      return next(spec, ctx);
    }
    export async function load(url, ctx, next) {
      if (url.endsWith('.json')) {
        const src = readFileSync(fileURLToPath(url), 'utf8');
        return { format: 'module', shortCircuit: true, source: 'export default ' + src + ';' };
      }
      return next(url, ctx);
    }
  `);
register(loader, import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const { buildStationTicket, buildReceipt, groupByStation } = await import(
  join(here, '../src/main/printing/templates.ts')
);

// --- Sample order covering several stations ---
// Names and prices are pulled from the real catalog (shared menu.json) by item
// id, so the preview always matches the prices used by the app/DB.
const menu = JSON.parse(readFileSync(join(here, '../../../shared/src/data/menu.json'), 'utf8'));
const catalog = {};
for (const c of menu.categories) for (const g of c.groups) for (const it of g.items) catalog[it.id] = it;
const copertoCents = Math.round(menu.coperto.perPersona * 100);

function makeLine(itemId, qty, station) {
  const it = catalog[itemId];
  if (!it) throw new Error(`Item id non trovato nel menu: ${itemId}`);
  return { itemId, name: it.name, qty, unitPriceCents: Math.round(it.price * 100), station };
}

const lines = [
  makeLine('margherita', 2, 'Pizza'),
  makeLine('salsiccia-cipolla', 1, 'Pizza'),
  makeLine('salsicce', 3, 'Griglia e contorni'),
  makeLine('patatine', 2, 'Griglia e contorni'),
  makeLine('acqua-naturale', 2, 'Bevande'),
  makeLine('caffe', 2, 'Bar'),
  makeLine('dolce-sagra', 1, 'Dolce')
];

const people = 4;
const order = {
  id: 42,
  createdAt: new Date().toISOString(),
  people,
  totalCents: lines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0) + people * copertoCents,
  lines
};

const width = 42;
const buffers = [];
for (const [station, lines] of groupByStation(order.lines)) {
  buffers.push(buildStationTicket(order, station, lines, width));
}
buffers.push(buildReceipt(order, width));
const bytes = Buffer.concat(buffers);

// --- ESC/POS byte stream -> array of "slips" (split on the cut command) ---
// Each slip is HTML built from the formatting commands we actually emit.
function render(buf) {
  const slips = [];
  let segs = []; // current line: { text, bold, h, w }
  let html = ''; // current slip body
  const st = { align: 'left', bold: false, h: 1, w: 1 };

  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');

  const flushLine = () => {
    const inner =
      segs
        .map((g) => {
          let style = g.bold ? 'font-weight:700;' : '';
          if (g.w === 2 && g.h === 2) {
            // Double width + height: use font-size so the glyphs reserve real
            // layout width (each char = 2 cells in monospace), matching how the
            // printer centers double-width text. A transform would not reserve
            // width and would overflow the paper.
            style += 'font-size:2em;';
          } else if (g.h === 2) {
            // Double height only: scaleY keeps the character width unchanged.
            style += 'display:inline-block;transform:scaleY(1.95);transform-origin:left bottom;';
          }
          return `<span style="${style}">${esc(g.text)}</span>`;
        })
        .join('') || '&nbsp;';
    const tall = segs.some((g) => g.h === 2);
    html += `<div class="ln${tall ? ' tall' : ''}" style="text-align:${st.align}">${inner}</div>`;
    segs = [];
  };

  // `dirty` marks that real content was emitted since the last cut, so the
  // end-of-stream flush after the final cut doesn't push an empty trailing slip.
  let dirty = false;
  const flushSlip = () => {
    flushLine();
    if (dirty) slips.push(html);
    html = '';
    dirty = false;
  };

  let i = 0;
  let cur = '';
  const pushText = () => {
    if (cur) { segs.push({ text: cur, bold: st.bold, h: st.h, w: st.w }); dirty = true; }
    cur = '';
  };

  while (i < buf.length) {
    const b = buf[i];
    if (b === 0x1b) {
      const c = buf[i + 1];
      if (c === 0x40) { i += 2; continue; } // init
      if (c === 0x74) { i += 3; continue; } // codepage select + 1 arg
      if (c === 0x61) { pushText(); st.align = ['left', 'center', 'right'][buf[i + 2]] || 'left'; i += 3; continue; }
      if (c === 0x45) { pushText(); st.bold = buf[i + 2] === 1; i += 3; continue; }
      i += 1; continue;
    }
    if (b === 0x1d) {
      const c = buf[i + 1];
      if (c === 0x21) { pushText(); const n = buf[i + 2]; st.w = n & 0x10 ? 2 : 1; st.h = n & 0x01 ? 2 : 1; i += 3; continue; }
      if (c === 0x56) { pushText(); flushSlip(); i += 4; continue; } // cut
      i += 1; continue;
    }
    if (b === 0x0a) { pushText(); flushLine(); i += 1; continue; } // newline
    cur += b === 0xd5 ? '€' : String.fromCharCode(b); // 0xD5 = € in PC858
    i += 1;
  }
  flushSlip();
  return slips;
}

const slips = render(bytes);

// The receipt is the last slip and is the only one printed with the logo on top
// (centered), mirroring doPrint()'s withLogo(). Embed the real logo image so the
// preview shows it.
const logoData = readFileSync(join(here, '../resources/logo.png')).toString('base64');
const logoHtml = `<div class="logo"><img src="data:image/png;base64,${logoData}" alt="logo"></div>`;
if (slips.length) slips[slips.length - 1] = logoHtml + slips[slips.length - 1];

const page = `<!doctype html><html><head><meta charset="utf-8"><title>Anteprima scontrini</title>
<style>
  body { background:#777; font-family:sans-serif; margin:0; padding:32px; }
  .row { display:flex; flex-wrap:wrap; gap:32px; align-items:flex-start; }
  .slip { background:#fff; width:${width}ch; padding:14px 16px 26px; box-shadow:0 4px 14px rgba(0,0,0,.35);
          font-family:'Menlo','Courier New',monospace; font-size:14px; line-height:1.25; color:#111; }
  .ln { white-space:pre; }
  .ln.tall { margin:9px 0 3px; line-height:1; }
  .logo { text-align:center; margin-bottom:8px; }
  .logo img { max-width:45%; filter:grayscale(1) contrast(1.4); }
  h1 { color:#fff; font-size:16px; font-weight:500; margin:0 0 18px; }
</style></head><body>
<h1>Anteprima scontrini — le righe articolo delle stazioni sono a doppia altezza</h1>
<div class="row">${slips.map((s) => `<div class="slip">${s}</div>`).join('')}</div>
</body></html>`;

const out = join(here, 'ticket-preview.html');
writeFileSync(out, page);
console.log('Anteprima scritta in', out);
spawn('open', [out], { stdio: 'ignore', detached: true }).on('error', () => {
  console.log('Aprila manualmente nel browser.');
});
