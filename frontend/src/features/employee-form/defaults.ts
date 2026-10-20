import {
  BLOOD_GROUPS,
  DEFAULT_NATIONALITY,
  DEPARTMENTS,
  GENDERS,
  INDIA_STATES,
  MARITAL_STATUSES,
  ORGANIZATIONS,
  citiesForState,
  type AttachmentKind,
  type EmployeeInput,
} from '@bpi/shared';

export type FileMap = Partial<Record<AttachmentKind, File>>;

export const defaultEmployeeValues: EmployeeInput = {
  employeeCode: '',
  organization: '' as EmployeeInput['organization'],
  fullName: '',
  dateOfBirth: '',
  gender: '' as EmployeeInput['gender'],
  nationality: DEFAULT_NATIONALITY,
  maritalStatus: '' as EmployeeInput['maritalStatus'],
  bloodGroup: '' as EmployeeInput['bloodGroup'],
  nominee: '',
  aadhaarNumber: '',
  panNumber: '',
  passportNumber: '',
  department: '' as EmployeeInput['department'],
  joiningDate: '',
  permanentAddress: {
    line: '',
    state: '',
    city: '',
    pincode: '',
  },
  officeMobile: '',
  officeEmail: '',
  presentSameAsPermanent: true,
  presentAddress: {
    line: '',
    state: '',
    city: '',
    pincode: '',
  },
  personalMobile: '',
  personalEmail: '',
  emergencyContact: {
    name: '',
    relation: '',
    mobile: '',
  },
};

export const genderOptions = GENDERS.map((value) => ({
  value,
  label: value,
}));

export const maritalStatusOptions = MARITAL_STATUSES.map((value) => ({
  value,
  label: value,
}));

export const bloodGroupOptions = BLOOD_GROUPS.map((value) => ({
  value,
  label: value,
}));

export const organizationOptions = ORGANIZATIONS.map((value) => ({
  value,
  label: value,
}));

export const departmentOptions = DEPARTMENTS.map((value) => ({
  value,
  label: value,
}));

export const stateOptions = INDIA_STATES.map((value) => ({
  value,
  label: value,
}));

export function cityOptions(state: string) {
  return citiesForState(state).map((city) => ({
    value: city,
    label: city,
  }));
}
