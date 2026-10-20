import { describe, expect, it } from "vitest";
import { employeeSchema } from '#shared';
import { validEmployee } from "./helpers.js";
function issuePaths(input) {
  const result = employeeSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}
describe("employeeSchema", () => {
  it("accepts a complete valid employee", () => {
    expect(employeeSchema.safeParse(validEmployee()).success).toBe(true);
  });
  it("rejects a missing employee name", () => {
    const paths = issuePaths(validEmployee({ fullName: "" }));
    expect(paths).toContain("fullName");
  });
  it("requires present address values when the addresses differ", () => {
    const paths = issuePaths(
      validEmployee({
        presentSameAsPermanent: false,
        presentAddress: { line: "", state: "", city: "", pincode: "" }
      })
    );
    expect(paths).toContain("presentAddress.line");
    expect(paths).toContain("presentAddress.state");
    expect(paths).toContain("presentAddress.city");
    expect(paths).toContain("presentAddress.pincode");
  });
  it("ignores present address values when the addresses are the same", () => {
    expect(
      employeeSchema.safeParse(
        validEmployee({ presentSameAsPermanent: true })
      ).success
    ).toBe(true);
  });
  it("rejects invalid mobile, Aadhaar, PAN, and pincode values", () => {
    const paths = issuePaths(
      validEmployee({
        personalMobile: "12345",
        aadhaarNumber: "1234",
        panNumber: "ABCDE1234",
        permanentAddress: {
          line: "1 Test Lane",
          state: "Delhi",
          city: "New Delhi",
          pincode: "123"
        }
      })
    );
    expect(paths).toContain("personalMobile");
    expect(paths).toContain("aadhaarNumber");
    expect(paths).toContain("panNumber");
    expect(paths).toContain("permanentAddress.pincode");
  });
  it("rejects an employee younger than 18", () => {
    const date = /* @__PURE__ */ new Date();
    date.setUTCFullYear(date.getUTCFullYear() - 17);
    const dob = date.toISOString().slice(0, 10);
    expect(issuePaths(validEmployee({ dateOfBirth: dob }))).toContain(
      "dateOfBirth"
    );
  });
  it("allows the joining date to be omitted", () => {
    expect(
      employeeSchema.safeParse(validEmployee({ joiningDate: "" })).success
    ).toBe(true);
  });
  it("rejects a city outside the selected state", () => {
    const paths = issuePaths(
      validEmployee({
        permanentAddress: {
          line: "1 Test Lane",
          state: "Karnataka",
          city: "Mumbai",
          pincode: "560001"
        }
      })
    );
    expect(paths).toContain("permanentAddress.city");
  });
  it("rejects a present city outside the selected present state", () => {
    const paths = issuePaths(
      validEmployee({
        presentSameAsPermanent: false,
        presentAddress: {
          line: "2 Test Lane",
          state: "Karnataka",
          city: "Mumbai",
          pincode: "560001"
        }
      })
    );
    expect(paths).toContain("presentAddress.city");
  });
  it("rejects a joining date before the date of birth", () => {
    const paths = issuePaths(
      validEmployee({
        dateOfBirth: "1990-01-01",
        joiningDate: "1989-01-01"
      })
    );
    expect(paths).toContain("joiningDate");
  });
  it("accepts an empty optional office email and passport", () => {
    expect(
      employeeSchema.safeParse(
        validEmployee({ officeEmail: "", passportNumber: "" })
      ).success
    ).toBe(true);
  });
  it("allows the employee code to be omitted", () => {
    expect(
      employeeSchema.safeParse(validEmployee({ employeeCode: "" })).success
    ).toBe(true);
  });
  it("requires a valid organization", () => {
    expect(
      issuePaths(
        validEmployee({
          organization: "UNKNOWN"
        })
      )
    ).toContain("organization");
  });
  it("rejects invalid optional values when provided", () => {
    const paths = issuePaths(
      validEmployee({
        officeEmail: "not-an-email",
        passportNumber: "!"
      })
    );
    expect(paths).toContain("officeEmail");
    expect(paths).toContain("passportNumber");
  });
  it("rejects a code with spaces and an unknown state", () => {
    const paths = issuePaths(
      validEmployee({
        employeeCode: "BPI 100",
        permanentAddress: {
          line: "1 Test Lane",
          state: "Atlantis",
          city: "New Delhi",
          pincode: "110001"
        }
      })
    );
    expect(paths).toContain("employeeCode");
    expect(paths).toContain("permanentAddress.state");
  });
});
