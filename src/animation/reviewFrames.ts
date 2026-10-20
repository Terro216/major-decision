// Clip time minus the observed launch origin. Kept outside production imports.
export const reviewFrames = {
  yes: [
    [.4, '01_tie_03_00-06-100.png'], [.7, '01_tie_04_00-06-400.png'], [.95, '01_tie_05_00-06-650.png'],
    [1.65, '01_tie_06_00-07-350.png'], [1.9, '01_tie_07_00-07-600.png'], [2.9, '01_tie_08_00-08-600.png'],
    [3.65, '01_tie_09_00-09-350.png'], [4.15, '01_tie_10_00-09-850.png'], [4.45, '01_tie_11_00-10-150.png'],
    [4.7, '01_tie_12_00-10-400.png'], [4.95, '01_tie_13_00-10-650.png'], [5.2, '01_tie_14_00-10-900.png'],
    [5.45, '01_tie_15_00-11-150.png'], [5.7, '01_tie_16_00-11-400.png'], [5.8, '01_tie_17_00-11-500.png'],
    [5.95, '01_tie_18_00-11-650.png'], [6.5, '01_tie_19_00-12-200.png'],
  ],
  no: [
    [.4, '02_competition_03_00-06-600.png'], [.7, '02_competition_04_00-06-900.png'], [.95, '02_competition_05_00-07-150.png'],
    [1.7, '02_competition_06_00-07-900.png'], [1.95, '02_competition_07_00-08-150.png'], [2.9, '02_competition_08_00-09-100.png'],
    [3.7, '02_competition_09_00-09-900.png'], [4.15, '02_competition_10_00-10-350.png'], [4.65, '02_competition_11_00-10-850.png'],
    [4.9, '02_competition_12_00-11-100.png'], [5.15, '02_competition_13_00-11-350.png'], [5.4, '02_competition_14_00-11-600.png'],
    [5.65, '02_competition_15_00-11-850.png'], [5.9, '02_competition_16_00-12-100.png'], [6.15, '02_competition_17_00-12-350.png'],
    [6.55, '02_competition_18_00-12-750.png'],
  ],
} as const;
