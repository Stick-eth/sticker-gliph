export interface Charset {
  id: string;
  name: string;
  category: string;
  chars: string;
}

const range = (from: number, to: number, step = 1) => {
  let s = '';
  for (let c = from; c <= to; c += step) s += String.fromCodePoint(c);
  return s;
};

const fraktur =
  '\u{1D504}\u{1D505}ℭ\u{1D507}\u{1D508}\u{1D509}\u{1D50A}ℌℑ\u{1D50D}\u{1D50E}\u{1D50F}\u{1D510}\u{1D511}\u{1D512}\u{1D513}\u{1D514}ℜ\u{1D516}\u{1D517}\u{1D518}\u{1D519}\u{1D51A}\u{1D51B}\u{1D51C}' +
  range(0x1d51e, 0x1d537);

export const CATEGORIES = [
  'Classic ASCII',
  'Numbers',
  'Symbols',
  'Blocks',
  'Braille',
  'Geometric',
  'Languages',
  'Cards & Games',
  'Unicode',
  'Medieval',
  'Structure',
] as const;

export const CHARSETS: Charset[] = [
  // Classic ASCII (6)
  { id: 'classic-standard', name: 'Standard', category: 'Classic ASCII', chars: ' .:-=+*#%@' },
  { id: 'classic-detailed', name: 'Detailed 70', category: 'Classic ASCII', chars: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$" },
  { id: 'classic-minimal', name: 'Minimal', category: 'Classic ASCII', chars: ' .oO@' },
  { id: 'classic-alphabet', name: 'Alphabet', category: 'Classic ASCII', chars: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { id: 'classic-punct', name: 'Punctuation', category: 'Classic ASCII', chars: " .,:;'\"!?-_~^*" },
  { id: 'classic-code', name: 'Source Code', category: 'Classic ASCII', chars: '{}[]()<>/\\|;=+-*&%$#@!' },

  // Numbers (4)
  { id: 'num-digits', name: 'Digits', category: 'Numbers', chars: '0123456789' },
  { id: 'num-binary', name: 'Binary', category: 'Numbers', chars: '01' },
  { id: 'num-hex', name: 'Hexadecimal', category: 'Numbers', chars: '0123456789ABCDEF' },
  { id: 'num-roman', name: 'Roman Numerals', category: 'Numbers', chars: 'IVXLCDM' },

  // Symbols (5)
  { id: 'sym-math', name: 'Mathematics', category: 'Symbols', chars: '+-×÷=≠≈∞∑∏√∫∂∆∇' },
  { id: 'sym-arrows', name: 'Arrows', category: 'Symbols', chars: '←↑→↓↔↕↖↗↘↙⇐⇑⇒⇓' },
  { id: 'sym-stars', name: 'Stars', category: 'Symbols', chars: '·✦✧★☆✩✪✫✬✭✮✯✰' },
  { id: 'sym-currency', name: 'Currency', category: 'Symbols', chars: '$¢£¥€₿₽₹₩' },
  { id: 'sym-typo', name: 'Typographic', category: 'Symbols', chars: '·•°†‡§¶©®™※' },

  // Blocks (5)
  { id: 'blk-shades', name: 'Shades', category: 'Blocks', chars: '░▒▓█' },
  { id: 'blk-half', name: 'Rising Blocks', category: 'Blocks', chars: '▁▂▃▄▅▆▇█' },
  { id: 'blk-bars', name: 'Vertical Bars', category: 'Blocks', chars: '▏▎▍▌▋▊▉█' },
  { id: 'blk-quadrants', name: 'Quadrants', category: 'Blocks', chars: '▖▗▘▝▚▞▙▛▜▟█▌▐▀▄' },
  { id: 'blk-box', name: 'Box Drawing', category: 'Blocks', chars: '─│┌┐└┘├┤┬┴┼═║╬' },

  // Braille (3)
  { id: 'braille-full', name: 'Braille 256', category: 'Braille', chars: range(0x2801, 0x28ff) },
  { id: 'braille-sparse', name: 'Braille Sparse', category: 'Braille', chars: '⠁⠂⠄⠆⠇⠏⠟⠿⡿⣿' },
  { id: 'braille-rain', name: 'Braille Rain', category: 'Braille', chars: '⠀⡀⡄⡆⡇⣇⣧⣷⣿' },

  // Geometric (5)
  { id: 'geo-circles', name: 'Circles', category: 'Geometric', chars: '·∘○◎●◉' },
  { id: 'geo-squares', name: 'Squares', category: 'Geometric', chars: '▫□▪■▣▢' },
  { id: 'geo-triangles', name: 'Triangles', category: 'Geometric', chars: '▵△▴▲◭◮' },
  { id: 'geo-diamonds', name: 'Diamonds', category: 'Geometric', chars: '◇◈◆❖' },
  { id: 'geo-mix', name: 'Shape Mix', category: 'Geometric', chars: '○□△◇●■▲◆★♦' },

  // Languages (7)
  { id: 'lang-katakana', name: 'Katakana', category: 'Languages', chars: 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ' },
  { id: 'lang-hiragana', name: 'Hiragana', category: 'Languages', chars: range(0x3042, 0x3093, 2) },
  { id: 'lang-greek', name: 'Greek', category: 'Languages', chars: range(0x03b1, 0x03c9) + 'ΓΔΘΛΞΠΣΦΨΩ' },
  { id: 'lang-cyrillic', name: 'Cyrillic', category: 'Languages', chars: range(0x0430, 0x044f) + 'ЖЩШФЯ' },
  { id: 'lang-hebrew', name: 'Hebrew', category: 'Languages', chars: range(0x05d0, 0x05ea) },
  { id: 'lang-hangul', name: 'Hangul', category: 'Languages', chars: 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ가나다라마바사아자차카타파하' },
  { id: 'lang-arabic', name: 'Arabic', category: 'Languages', chars: 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي' },

  // Cards & Games (4)
  { id: 'card-suits', name: 'Card Suits', category: 'Cards & Games', chars: '♤♧♡♢♠♣♥♦' },
  { id: 'card-faces', name: 'Playing Cards', category: 'Cards & Games', chars: range(0x1f0a1, 0x1f0ab) + '\u{1F0AD}\u{1F0AE}' },
  { id: 'card-dice', name: 'Dice', category: 'Cards & Games', chars: '⚀⚁⚂⚃⚄⚅' },
  { id: 'card-chess', name: 'Chess', category: 'Cards & Games', chars: '♙♘♗♖♕♔♟♞♝♜♛♚' },

  // Unicode (4)
  { id: 'uni-misc', name: 'Celestial', category: 'Unicode', chars: '☀☁☂☃☄☾☽☿♀♁♂♃♄♅♆♇' },
  { id: 'uni-dingbats', name: 'Dingbats', category: 'Unicode', chars: '✁✂✃✄✆✇✈✉✌✍✎✏✐✑✒✓✔✕✖✗✘' },
  { id: 'uni-zodiac', name: 'Zodiac', category: 'Unicode', chars: range(0x2648, 0x2653) },
  { id: 'uni-tech', name: 'Technical', category: 'Unicode', chars: '⌀⌂⌘⌥⏚⏏⎔⎈⍟⍉⍋⍒' },

  // Medieval (3)
  { id: 'med-futhark', name: 'Elder Futhark', category: 'Medieval', chars: 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ' },
  { id: 'med-fraktur', name: 'Blackletter', category: 'Medieval', chars: fraktur },
  { id: 'med-heraldry', name: 'Heraldry', category: 'Medieval', chars: '⚔⚜☩✠☨✝⚚♰♱❦❧☙' },

  // Structure (2)
  { id: 'struct-slashes', name: 'Slashes', category: 'Structure', chars: " .-_|/\\'`,"},
  { id: 'struct-pipes', name: 'Pipes & Joints', category: 'Structure', chars: ' |-+/\\_=^v<>' },
];

export function charsetById(id: string): Charset {
  return CHARSETS.find((c) => c.id === id) ?? CHARSETS[0];
}

/** Final glyph list: set + injected glyphs, deduplicated, split by code point. */
export function resolveGlyphs(setId: string, custom: string, customMode: string, includeSpace: boolean): string[] {
  const base = Array.from(charsetById(setId).chars);
  const inj = Array.from(custom || '').slice(0, 10);
  let list = customMode === 'only' && inj.length ? inj : [...base, ...inj];
  list = [...new Set(list)];
  if (includeSpace && !list.includes(' ')) list.unshift(' ');
  if (!includeSpace && list.length > 1) list = list.filter((c) => c !== ' ');
  return list.length ? list : [' ', '#'];
}
