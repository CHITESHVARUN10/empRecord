function validEmployee(overrides = {}) {
  return {
    employeeCode: "BPI-100",
    organization: "BPIN PRIVATE LIMITED",
    fullName: "Test Employee",
    dateOfBirth: "1990-01-01",
    gender: "Male",
    nationality: "Indian",
    maritalStatus: "Unmarried",
    bloodGroup: "O+",
    nominee: "Test Nominee",
    aadhaarNumber: "123456789012",
    panNumber: "ABCDE1234F",
    passportNumber: "",
    department: "Sales",
    joiningDate: "2020-01-01",
    permanentAddress: {
      line: "1 Test Lane",
      state: "Delhi",
      city: "New Delhi",
      pincode: "110001"
    },
    officeMobile: "9876500001",
    officeEmail: "office@example.com",
    presentSameAsPermanent: true,
    presentAddress: {
      line: "",
      state: "",
      city: "",
      pincode: ""
    },
    personalMobile: "9876500002",
    personalEmail: "test.employee@example.com",
    emergencyContact: {
      name: "Emergency Contact",
      relation: "Friend",
      mobile: "9876500003"
    },
    ...overrides
  };
}
export {
  validEmployee
};
