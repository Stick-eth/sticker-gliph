import { hexToRgb, rgbToHex, luma } from './color';

export interface PaletteDef {
  name: string;
  group: string;
  colors: string[];
}

const hx = (s: string) => s.trim().split(/\s+/).map((c) => '#' + c.toLowerCase());

function grays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => rgbToHex((i / (n - 1)) * 255, (i / (n - 1)) * 255, (i / (n - 1)) * 255));
}

function rgbCube(levels: number): string[] {
  const out: string[] = [];
  const s = 255 / (levels - 1);
  for (let r = 0; r < levels; r++)
    for (let g = 0; g < levels; g++)
      for (let b = 0; b < levels; b++) out.push(rgbToHex(r * s, g * s, b * s));
  return out;
}

export const PALETTES: PaletteDef[] = [
  // Monochrome
  { name: '1-Bit Ink', group: 'Monochrome', colors: hx('000000 ffffff') },
  { name: 'Parchment & Ink', group: 'Monochrome', colors: hx('1b1612 efe4c8') },
  { name: 'Newsprint', group: 'Monochrome', colors: hx('1a1a1a f4f0e6') },
  { name: 'Green Phosphor', group: 'Monochrome', colors: hx('041006 33ff66') },
  { name: 'Amber Monitor', group: 'Monochrome', colors: hx('120a00 ffb000') },
  { name: 'Blueprint', group: 'Monochrome', colors: hx('0b3d91 e6f0ff') },
  { name: 'Blood Oath', group: 'Monochrome', colors: hx('0a0505 c0231e') },
  { name: 'Grayscale 4', group: 'Monochrome', colors: grays(4) },
  { name: 'Grayscale 8', group: 'Monochrome', colors: grays(8) },
  { name: 'Grayscale 16', group: 'Monochrome', colors: grays(16) },

  // Retro hardware
  { name: 'Game Boy (DMG)', group: 'Retro Hardware', colors: hx('0f380f 306230 8bac0f 9bbc0f') },
  { name: 'Game Boy Pocket', group: 'Retro Hardware', colors: hx('1f1f1f 4d533c 8b956d c4cfa1') },
  { name: 'Virtual Boy', group: 'Retro Hardware', colors: hx('000000 550000 aa0000 ff0000') },
  { name: 'CGA Cyan/Magenta', group: 'Retro Hardware', colors: hx('000000 55ffff ff55ff ffffff') },
  { name: 'CGA Green/Red', group: 'Retro Hardware', colors: hx('000000 55ff55 ff5555 ffff55') },
  { name: 'EGA 16', group: 'Retro Hardware', colors: hx('000000 0000aa 00aa00 00aaaa aa0000 aa00aa aa5500 aaaaaa 555555 5555ff 55ff55 55ffff ff5555 ff55ff ffff55 ffffff') },
  { name: 'Commodore 64', group: 'Retro Hardware', colors: hx('000000 ffffff 68372b 70a4b2 6f3d86 588d43 352879 b8c76f 6f4f25 433900 9a6759 444444 6c6c6c 9ad284 6c5eb5 959595') },
  { name: 'ZX Spectrum', group: 'Retro Hardware', colors: hx('000000 0000d7 d70000 d700d7 00d700 00d7d7 d7d700 d7d7d7 0000ff ff0000 ff00ff 00ff00 00ffff ffff00 ffffff') },
  { name: 'Apple II', group: 'Retro Hardware', colors: hx('000000 dd0033 000099 dd22dd 007722 555555 2222ff 66aaff 885500 ff6600 aaaaaa ff9988 11dd00 ffff00 44ff99 ffffff') },
  { name: 'Teletext', group: 'Retro Hardware', colors: hx('000000 ff0000 00ff00 ffff00 0000ff ff00ff 00ffff ffffff') },
  { name: 'PICO-8', group: 'Retro Hardware', colors: hx('000000 1d2b53 7e2553 008751 ab5236 5f574f c2c3c7 fff1e8 ff004d ffa300 ffec27 00e436 29adff 83769c ff77a8 ffccaa') },
  { name: 'RGB 3-bit', group: 'Retro Hardware', colors: rgbCube(2) },
  { name: 'RGB 27', group: 'Retro Hardware', colors: rgbCube(3) },
  { name: 'Web Safe 216', group: 'Retro Hardware', colors: rgbCube(6) },

  // Medieval
  { name: 'Illuminated Manuscript', group: 'Medieval', colors: hx('1b1410 5a1a12 8c2a1a b8862b d9c79e f1e6c8') },
  { name: 'Iron & Ember', group: 'Medieval', colors: hx('0d0c0c 2b2826 5b534c 9c3b1c e0752d f7c46c') },
  { name: 'Heraldry', group: 'Medieval', colors: hx('14110f 1f3f8f a3201c 2f6b34 d4a52c ece3cf') },
  { name: 'Dungeon Moss', group: 'Medieval', colors: hx('0b0f0a 1f2a1a 3e5230 6f8a4a b8c27a e8e6c4') },
  { name: 'Candlelit Crypt', group: 'Medieval', colors: hx('070504 2a1a10 5e3a1e a0642c e3a857 fff0c2') },

  // Mood
  { name: 'Cyberpunk Neon', group: 'Mood', colors: hx('0d0221 261447 ff3864 2de2e6 f6019d ffffff') },
  { name: 'Acid Graphics', group: 'Mood', colors: hx('000000 00ff41 ccff00 ff00ff') },
  { name: 'Matrix', group: 'Mood', colors: hx('000000 003b00 008f11 00ff41') },
  { name: 'Gemstone', group: 'Mood', colors: hx('0b0b1a 3a0ca3 7209b7 f72585 4cc9f0 f1faee') },
  { name: 'Autumn', group: 'Mood', colors: hx('2d1b12 7a2e1c c1502e e8a33d f3d9a4') },
  { name: 'Summertime', group: 'Mood', colors: hx('023047 219ebc 8ecae6 ffb703 fb8500 fff3d6') },
  { name: 'Pastel', group: 'Mood', colors: hx('5b5f7a 97c1a9 cce2cb ffd6e0 ffefcf fdfbf7') },
  { name: 'Sepia', group: 'Mood', colors: hx('2b1d0e 6b4a2b b08a5b f2dfc0') },
  { name: 'Vaporwave', group: 'Mood', colors: hx('1a1033 3d1e6d 8b3fae ff6ad5 94d0ff f6f1ff') },
  { name: 'Handheld Ghost', group: 'Mood', colors: hx('2e1f3b 5b4a7c 9d8bbf e8e0f5') },
];

export function paletteByName(name: string): PaletteDef | undefined {
  return PALETTES.find((p) => p.name === name);
}

/** Parses .hex (lospec), .gpl (GIMP) or any text containing hex codes. */
export function parsePaletteText(text: string): string[] {
  const out: string[] = [];
  if (/GIMP Palette/i.test(text)) {
    for (const line of text.split(/\r?\n/)) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)/);
      if (m) out.push(rgbToHex(+m[1], +m[2], +m[3]));
    }
    return out;
  }
  const re = /#?\b([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const c = hexToRgb(m[1]);
    out.push(rgbToHex(c[0], c[1], c[2]));
  }
  return out;
}

export function sortHexByLuma(colors: string[]): string[] {
  return [...colors].sort((a, b) => {
    const x = hexToRgb(a), y = hexToRgb(b);
    return luma(x[0], x[1], x[2]) - luma(y[0], y[1], y[2]);
  });
}
