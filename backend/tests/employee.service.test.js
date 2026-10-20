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
  updateEmployee
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
  it("blocks a duplicate employee code", async () => {
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
});
