import { Jimp } from 'jimp';
import { join } from 'path';
import { app } from 'electron';

function getLogoPath(): string {
  // In production the logo is in process.resourcesPath (bundled via extraResources).
  // In dev it lives next to the source in resources/.
  if (app.isPackaged) {
    return join(process.resourcesPath, 'logo.png');
  }
  return join(__dirname, '../../../../resources/logo.png');
}

// Returns an ESC/POS GS v 0 raster bitmap buffer for the bundled logo,
// or null if the file can't be read (so printing continues without it).
export async function buildLogoBuf(maxWidthDots = 384): Promise<Buffer | null> {
  try {
    const img = await Jimp.read(getLogoPath());

    if (img.width > maxWidthDots) img.resize({ w: maxWidthDots });
    img.greyscale().threshold({ max: 128 });

    const w = img.width;
    const h = img.height;
    const bytesPerRow = Math.ceil(w / 8);
    const pixels = img.bitmap.data; // RGBA
    const raster = Buffer.alloc(bytesPerRow * h, 0);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (pixels[(y * w + x) * 4] < 128) {
          raster[y * bytesPerRow + Math.floor(x / 8)] |= 1 << (7 - (x % 8));
        }
      }
    }

    // GS v 0: normal scale raster image
    return Buffer.concat([
      Buffer.from([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, h & 0xff, h >> 8]),
      raster
    ]);
  } catch {
    return null;
  }
}
