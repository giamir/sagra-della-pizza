// Raw ESC/POS command builder. No external dependencies — uses Node built-ins only.
// Targets standard Epson-compatible thermal printers over TCP (port 9100).

// How the euro sign is rendered — printers vary in which code page they honor.
//  'pc858'   ESC t 19, € at 0xD5 (Epson default; works on most genuine Epsons)
//  'wpc1252' ESC t 16, € at 0x80 (Windows-1252; the most widely supported page)
//  'none'    no code-page switch, € printed as a space (guaranteed on any printer)
//  'eur'     the literal text "EUR" instead of a glyph — pure ASCII, works on any
//            printer/code page. The substitution happens in the price formatter so
//            column widths stay correct (see templates.ts `eur()`); the symbol byte
//            below is never reached in this mode.
export type EuroMode = 'pc858' | 'wpc1252' | 'none' | 'eur';

// [code-page byte for ESC t, byte to emit for €] per mode.
const EURO_MODES: Record<EuroMode, { codePage: number; euroByte: number }> = {
  pc858: { codePage: 19, euroByte: 0xd5 },
  wpc1252: { codePage: 16, euroByte: 0x80 },
  none: { codePage: 0, euroByte: 0x20 }, // PC437, € → space
  eur: { codePage: 0, euroByte: 0x20 } // PC437; € rendered as "EUR" text upstream
};

// Italian accents in the IBM code pages. The lowercase set sits at 0x80–0x9F,
// identical in PC437, PC850 and PC858; the uppercase set exists only in
// PC850/PC858 (PC437 has box-drawing there).
const LOW_CP_ACCENTS: Record<string, number> = {
  é: 0x82, â: 0x83, ä: 0x84, à: 0x85, ç: 0x87, ê: 0x88, ë: 0x89, è: 0x8a,
  ï: 0x8b, î: 0x8c, ì: 0x8d, É: 0x90, ô: 0x93, ö: 0x94, ò: 0x95, û: 0x96,
  ù: 0x97, ü: 0x81
};
const HIGH_CP850_ACCENTS: Record<string, number> = {
  Á: 0xb5, Â: 0xb6, À: 0xb7, Ê: 0xd2, Ë: 0xd3, È: 0xd4, Í: 0xd6, Î: 0xd7,
  Ï: 0xd8, Ì: 0xde, Ó: 0xe0, Ô: 0xe2, Ò: 0xe3, Ú: 0xe9, Û: 0xea, Ù: 0xeb
};

export class EscPos {
  private buf: number[] = [];
  readonly width: number; // chars per line at normal size
  private euro: { codePage: number; euroByte: number };

  constructor(width = 42, euroMode: EuroMode = 'pc858') {
    this.width = width;
    this.euro = EURO_MODES[euroMode] ?? EURO_MODES.pc858;
  }

  // --- Printer control ---
  // ESC @ reset, then ESC t n selects the code page that carries the euro sign
  // for the configured mode (see EURO_MODES).
  init(): this { return this.b(0x1b, 0x40, 0x1b, 0x74, this.euro.codePage); }

  // Partial cut with 3-line feed
  cut(): this { return this.b(0x1d, 0x56, 0x42, 0x03); }

  feed(n = 1): this {
    for (let i = 0; i < n; i++) this.b(0x0a);
    return this;
  }

  // --- Text formatting ---
  align(a: 'left' | 'center' | 'right'): this {
    return this.b(0x1b, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2);
  }

  bold(on: boolean): this { return this.b(0x1b, 0x45, on ? 1 : 0); }

  // Double width + height for big text (headings)
  doubleSize(on: boolean): this {
    return on ? this.b(0x1d, 0x21, 0x11) : this.b(0x1d, 0x21, 0x00);
  }

  // Double height only — taller text without changing chars-per-line,
  // so column/width layout stays intact. Used for station item lines.
  doubleHeight(on: boolean): this {
    return on ? this.b(0x1d, 0x21, 0x01) : this.b(0x1d, 0x21, 0x00);
  }

  // --- Text output ---
  // Accented chars print via their code-page byte when the page has them;
  // anything unmapped falls back to its diacritic-stripped ASCII base, so an
  // exotic character degrades to "e" instead of garbage.
  text(s: string): this {
    // NFC so a decomposed "e + ◌̀" from any source matches the map keys.
    const composed = s.normalize('NFC');
    for (const ch of composed) {
      const code = ch.codePointAt(0)!;
      if (code === 0x20ac) { this.buf.push(this.euro.euroByte); continue; } // € position depends on code page
      if (code <= 0x7f) { this.buf.push(code); continue; }
      const mapped = this.accentByte(ch);
      if (mapped != null) { this.buf.push(mapped); continue; }
      const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      for (let i = 0; i < plain.length; i++) this.buf.push(plain.charCodeAt(i) & 0xff);
    }
    return this;
  }

  // Code-page byte for an accented char, or null when the page lacks it.
  private accentByte(ch: string): number | null {
    if (this.euro.codePage === 16) {
      // Windows-1252: Latin-1 chars map to their own code point.
      const code = ch.charCodeAt(0);
      return ch.length === 1 && code <= 0xff ? code : null;
    }
    // PC437/PC850/PC858 share the lowercase accents at 0x80–0x9F.
    const low = LOW_CP_ACCENTS[ch];
    if (low != null) return low;
    // The uppercase accents exist only in PC850/PC858 (code page 19 here).
    return this.euro.codePage === 19 ? (HIGH_CP850_ACCENTS[ch] ?? null) : null;
  }

  line(s = ''): this { return this.text(s).feed(); }

  separator(char = '-'): this { return this.line(char.repeat(this.width)); }

  // Left + right columns padded to full width.
  columns(left: string, right: string): this {
    const gap = this.width - left.length - right.length;
    if (gap <= 0) {
      const truncated = left.slice(0, this.width - right.length - 1);
      return this.line(`${truncated} ${right}`);
    }
    return this.line(`${left}${' '.repeat(gap)}${right}`);
  }

  toBuffer(): Buffer { return Buffer.from(this.buf); }

  private b(...bytes: number[]): this { this.buf.push(...bytes); return this; }
}
