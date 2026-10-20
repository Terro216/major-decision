// Hand-drawn, heavy uncondensed outlines, shared by the SVG fallback and 3D.
// Coordinates are independent of installed browser fonts.
export const answerPaths = {
  Y: 'M0 0H36L53 33L70 0H106L71 62V104H35V62Z',
  E: 'M0 0H92V29H36V39H86V66H36V76H94V104H0Z',
  S: 'M104 33H70C70 24 61 21 54 24C45 27 48 32 58 35L77 41C99 48 109 61 106 79C102 100 81 108 55 108C25 108 3 95 0 69H36C37 80 46 84 56 82C66 80 68 74 56 70L30 61C9 54 1 43 4 27C8 7 29 -4 55 -4C84 -4 104 8 104 33Z',
  N: 'M0 0H35L67 53V0H102V104H67L35 51V104H0Z',
  O: 'M55 -4C90 -4 112 18 112 52C112 87 90 108 55 108C21 108 0 87 0 52C0 18 21 -4 55 -4ZM55 29C43 29 38 38 38 52C38 67 43 76 55 76C68 76 73 67 73 52C73 38 68 29 55 29Z',
} as const;

export const answerLetters = {
  yes: [{ letter: 'Y', x: 0 }, { letter: 'E', x: 108 }, { letter: 'S', x: 210 }],
  no: [{ letter: 'N', x: 0 }, { letter: 'O', x: 114 }],
} as const;
