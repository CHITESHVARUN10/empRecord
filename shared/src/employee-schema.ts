import { z } from 'zod';
import {
  BLOOD_GROUPS,
  DEPARTMENTS,
  GENDERS,
  MARITAL_STATUSES,
  ORGANIZATIONS,
} from './constants';
import { normalizeMobile } from './identifiers';
import { INDIA_STATE_SET, isValidCityForState } from './locations';

const NAME_RE = /^[\p{L}][\p{L}\s.'-]{1,99}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,29}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PIN_RE = /^\d{6}$/;
const PASSPORT_RE = /^[A-Z0-9]{6,12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateOnly(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function ageOnDate(dateOfBirth: string, now = new Date()): number {
  if (!isValidDateOnly(dateOfBirth)) return Number.NaN;
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  let age = now.getUTCFullYear() - year;
  const hasHadBirthday =
    now.getUTCMonth() + 1 > month ||
    (now.getUTCMonth() + 1 === month && now.getUTCDate() >= day);
  if (!hasHadBirthday) age -= 1;
  return age;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const requiredName = (label: string) =>
  z
    .string()
    .max(100, `${label} is too long`)
    .refine((value) => NAME_RE.test(value.trim()), `Enter a valid ${label.toLowerCase()}`);

const mobileField = z
  .string()
  .max(20)
  .refine(
    (value) => /^[6-9]\d{9}$/.test(normalizeMobile(value)),
    'Enter a valid 10-digit mobile number starting with 6-9',
  );

const requiredEmail = (label: string) =>
  z
    .string()
    .max(120)
    .refine((value) => EMAIL_RE.test(value.trim()), `Enter a valid ${label}`);

const optionalEmail = z
  .string()
  .max(120)
  .refine(
    (value) => !value.trim() || EMAIL_RE.test(value.trim()),
    'Enter a valid email address',
  );

const pincodeField = z
  .string()
  .max(10)
  .refine(
    (value) => PIN_RE.test(value.replace(/\s/g, '')),
    'Enter a valid 6-digit pincode',
  );

const permanentAddressSchema = z.object({
  line: z
    .string()
    .max(200)
    .refine((value) => value.trim().length >= 5, 'Enter the full address'),
  state: z
    .string()
    .max(80)
    .refine((value) => INDIA_STATE_SET.has(value), 'Select a state'),
  city: z
    .string()
    .max(80)
    .refine((value) => value.trim().length >= 2, 'Select a city'),
  pincode: pincodeField,
});

const presentAddressSchema = z.object({
  line: z.string().max(200),
  state: z.string().max(80),
  city: z.string().max(80),
  pincode: z.string().max(10),
});

export const employeeSchema = z
  .object({
    employeeCode: z
      .string()
      .max(30)
      .refine(
        (value) => !value.trim() || CODE_RE.test(value.trim()),
        'Use letters, numbers, dots, dashes, underscores or slashes',
      ),
    organization: z.enum(ORGANIZATIONS, 'Select an organization'),
    fullName: requiredName('employee name'),
    dateOfBirth: z
      .string()
      .refine(isValidDateOnly, 'Enter a valid date of birth')
      .refine(
        (value) => isValidDateOnly(value) && value <= todayIso(),
        'Date of birth cannot be in the future',
      )
      .refine(
        (value) => isValidDateOnly(value) && ageOnDate(value) >= 18,
        'Employee must be at least 18 years old',
      )
      .refine(
        (value) => isValidDateOnly(value) && ageOnDate(value) <= 100,
        'Enter a valid date of birth',
      ),
    gender: z.enum(GENDERS, 'Select a gender'),
    nationality: z
      .string()
      .max(56)
      .refine(
        (value) => /^[\p{L}\s.-]{2,56}$/u.test(value.trim()),
        'Enter a nationality',
      ),
    maritalStatus: z.enum(MARITAL_STATUSES, 'Select a marital status'),
    bloodGroup: z.enum(BLOOD_GROUPS, 'Select a blood group'),
    nominee: requiredName('nominee name'),
    aadhaarNumber: z
      .string()
      .max(20)
      .refine(
        (value) => /^\d{12}$/.test(value.replace(/\s/g, '')),
        'Enter a valid 12-digit Aadhaar number',
      ),
    panNumber: z
      .string()
      .max(10)
      .refine(
        (value) => PAN_RE.test(value.trim().toUpperCase()),
        'Enter a valid PAN (for example ABCDE1234F)',
      ),
    passportNumber: z
      .string()
      .max(12)
      .refine(
        (value) =>
          !value.trim() || PASSPORT_RE.test(value.trim().toUpperCase()),
        'Enter a valid passport number',
      ),
    department: z.enum(DEPARTMENTS, 'Select a department'),
    joiningDate: z
      .string()
      .max(10)
      .refine(
        (value) => !value || isValidDateOnly(value),
        'Enter a valid joining date',
      ),
    permanentAddress: permanentAddressSchema,
    officeMobile: mobileField,
    officeEmail: optionalEmail,
    presentSameAsPermanent: z.boolean(),
    presentAddress: presentAddressSchema,
    personalMobile: mobileField,
    personalEmail: requiredEmail('personal email address'),
    emergencyContact: z.object({
      name: requiredName('emergency contact name'),
      relation: z
        .string()
        .max(50)
        .refine(
          (value) => /^[\p{L}\s./-]{2,50}$/u.test(value.trim()),
          'Enter the relation',
        ),
      mobile: mobileField,
    }),
  })
  .superRefine((data, ctx) => {
    if (
      data.joiningDate &&
      isValidDateOnly(data.dateOfBirth) &&
      isValidDateOnly(data.joiningDate) &&
      data.joiningDate < data.dateOfBirth
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['joiningDate'],
        message: 'Joining date cannot be before the date of birth',
      });
    }

    if (
      data.permanentAddress.state &&
      data.permanentAddress.city &&
      !isValidCityForState(
        data.permanentAddress.state,
        data.permanentAddress.city,
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['permanentAddress', 'city'],
        message: 'Select a city in the selected state',
      });
    }

    if (data.presentSameAsPermanent) return;

    if (data.presentAddress.line.trim().length < 5) {
      ctx.addIssue({
        code: 'custom',
        path: ['presentAddress', 'line'],
        message: 'Enter the full present address',
      });
    }
    if (!INDIA_STATE_SET.has(data.presentAddress.state)) {
      ctx.addIssue({
        code: 'custom',
        path: ['presentAddress', 'state'],
        message: 'Select a state',
      });
    }
    if (data.presentAddress.city.trim().length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['presentAddress', 'city'],
        message: 'Select a city',
      });
    } else if (
      INDIA_STATE_SET.has(data.presentAddress.state) &&
      !isValidCityForState(
        data.presentAddress.state,
        data.presentAddress.city,
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['presentAddress', 'city'],
        message: 'Select a city in the selected state',
      });
    }
    if (!PIN_RE.test(data.presentAddress.pincode.replace(/\s/g, ''))) {
      ctx.addIssue({
        code: 'custom',
        path: ['presentAddress', 'pincode'],
        message: 'Enter a valid 6-digit pincode',
      });
    }
  });

export type EmployeeInput = z.infer<typeof employeeSchema>;

export const duplicateCheckSchema = z
  .object({
    employeeCode: z.string().max(30).optional(),
    personalEmail: z.string().max(120).optional(),
    personalMobile: z.string().max(20).optional(),
    officeMobile: z.string().max(20).optional(),
  })
  .strict();

export type DuplicateCheckInput = z.infer<typeof duplicateCheckSchema>;
