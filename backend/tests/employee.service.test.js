import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
vi.mock("../src/services/storage.service", () => ({
  storeAttachment: vi.fn(),
  removeAttachment: vi.fn(async () => true),
  openAttachment: vi.fn(async () => null),
  inspectAttachment: vi.fn(async () => null),
  generateClientUploadToken: vi.fn(async () => "token")
}));
import {
  createEmployee,
  findDuplicateConflicts,
  updateEmployee,
  updateEmployeeVerification
} from "../src/services/employee.service.js";
import { EmployeeModel } from "../src/models/Employee.js";
import { removeAttachment } from "../src/services/storage.service.js";
import { validEmployee } from "./helpers.js";
let mongod;
function attachmentMeta(employeeId, kind) {
  return {
    pathname: `${employeeId}/${kind}.${kind === "aadhaar" ? "pdf" : "jpg"}`,
    originalName: `${kind}.${kind === "aadhaar" ? "pdf" : "jpg"}`,
    mimeType: kind === "aadhaar" ? "application/pdf" : "image/jpeg",
    size: 20,
    uploadedAt: /* @__PURE__ */ new Date("2026-01-01T00:00:00Z")
  };
}
function attachments(employeeId) {
  return {
    aadhaar: attachmentMeta(employeeId, "aadhaar"),
    pan: attachmentMeta(employeeId, "pan")
  };
}
async function create(input = validEmployee(), employeeId = new Types.ObjectId()) {
  const result = await createEmployee({
    employeeId,
    input,
    attachments: attachments(String(employeeId))
  });
  return result.employee;
}
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await EmployeeModel.createIndexes();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await EmployeeModel.deleteMany({});
  vi.clearAllMocks();
});
describe("employee duplicate handling", () => {
  it("creates an employee with unique identifiers", async () => {
    const employee = await create();
    expect(employee.employeeCode).toBe("BPI-100");
    expect(employee.verificationStatus).toBe("pending");
    expect(employee.aadhaarVerificationStatus).toBe("pending");
    expect(employee.panVerificationStatus).toBe("pending");
    expect(await EmployeeModel.countDocuments({})).toBe(1);
  });
  it("returns the existing record for an idempotent employee id", async () => {
    const employeeId = new Types.ObjectId();
    const first = await create(validEmployee(), employeeId);
    const second = await create(validEmployee(), employeeId);
    expect(String(second._id)).toBe(String(first._id));
    expect(await EmployeeModel.countDocuments({})).toBe(1);
  });
  it("allows multiple employees without an employee code", async () => {
    const first = await create(validEmployee({ employeeCode: "" }));
    const second = await create(
      validEmployee({
        employeeCode: "",
        personalEmail: "second@example.com",
        personalMobile: "9876500011",
        officeMobile: "9876500012"
      })
    );
    expect(first.employeeCode).toBe("");
    expect(second.employeeCode).toBe("");
    expect(await EmployeeModel.countDocuments({})).toBe(2);
  });
  it("blocks a duplicate employee code in the same organization", async () => {
    await create();
    await expect(
      create(
        validEmployee({
          employeeCode: "BPI-100",
          personalEmail: "second@example.com",
          personalMobile: "9876500011",
          officeMobile: "9876500012"
        })
      )
    ).rejects.toMatchObject({
      status: 409,
      code: "DUPLICATE_ENTRY",
      conflicts: expect.arrayContaining([
        expect.objectContaining({ field: "employeeCode" })
      ])
    });
  });
  it("allows the same employee code in a different organization", async () => {
    const first = await create(
      validEmployee({ employeeCode: "E001" })
    );
    const second = await create(
      validEmployee({
        employeeCode: "E001",
        organization: "AUTO SONICS INDIA PRIVATE LIMITED",
        personalEmail: "second@example.com",
        personalMobile: "9876500011",
        officeMobile: "9876500012",
        officeEmail: "second.office@example.com"
      })
    );
    expect(first.employeeCode).toBe("E001");
    expect(second.employeeCode).toBe("E001");
    expect(second.organization).toBe(
      "AUTO SONICS INDIA PRIVATE LIMITED"
    );
    expect(
      await EmployeeModel.countDocuments({ employeeCode: "E001" })
    ).toBe(2);
  });
  it("blocks a duplicate personal email", async () => {
    await create();
    await expect(
      create(
        validEmployee({
          employeeCode: "BPI-101",
          personalMobile: "9876500011",
          officeMobile: "9876500012"
        })
      )
    ).rejects.toMatchObject({
      status: 409,
      conflicts: expect.arrayContaining([
        expect.objectContaining({ field: "personalEmail" })
      ])
    });
  });
  it("blocks an office mobile that matches another record personal mobile", async () => {
    await create();
    await expect(
      create(
        validEmployee({
          employeeCode: "BPI-102",
          personalEmail: "second@example.com",
          personalMobile: "9876500011",
          officeMobile: "9876500002"
        })
      )
    ).rejects.toMatchObject({
      status: 409,
      conflicts: expect.arrayContaining([
        expect.objectContaining({ field: "officeMobile" })
      ])
    });
  });
  it("allows office emails to repeat", async () => {
    await create();
    const second = await create(
      validEmployee({
        employeeCode: "BPI-103",
        personalEmail: "second@example.com",
        personalMobile: "9876500011",
        officeMobile: "9876500012",
        officeEmail: "office@example.com"
      })
    );
    expect(second.employeeCode).toBe("BPI-103");
  });
  it("excludes the current record from duplicate checks", async () => {
    const employee = await create();
    const conflicts = await findDuplicateConflicts(
      {
        employeeCode: employee.employeeCode,
        organization: employee.organization,
        personalEmail: employee.personalEmail,
        personalMobile: employee.personalMobile,
        officeMobile: employee.officeMobile
      },
      String(employee._id)
    );
    expect(conflicts).toEqual([]);
  });
  it("updates a record and removes the replaced attachment after save", async () => {
    const employee = await create();
    const oldPan = employee.attachments.pan;
    const replacement = {
      ...oldPan,
      pathname: `${employee._id}/pan-replacement.jpg`,
      originalName: "pan-replacement.jpg"
    };
    const updated = await updateEmployee({
      id: String(employee._id),
      input: validEmployee({ fullName: "Updated Employee" }),
      newAttachments: { pan: replacement },
      removePassport: false
    });
    expect(updated.fullName).toBe("Updated Employee");
    expect(updated.attachments.pan.pathname).toBe(replacement.pathname);
    expect(removeAttachment).toHaveBeenCalledWith(oldPan.pathname);
  });
  it("resets document verification when its file is replaced", async () => {
    const employee = await create();
    employee.nameAsPerAadhaar = "Test Aadhaar Name";
    employee.aadhaarNumberFromFile = employee.aadhaarNumber;
    employee.panNumberFromFile = employee.panNumber;
    employee.aadhaarVerificationStatus = "verified";
    employee.panVerificationStatus = "verified";
    employee.verificationStatus = "done";
    await employee.save();
    const oldPan = employee.attachments.pan;
    const updated = await updateEmployee({
      id: String(employee._id),
      input: validEmployee({ fullName: "Updated Employee" }),
      newAttachments: {
        pan: {
          ...oldPan,
          pathname: `${employee._id}/pan-replacement.jpg`,
          originalName: "pan-replacement.jpg"
        }
      },
      removePassport: false
    });
    expect(updated.panNumberFromFile).toBe("");
    expect(updated.panVerificationStatus).toBe("pending");
    expect(updated.aadhaarVerificationStatus).toBe("verified");
    expect(updated.verificationStatus).toBe("pending");
  });
  it("updates employment and bank details", async () => {
    const employee = await create();
    const updated = await updateEmployee({
      id: String(employee._id),
      input: validEmployee({
        designation: "Service Engineer",
        ira: "Free Text Manager",
        bankName: "State Bank of India",
        accountNo: "123456789012",
        ifscCode: "sbin0001234",
        uanNo: "123456789012",
        receiverCode: "RC-001"
      }),
      newAttachments: {},
      removePassport: false
    });
    expect(updated.designation).toBe("Service Engineer");
    expect(updated.ira).toBe("Free Text Manager");
    expect(updated.bankName).toBe("State Bank of India");
    expect(updated.accountNo).toBe("123456789012");
    expect(updated.ifscCode).toBe("SBIN0001234");
    expect(updated.uanNo).toBe("123456789012");
    expect(updated.receiverCode).toBe("RC-001");
    expect(updated.iraEmployeeId).toBeNull();
  });
  it("links IRA to another employee and falls back to free text", async () => {
    const ira = await create(
      validEmployee({
        employeeCode: "BPI-200",
        personalEmail: "ira@example.com",
        personalMobile: "9876500011",
        officeMobile: "9876500012"
      })
    );
    const employee = await create(
      validEmployee({
        employeeCode: "BPI-201",
        personalEmail: "employee@example.com",
        personalMobile: "9876500013",
        officeMobile: "9876500014"
      })
    );
    const linked = await updateEmployee({
      id: String(employee._id),
      input: validEmployee({
        employeeCode: "BPI-201",
        personalEmail: "employee@example.com",
        personalMobile: "9876500013",
        officeMobile: "9876500014",
        ira: "Typed override"
      }),
      newAttachments: {},
      removePassport: false,
      iraEmployeeId: String(ira._id)
    });
    expect(String(linked.iraEmployeeId)).toBe(String(ira._id));
    expect(linked.ira).toBe(ira.fullName);

    const freeText = await updateEmployee({
      id: String(employee._id),
      input: validEmployee({
        employeeCode: "BPI-201",
        personalEmail: "employee@example.com",
        personalMobile: "9876500013",
        officeMobile: "9876500014",
        ira: "Free Text Manager"
      }),
      newAttachments: {},
      removePassport: false,
      iraEmployeeId: null
    });
    expect(freeText.iraEmployeeId).toBeNull();
    expect(freeText.ira).toBe("Free Text Manager");
  });
  it("rejects an invalid or self IRA reference", async () => {
    const employee = await create();
    await expect(
      updateEmployee({
        id: String(employee._id),
        input: validEmployee(),
        newAttachments: {},
        removePassport: false,
        iraEmployeeId: String(employee._id)
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      updateEmployee({
        id: String(employee._id),
        input: validEmployee(),
        newAttachments: {},
        removePassport: false,
        iraEmployeeId: "not-an-object-id"
      })
    ).rejects.toMatchObject({ status: 400 });
  });
  it("adds the optional offer and appointment letters", async () => {
    const employee = await create();
    const employeeId = String(employee._id);
    const updated = await updateEmployee({
      id: employeeId,
      input: validEmployee({ fullName: "Updated Employee" }),
      newAttachments: {
        offerLetter: attachmentMeta(employeeId, "offerLetter"),
        appointmentLetter: attachmentMeta(
          employeeId,
          "appointmentLetter"
        )
      },
      removePassport: false
    });
    expect(updated.attachments.offerLetter.pathname).toBe(
      `${employeeId}/offerLetter.jpg`
    );
    expect(updated.attachments.appointmentLetter.pathname).toBe(
      `${employeeId}/appointmentLetter.jpg`
    );
  });
  it("marks both checks done after an admin review", async () => {
    const employee = await create();
    const updated = await updateEmployeeVerification({
      id: String(employee._id),
      aadhaarNumberFromFile: employee.aadhaarNumber,
      panNumberFromFile: employee.panNumber,
      markVerified: true,
      adminName: "Test Admin"
    });
    expect(updated.aadhaarVerificationStatus).toBe("verified");
    expect(updated.panVerificationStatus).toBe("verified");
    expect(updated.verificationStatus).toBe("done");
    expect(updated.verificationReviewedBy).toBe("Test Admin");
  });
  it("sets review when an OCR PAN does not match the entered PAN", async () => {
    const employee = await create();
    const updated = await updateEmployeeVerification({
      id: String(employee._id),
      aadhaarNumberFromFile: employee.aadhaarNumber,
      panNumberFromFile: "AAAAA1111A",
      markVerified: false,
      adminName: "Test Admin"
    });
    expect(updated.aadhaarVerificationStatus).toBe("verified");
    expect(updated.panVerificationStatus).toBe("review");
    expect(updated.verificationStatus).toBe("review");
  });
});
