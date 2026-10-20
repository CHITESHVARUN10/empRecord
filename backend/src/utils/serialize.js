function serializeAdmin(admin) {
  return {
    id: String(admin._id),
    username: admin.username,
    displayName: admin.displayName,
    lastLoginAt: admin.lastLoginAt ?? null
  };
}
function maskAadhaar(value) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 12) return "\u2014";
  return `XXXX XXXX ${digits.slice(-4)}`;
}
function maskPan(value) {
  const normalized = value.trim().toUpperCase();
  if (normalized.length !== 10) return "\u2014";
  return `${normalized.slice(0, 2)}\u2022\u2022\u2022\u2022\u2022\u2022${normalized.slice(-2)}`;
}
function serializeAttachment(attachment, employeeId, kind) {
  if (!attachment?.pathname) return null;
  return {
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    uploadedAt: attachment.uploadedAt,
    viewUrl: `/api/admin/employees/${employeeId}/attachments/${kind}`
  };
}
function serializeEmployeeSummary(employee) {
  const id = String(employee._id);
  return {
    id,
    employeeCode: employee.employeeCode,
    organization: employee.organization ?? "",
    fullName: employee.fullName,
    department: employee.department,
    joiningDate: employee.joiningDate,
    personalMobile: employee.personalMobile,
    personalEmail: employee.personalEmail,
    officeMobile: employee.officeMobile,
    officeEmail: employee.officeEmail ?? "",
    aadhaarMasked: maskAadhaar(employee.aadhaarNumber),
    panMasked: maskPan(employee.panNumber),
    documents: {
      aadhaar: Boolean(employee.attachments?.aadhaar?.pathname),
      pan: Boolean(employee.attachments?.pan?.pathname),
      passport: Boolean(employee.attachments?.passport?.pathname)
    },
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt
  };
}
function serializeEmployeeDetail(employee) {
  const id = String(employee._id);
  return {
    id,
    employeeCode: employee.employeeCode,
    organization: employee.organization ?? "",
    fullName: employee.fullName,
    dateOfBirth: employee.dateOfBirth,
    gender: employee.gender,
    nationality: employee.nationality,
    maritalStatus: employee.maritalStatus,
    bloodGroup: employee.bloodGroup,
    nominee: employee.nominee,
    aadhaarNumber: employee.aadhaarNumber,
    panNumber: employee.panNumber,
    passportNumber: employee.passportNumber ?? "",
    department: employee.department,
    joiningDate: employee.joiningDate,
    permanentAddress: employee.permanentAddress,
    officeMobile: employee.officeMobile,
    officeEmail: employee.officeEmail ?? "",
    presentSameAsPermanent: employee.presentSameAsPermanent,
    presentAddress: employee.presentAddress,
    personalMobile: employee.personalMobile,
    personalEmail: employee.personalEmail,
    emergencyContact: employee.emergencyContact,
    attachments: {
      aadhaar: serializeAttachment(employee.attachments?.aadhaar, id, "aadhaar"),
      pan: serializeAttachment(employee.attachments?.pan, id, "pan"),
      passport: serializeAttachment(
        employee.attachments?.passport,
        id,
        "passport"
      )
    },
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt
  };
}
export {
  maskAadhaar,
  maskPan,
  serializeAdmin,
  serializeEmployeeDetail,
  serializeEmployeeSummary
};
