import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { buildEmployeeCsv } from "../src/services/csv.service.js";
import { validEmployee } from "./helpers.js";
function csvEmployee(overrides = {}) {
  const id = new Types.ObjectId();
  return {
    _id: id,
    ...validEmployee({ fullName: "=EVIL()" }),
    attachments: {
      aadhaar: {
        pathname: `${id}/aadhaar.pdf`,
        originalName: "aadhaar.pdf",
        mimeType: "application/pdf",
        size: 1234,
        uploadedAt: /* @__PURE__ */ new Date("2026-01-01T00:00:00Z")
      },
      pan: {
        pathname: `${id}/pan.jpg`,
        originalName: "pan.jpg",
        mimeType: "image/jpeg",
        size: 4321,
        uploadedAt: /* @__PURE__ */ new Date("2026-01-01T00:00:00Z")
      }
    },
    identifiers: [],
    createdAt: /* @__PURE__ */ new Date("2026-01-01T10:00:00Z"),
    updatedAt: /* @__PURE__ */ new Date("2026-01-02T10:00:00Z"),
    ...overrides
  };
}
describe("CSV export", () => {
  it("exports Excel-friendly headers, dates, links, and escaped values", () => {
    const employee = csvEmployee();
    const csv = buildEmployeeCsv([employee], "http://localhost:5050");
    const id = String(employee._id);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Employee Code");
    expect(csv).toContain("Organization");
    expect(csv).toContain("BPIN PRIVATE LIMITED");
    expect(csv).toContain("Aadhaar Attachment");
    expect(csv).toContain("'=EVIL()");
    expect(csv).toContain("01-01-1990");
    expect(csv).toContain("01-01-2020");
    expect(csv).toContain(
      `http://localhost:5050/api/admin/employees/${id}/attachments/aadhaar`
    );
    expect(csv).toContain(
      `http://localhost:5050/api/admin/employees/${id}/attachments/pan`
    );
    expect(csv).toContain("01-01-2026 15:30 IST");
  });
  it("uses Google Drive links and the employee Drive folder when available", () => {
    const employee = csvEmployee();
    const id = String(employee._id);
    employee.driveFolderWebViewLink = "https://drive.google.com/drive/folders/employee-folder";
    employee.attachments.aadhaar.driveWebViewLink = "https://drive.google.com/file/d/aadhaar/view";
    employee.attachments.pan.driveWebViewLink = "https://drive.google.com/file/d/pan/view";
    const csv = buildEmployeeCsv([employee], "http://localhost:5050");
    expect(csv).toContain("Google Drive Folder");
    expect(csv).toContain(
      "https://drive.google.com/drive/folders/employee-folder"
    );
    expect(csv).toContain(
      "https://drive.google.com/file/d/aadhaar/view"
    );
    expect(csv).toContain("https://drive.google.com/file/d/pan/view");
    expect(csv).not.toContain(
      `http://localhost:5050/api/admin/employees/${id}/attachments/aadhaar`
    );
  });
  it("leaves the joining date blank when it is not provided", () => {
    const csv = buildEmployeeCsv(
      [csvEmployee({ joiningDate: "" })],
      "http://localhost:5050"
    );
    expect(csv).toContain("Sales,,1 Test Lane");
  });
  it("writes a header when there are no records", () => {
    const csv = buildEmployeeCsv([], "http://localhost:5050");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Employee Code");
    expect(csv.trim().split("\n")).toHaveLength(1);
  });
});
