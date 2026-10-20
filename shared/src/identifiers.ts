import type { DuplicateField } from './constants';

export function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeMobile(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function normalizePan(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeAadhaar(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

type IdentifierInput = {
  employeeCode?: string;
  personalEmail?: string;
  personalMobile?: string;
  officeMobile?: string;
};

const DUPLICATE_FIELDS: DuplicateField[] = [
  'employeeCode',
  'personalEmail',
  'personalMobile',
  'officeMobile',
];

export function identifierFor(
  field: DuplicateField,
  value: string | undefined,
): string | null {
  if (!value) return null;
  switch (field) {
    case 'employeeCode': {
      const normalized = normalizeCode(value);
      return normalized ? `code:${normalized}` : null;
    }
    case 'personalEmail': {
      const normalized = normalizeEmail(value);
      return normalized ? `email:${normalized}` : null;
    }
    case 'personalMobile':
    case 'officeMobile': {
      const normalized = normalizeMobile(value);
      return normalized ? `mobile:${normalized}` : null;
    }
  }
}

export function buildIdentifiers(input: IdentifierInput): string[] {
  const identifiers = DUPLICATE_FIELDS.map((field) =>
    identifierFor(field, input[field]),
  ).filter((value): value is string => Boolean(value));
  return [...new Set(identifiers)];
}

export function identifiersForInput(input: IdentifierInput): {
  field: DuplicateField;
  identifier: string;
}[] {
  return DUPLICATE_FIELDS.flatMap((field) => {
    const identifier = identifierFor(field, input[field]);
    return identifier ? [{ field, identifier }] : [];
  });
}
