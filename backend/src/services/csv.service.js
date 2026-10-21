import { stringify } from "csv-stringify/sync";
const columns = [
  { key: "employeeCode", header: "Employee Code" },
  { key: "organization", header: "Organization" },
  { key: "fullName", header: "Employee Name" },
  { key: "dateOfBirth", header: "Date Of Birth" },
  { key: "gender", header: "Gender" },
  { key: "nationality", header: "Nationality" },
  { key: "maritalStatus", header: "Marital Status" },
  { key: "bloodGroup", header: "Blood Group" },
  { key: "nominee", header: "Nominee" },
  { key: "aadhaarNumber", header: "Aadhaar No" },
  { key: "panNumber", header: "PAN No" },
  { key: "passportNumber", header: "Passport Number" },
  { key: "department", header: "Department" },
  { key: "joiningDate", header: "Joining Date" },
  { key: "permanentAddressLine", header: "Permanent Address" },
  { key: "permanentState", header: "Permanent State" },
  { key: "permanentCity", header: "Permanent City" },
  { key: "permanentPincode", header: "Permanent Pincode" },
  { key: "officeMobile", header: "Office Mobile No" },
  { key: "officeEmail", header: "Office Email Id" },
  { key: "presentSameAsPermanent", header: "Present Address Same As Permanent" },
  { key: "presentAddressLine", header: "Present Address" },
  { key: "presentState", header: "Present State" },
  { key: "presentCity", header: "Present City" },
  { key: "presentPincode", header: "Present Pincode" },
  { key: "personalMobile", header: "Personal Mobile No" },
  { key: "personalEmail", header: "Personal Email Id" },
  { key: "emergencyName", header: "Emergency Contact Name" },
  { key: "emergencyRelation", header: "Emergency Contact Relation" },
  { key: "emergencyMobile", header: "Emergency Contact Mobile" },
  { key: "aadhaarAttachment", header: "Aadhaar Attachment" },
  { key: "panAttachment", header: "PAN Attachment" },
  { key: "passportAttachment", header: "Passport Attachment" },
  { key: "submittedAt", header: "Submitted At" },
  { key: "updatedAt", header: "Last Updated At" }
];
function formatDateOnly(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}-${month}-${year}`;
}
function formatTimestamp(value) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(value);
  const find = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${find("day")}-${find("month")}-${find("year")} ${find("hour")}:${find("minute")} IST`;
}
function safeCell(value) {
  if (value === null || value === void 0) return "";
  let text = String(value);
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return text;
}
function attachmentUrl(baseUrl, employeeId, kind) {
  return `${baseUrl}/api/public/employees/${employeeId}/attachments/${kind}`;
}
function attachmentLink(employee, employeeId, baseUrl, kind) {
  const meta = employee.attachments?.[kind];
  if (!meta) return "";
  return safeCell(attachmentUrl(baseUrl, employeeId, kind));
}
function employeeCsvRow(employee, baseUrl) {
  const id = String(employee._id);
  return {
    employeeCode: safeCell(employee.employeeCode),
    organization: safeCell(employee.organization ?? ""),
    fullName: safeCell(employee.fullName),
    dateOfBirth: safeCell(formatDateOnly(employee.dateOfBirth)),
    gender: safeCell(employee.gender),
    nationality: safeCell(employee.nationality),
    maritalStatus: safeCell(employee.maritalStatus),
    bloodGroup: safeCell(employee.bloodGroup),
    nominee: safeCell(employee.nominee),
    aadhaarNumber: safeCell(employee.aadhaarNumber),
    panNumber: safeCell(employee.panNumber),
    passportNumber: safeCell(employee.passportNumber ?? ""),
    department: safeCell(employee.department),
    joiningDate: safeCell(formatDateOnly(employee.joiningDate)),
    permanentAddressLine: safeCell(employee.permanentAddress.line),
    permanentState: safeCell(employee.permanentAddress.state),
    permanentCity: safeCell(employee.permanentAddress.city),
    permanentPincode: safeCell(employee.permanentAddress.pincode),
    officeMobile: safeCell(employee.officeMobile),
    officeEmail: safeCell(employee.officeEmail ?? ""),
    presentSameAsPermanent: employee.presentSameAsPermanent ? "Yes" : "No",
    presentAddressLine: safeCell(employee.presentAddress.line),
    presentState: safeCell(employee.presentAddress.state),
    presentCity: safeCell(employee.presentAddress.city),
    presentPincode: safeCell(employee.presentAddress.pincode),
    personalMobile: safeCell(employee.personalMobile),
    personalEmail: safeCell(employee.personalEmail),
    emergencyName: safeCell(employee.emergencyContact.name),
    emergencyRelation: safeCell(employee.emergencyContact.relation),
    emergencyMobile: safeCell(employee.emergencyContact.mobile),
    aadhaarAttachment: attachmentLink(
      employee,
      id,
      baseUrl,
      "aadhaar"
    ),
    panAttachment: attachmentLink(employee, id, baseUrl, "pan"),
    passportAttachment: attachmentLink(
      employee,
      id,
      baseUrl,
      "passport"
    ),
    submittedAt: safeCell(formatTimestamp(employee.createdAt)),
    updatedAt: safeCell(formatTimestamp(employee.updatedAt))
  };
}
function buildEmployeeCsv(employees, baseUrl) {
  const rows = employees.map((employee) => employeeCsvRow(employee, baseUrl));
  return stringify(rows, {
    header: true,
    columns,
    bom: true
  });
}
const attachmentColumns = [
  ["aadhaar", "Aadhaar"],
  ["pan", "PAN"],
  ["passport", "Passport"]
];
function buildEmployeeDetailsCsv(employee, baseUrl) {
  const values = employeeCsvRow(employee, baseUrl);
  const rows = [
    { field: "Employee ID", value: String(employee._id) },
    ...columns.map((column) => ({
      field: column.header,
      value: values[column.key]
    }))
  ];
  for (const [kind, label] of attachmentColumns) {
    const meta = employee.attachments?.[kind];
    if (!meta) continue;
    rows.push(
      {
        field: `${label} Original File Name`,
        value: safeCell(meta.originalName)
      },
      { field: `${label} MIME Type`, value: safeCell(meta.mimeType) },
      { field: `${label} Size (bytes)`, value: safeCell(meta.size) },
      {
        field: `${label} Uploaded At`,
        value: safeCell(
          meta.uploadedAt ? formatTimestamp(meta.uploadedAt) : ""
        )
      }
    );
  }
  return stringify(rows, {
    header: true,
    columns: [
      { key: "field", header: "Field" },
      { key: "value", header: "Value" }
    ],
    bom: true
  });
}
export {
  buildEmployeeCsv,
  buildEmployeeDetailsCsv
};
