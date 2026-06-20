// Raw ESC/POS command builder. No external dependencies — uses Node built-ins only.
// Targets standard Epson-compatible thermal printers over TCP (port 9100).

export class EscPos {
  private buf: number[] = [];
  readonly width: number; // chars per line at normal size

  constructor(width = 42) {
    this.width = width;
  }

  // --- Printer control ---
  // ESC @ reset, then ESC t 19 selects code page PC858 (has the euro sign at 0xD5).
  init(): this { return this.b(0x1b, 0x40, 0x1b, 0x74, 19); }

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

  // --- Text output ---
  // Strips diacritics so Italian accented chars print correctly on all code pages.
  text(s: string): this {
    const plain = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (let i = 0; i < plain.length; i++) {
      const code = plain.charCodeAt(i);
      if (code === 0x20ac) { this.buf.push(0xd5); continue; } // € lives at 0xD5 in PC858
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
