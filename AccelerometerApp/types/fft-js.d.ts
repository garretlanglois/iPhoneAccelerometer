declare module 'fft-js' {
    export function fft(input: number[]): number[];
    export function ifft(input: number[]): number[];
    export const util: {
      complexMag(real: number, imag: number): number;
      magnitude(spectrum: number[]): number[];
    };
  }
  