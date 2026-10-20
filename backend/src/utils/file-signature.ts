import { MAX_FILE_SIZE_BYTES } from '@bpi/shared';
import { HttpError } from './http-error';

export type DetectedFileType = {
  mimeType: 'application/pdf' | 'image/jpeg';
  extension: 'pdf' | 'jpg';
};

export function detectFileType(buffer: Buffer): DetectedFileType | null {
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString('latin1') === '%PDF-'
  ) {
    return { mimeType: 'application/pdf', extension: 'pdf' };
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  return null;
}

export function validateFileSignature(
  buffer: Buffer,
  declaredMimeType: string,
  label: string,
): DetectedFileType {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new HttpError(
      413,
      'FILE_TOO_LARGE',
      `${label} is larger than the 5 MB limit.`,
    );
  }

  const detected = detectFileType(buffer);

  if (!detected) {
    throw new HttpError(
      400,
      'INVALID_FILE_TYPE',
      `${label} must be a PDF or JPEG file.`,
    );
  }

  if (declaredMimeType !== detected.mimeType) {
    throw new HttpError(
      400,
      'INVALID_FILE_TYPE',
      `${label} does not match its declared file type.`,
    );
  }

  return detected;
}
