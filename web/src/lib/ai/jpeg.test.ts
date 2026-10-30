import { describe, expect, it } from 'vitest';
import { isJpeg, stripJpegMetadata } from './jpeg';

const segment = (marker: number, payload: number[]) => {
  const length = payload.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...payload];
};
const EXIF = segment(0xe1, [...Buffer.from('Exif\0\0'), 1, 2, 3, 4]); // ubicación, fecha, cámara…
const XMP = segment(0xe1, [...Buffer.from('http://ns.adobe.com/xap/1.0/\0'), 9]);
const COMMENT = segment(0xfe, [...Buffer.from('secreto')]);
const ICC = segment(0xe2, [...Buffer.from('ICC_PROFILE\0'), 7]);
const JFIF = segment(0xe0, [...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const ADOBE = segment(0xee, [...Buffer.from('Adobe'), 0, 100, 0, 0, 0, 0, 1]);
const DQT = segment(0xdb, [0, 16, 11, 10]);
const SOF = segment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]);
const SOS = [0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0];
// Datos de imagen con un 0xFF 0x00 (byte relleno) y un marcador RST dentro.
const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56];
const EOI = [0xff, 0xd9];

const jpeg = (...parts: number[][]) => Uint8Array.from([0xff, 0xd8, ...parts.flat()]);

describe('isJpeg', () => {
  it('reconoce la firma', () => {
    expect(isJpeg(jpeg(DQT))).toBe(true);
    expect(isJpeg(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(false); // PNG
    expect(isJpeg(new Uint8Array())).toBe(false);
    expect(isJpeg(Uint8Array.from([0xff, 0xd8]))).toBe(false);
  });
});

describe('stripJpegMetadata', () => {
  it('quita EXIF, XMP, comentarios y perfil ICC; conserva lo necesario para decodificar', () => {
    const input = jpeg(JFIF, EXIF, XMP, COMMENT, ICC, ADOBE, DQT, SOF, SOS, SCAN, EOI);
    const output = stripJpegMetadata(input);
    expect(output).not.toBeNull();
    expect(Array.from(output!)).toEqual(Array.from(jpeg(JFIF, ADOBE, DQT, SOF, SOS, SCAN, EOI)));
    const text = Buffer.from(output!).toString('latin1');
    for (const secret of ['Exif', 'xap', 'secreto', 'ICC_PROFILE'])
      expect(text).not.toContain(secret);
  });

  it('un JPEG sin metadatos queda igual', () => {
    const input = jpeg(DQT, SOF, SOS, SCAN, EOI);
    expect(Array.from(stripJpegMetadata(input)!)).toEqual(Array.from(input));
  });

  it('no toca los datos de imagen aunque contengan bytes que parecen marcadores', () => {
    const input = jpeg(EXIF, SOF, SOS, [0xff, 0xe1, 0x00, 0x02, 0xff, 0xfe], EOI);
    const output = stripJpegMetadata(input)!;
    expect(Array.from(output.slice(-8))).toEqual([0xff, 0xe1, 0x00, 0x02, 0xff, 0xfe, 0xff, 0xd9]);
  });

  it('devuelve null si no es un JPEG o está truncado/mal formado', () => {
    expect(stripJpegMetadata(Uint8Array.from([1, 2, 3, 4, 5]))).toBeNull();
    expect(stripJpegMetadata(jpeg(EXIF.slice(0, 6)))).toBeNull(); // segmento cortado
    expect(stripJpegMetadata(jpeg([0xff, 0xe1, 0x00]))).toBeNull(); // sin largo completo
    expect(stripJpegMetadata(jpeg([0x00, 0x01]))).toBeNull(); // no empieza con marcador
    expect(stripJpegMetadata(jpeg(DQT, SOF))).toBeNull(); // sin SOS ni EOI
  });
});
