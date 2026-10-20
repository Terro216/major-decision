// Native outlines reconstructed from the supplied film; no font lookup at runtime.
// Normalized slab letters are warped into the two halves of the circular emblem.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const glyphs = {
  M: [110, 'M0 0L34 0L55 43L76 0L110 0L110 14L100 14L100 86L110 86L110 100L68 100L68 86L77 86L77 39L56 77L51 77L30 39L30 86L40 86L40 100L0 100L0 86L10 86L10 14L0 14Z'],
  A: [100, 'M30 0L70 0L94 86L100 86L100 100L57 100L57 86L65 86L61 70L34 70L30 86L40 86L40 100L0 100L0 86L8 86ZM47 22L38 55L57 55Z'],
  J: [61, 'M0 0L61 0L61 17L50 17L50 92C50 116 36 127 11 127L11 112C22 110 22 101 22 91L22 17L0 17Z'],
  O: [108, 'M54 0C90 0 108 18 108 50C108 83 90 100 54 100C18 100 0 83 0 50C0 18 18 0 54 0ZM54 18C40 18 32 29 32 50C32 72 40 82 54 82C68 82 76 72 76 50C76 29 68 18 54 18Z'],
  R: [103, 'M0 0L56 0C84 0 96 9 96 27C96 40 88 47 72 50C88 52 91 61 91 77L91 86L103 86L103 100L66 100L66 73C66 59 62 56 39 56L39 86L49 86L49 100L0 100L0 86L10 86L10 14L0 14ZM39 15L39 42L49 42C62 42 67 38 67 28C67 19 62 15 49 15Z'],
  D: [83, 'M0 0L39 0C70 0 83 17 83 50C83 83 70 100 39 100L0 100L0 85L8 85L8 15L0 15ZM32 17L32 83L37 83C52 83 57 73 57 50C57 27 52 17 37 17Z'],
  E: [73, 'M0 0L73 0L73 30L52 30L52 17L32 17L32 41L49 41L49 33L65 33L65 66L49 66L49 58L32 58L32 83L53 83L53 69L73 69L73 100L0 100L0 85L8 85L8 15L0 15Z'],
  C: [80, 'M63 4L64 0L80 0L80 34L58 34C55 20 50 17 43 17C29 17 25 31 25 51C25 74 32 83 43 83C53 83 58 75 60 64L80 64C78 90 65 100 40 100C13 100 0 82 0 51C0 18 14 0 40 0C50 0 56 1 63 4Z'],
  I: [42, 'M0 0L42 0L42 15L33 15L33 85L42 85L42 100L0 100L0 85L9 85L9 15L0 15Z'],
  S: [77, 'M59 4L60 0L75 0L75 31L56 31C54 20 48 16 39 16C27 16 24 24 32 30L52 42C73 53 79 61 77 76C75 92 63 100 43 100C33 100 24 97 18 94L17 100L0 100L0 65L21 65C24 80 32 84 41 84C52 84 56 77 46 70L23 57C5 47 0 39 1 26C2 9 14 0 34 0C45 0 54 2 59 4Z'],
  N: [85, 'M0 0L34 0L58 53L58 15L49 15L49 0L85 0L85 15L77 15L77 100L54 100L27 42L27 85L35 85L35 100L0 100L0 85L8 85L8 15L0 15Z'],
};
function lettering(text, top, height, arch, lower) {
  const gap = 4;
  const widths = [...text].map(letter => glyphs[letter][0]);
  const total = widths.reduce((a,b) => a+b, 0) + gap * (text.length - 1);
  let offset = 0;
  return [...text].map(letter => {
    const [width, outline] = glyphs[letter];
    let isX = true, currentX = 0;
    const path = outline.replace(/-?\d+(?:\.\d+)?/g, value => {
      const n = Number(value);
      if (isX) { currentX = (offset + n) / total; isX = false; return (47 + currentX * 506).toFixed(2); }
      isX = true;
      const edge = Math.pow(Math.abs(currentX * 2 - 1), 1.8);
      const v = n / 100;
      return (top + v * height + (lower ? -arch * edge * v : arch * edge * (1 - Math.min(v, 1)))).toFixed(2);
    });
    offset += width + gap;
    return path;
  }).join('');
}
mkdirSync('src/assets', { recursive: true });
writeFileSync('src/assets/wordmark.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><path fill="#ad3c88" stroke="#c05c9b" stroke-width=".8" fill-rule="evenodd" d="${lettering('DECISION', 304, 254, 103, true)}"/><path fill="#50ba43" stroke="#6fcc65" stroke-width=".8" fill-rule="evenodd" d="${lettering('MAJOR', 48, 244, 112, false)}"/></svg>\n`);
writeFileSync('src/assets/question-mark.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 300"><path fill="#e1c65b" stroke="#f5df91" stroke-width="1.2" d="M42 91C15 96 2 77 6 51C12 19 49 1 95 1C151 1 187 31 187 78C187 124 154 156 113 169L108 219H75V159C104 145 124 118 124 79C124 41 108 21 86 21C73 21 61 26 57 33C75 37 86 50 81 68C76 83 60 91 42 91Z"/><circle fill="#e1c65b" stroke="#f5df91" stroke-width="1.2" cx="91" cy="264" r="34"/></svg>\n`);
writeFileSync('src/assets/wordmark-badge.svg', readFileSync('src/assets/wordmark.svg', 'utf8').replace('#50ba43', '#8ac244').replace('#6fcc65', '#b4d66b').replace('#ad3c88', '#ae3e84'));
console.log('Generated native film-inspired wordmark and question mark.');
