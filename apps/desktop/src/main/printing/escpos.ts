// Raw ESC/POS command builder. No external dependencies — uses Node built-ins only.
// Targets standard Epson-compatible thermal printers over TCP (port 9100).

// How the euro sign is rendered — printers vary in which code page they honor.
//  'pc858'   ESC t 19, € at 0xD5 (Epson default; works on most genuine Epsons)
//  'wpc1252' ESC t 16, € at 0x80 (Windows-1252; the most widely supported page)
//  'none'    no code-page switch, € printed as a space (guaranteed on any printer)
export type EuroMode = 'pc858' | 'wpc1252' | 'none';

// [code-page byte for ESC t, byte to emit for €] per mode.
const EURO_MODES: Record<EuroMode, { codePage: number; euroByte: number }> = {
  pc858: { codePage: 19, euroByte: 0xd5 },
  wpc1252: { codePage: 16, euroByte: 0x80 },
  none: { codePage: 0, euroByte: 0x20 } // PC437, € → space
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
  // Strips diacritics so Italian accented chars print correctly on all code pages.
  text(s: string): this {
    const plain = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (let i = 0; i < plain.length; i++) {
      const code = plain.charCodeAt(i);
      if (code === 0x20ac) { this.buf.push(this.euro.euroByte); continue; } // € position depends on code page
      this.buf.push(code & 0xff);
    }
    return this;
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
