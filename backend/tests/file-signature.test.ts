import { describe, expect, it } from 'vitest';
import { MAX_FILE_SIZE_BYTES } from '@bpi/shared';
import {
  detectFileType,
  validateFileSignature,
} from '../src/utils/file-signature';
import { HttpError } from '../src/utils/http-error';

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]);

describe('file signatures', () => {
  it('detects PDF and JPEG content', () => {
    expect(detectFileType(pdf)).toEqual({
      mimeType: 'application/pdf',
      extension: 'pdf',
    });
    expect(detectFileType(jpeg)).toEqual({
      mimeType: 'image/jpeg',
      extension: 'jpg',
    });
  });

  it('rejects unknown content', () => {
    expect(detectFileType(Buffer.from('not a document'))).toBeNull();
  });

  it('rejects a declared type that does not match the bytes', () => {
    expect(() =>
      validateFileSignature(pdf, 'image/jpeg', 'Aadhaar document'),
    ).toThrow(HttpError);
  });

  it('rejects a file above the size limit', () => {
    const oversized = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1, 0);
    try {
      validateFileSignature(oversized, 'application/pdf', 'Aadhaar document');
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).code).toBe('FILE_TOO_LARGE');
    }
  });
});
