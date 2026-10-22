import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import {
  buildEmployeeCsv,
  buildEmployeeDetailsCsv
} from "../src/services/csv.service.js";
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
      },
      offerLetter: {
        pathname: `${id}/offerLetter.pdf`,
        originalName: "offer-letter.pdf",
        mimeType: "application/pdf",
        size: 777,
        uploadedAt: /* @__PURE__ */ new Date("2026-01-01T00:00:00Z")
      },
      appointmentLetter: {
        pathname: `${id}/appointmentLetter.pdf`,
        originalName: "appointment-letter.pdf",
        mimeType: "application/pdf",
        size: 888,
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
    expect(csv).toContain("Name As Per Aadhaar");
    expect(csv).toContain("Aadhaar No (File)");
    expect(csv).toContain("PAN No (File)");
    expect(csv).toContain("Verification Status");
    expect(csv).toContain("Designation");
    expect(csv).toContain("IRA");
    expect(csv).toContain("Bank Name");
    expect(csv).toContain("Account No");
    expect(csv).toContain("IFSC Code");
    expect(csv).toContain("UAN No");
    expect(csv).toContain("Receiver Code As Per Bank");
    expect(csv).toContain("Offer Letter Attachment");
    expect(csv).toContain("Appointment Letter Attachment");
    expect(csv).toContain("'=EVIL()");
    expect(csv).toContain("01-01-1990");
    expect(csv).toContain("01-01-2020");
    expect(csv).toContain(
      `http://localhost:5050/api/public/employees/${id}/attachments/aadhaar`
    );
    expect(csv).toContain(
      `http://localhost:5050/api/public/employees/${id}/attachments/pan`
    );
    expect(csv).toContain(
      `http://localhost:5050/api/public/employees/${id}/attachments/offerLetter`
    );
    expect(csv).toContain(
      `http://localhost:5050/api/public/employees/${id}/attachments/appointmentLetter`
    );
    expect(csv).toContain("01-01-2026 15:30 IST");
  });
  it("uses public website links and never Google Drive links", () => {
    const employee = csvEmployee();
    const id = String(employee._id);
    employee.driveFolderWebViewLink = "https://drive.google.com/drive/folders/employee-folder";
    employee.attachments.aadhaar.driveWebViewLink = "https://drive.google.com/file/d/aadhaar/view";
    employee.attachments.pan.driveWebViewLink = "https://drive.google.com/file/d/pan/view";
    const csv = buildEmployeeCsv([employee], "http://localhost:5050");
    expect(csv).toContain(
      `http://localhost:5050/api/public/employees/${id}/attachments/aadhaar`
    );
    expect(csv).toContain(
      `http://localhost:5050/api/public/employees/${id}/attachments/pan`
    );
    expect(csv).not.toContain("Google Drive Folder");
    expect(csv).not.toContain("drive.google.com");
  });
  it("exports OCR values and human-readable verification statuses", () => {
    const employee = csvEmployee({
      nameAsPerAadhaar: "Test Aadhaar Name",
      aadhaarNumberFromFile: "123456789012",
      panNumberFromFile: "ABCDE1234F",
      aadhaarVerificationStatus: "verified",
      panVerificationStatus: "review",
      verificationStatus: "review",
      verificationNotes: "PAN needs admin review"
    });
    const csv = buildEmployeeCsv([employee], "http://localhost:5050");
    expect(csv).toContain("Test Aadhaar Name");
    expect(csv).toContain("123456789012");
    expect(csv).toContain("ABCDE1234F");
    expect(csv).toContain("Verified,Review,Review required");
    expect(csv).toContain("PAN needs admin review");
  });
  it("leaves optional employment fields blank when not provided", () => {
    const csv = buildEmployeeCsv(
      [csvEmployee({ joiningDate: "" })],
      "http://localhost:5050"
    );
    const [headerLine, valueLine] = csv.trim().split("\n");
    const headers = headerLine.replace(/^\uFEFF/, "").split(",");
    const values = valueLine.split(",");
    for (const header of [
      "Joining Date",
      "Designation",
      "IRA",
      "Bank Name",
      "Account No",
      "IFSC Code",
      "UAN No",
      "Receiver Code As Per Bank",
    ]) {
      expect(values[headers.indexOf(header)]).toBe("");
    }
  });
  it("exports employment and bank details", () => {
    const employee = csvEmployee({
      designation: "Service Engineer",
      ira: "Ramesh Kasaveni",
      bankName: "State Bank of India",
      accountNo: "123456789012",
      ifscCode: "SBIN0001234",
      uanNo: "123456789012",
      receiverCode: "RC-001",
    });
    const csv = buildEmployeeCsv([employee], "http://localhost:5050");
    expect(csv).toContain("Service Engineer");
    expect(csv).toContain("Ramesh Kasaveni");
    expect(csv).toContain("State Bank of India");
    expect(csv).toContain("123456789012");
    expect(csv).toContain("SBIN0001234");
    expect(csv).toContain("RC-001");
  });
  it("writes a header when there are no records", () => {
    const csv = buildEmployeeCsv([], "http://localhost:5050");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Employee Code");
    expect(csv.trim().split("\n")).toHaveLength(1);
  });
  it("builds a complete per-employee details file with public links", () => {
    const employee = csvEmployee();
    employee.driveFolderWebViewLink =
      "https://drive.google.com/drive/folders/employee-folder";
    employee.attachments.aadhaar.driveWebViewLink =
      "https://drive.google.com/file/d/aadhaar/view";
    employee.attachments.pan.driveWebViewLink =
      "https://drive.google.com/file/d/pan/view";
    const id = String(employee._id);
    const csv = buildEmployeeDetailsCsv(
      employee,
      "http://localhost:5050"
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Field,Value");
    expect(csv).toContain("Employee ID");
    expect(csv).toContain("Employee Code");
    expect(csv).toContain("BPIN PRIVATE LIMITED");
    expect(csv).toContain("Aadhaar Attachment");
    expect(csv).toContain(
      `http://localhost:5050/api/public/employees/${id}/attachments/aadhaar`
    );
    expect(csv).toContain("Aadhaar Original File Name");
    expect(csv).toContain("aadhaar.pdf");
    expect(csv).toContain("PAN MIME Type");
    expect(csv).toContain("Offer Letter Original File Name");
    expect(csv).toContain("offer-letter.pdf");
    expect(csv).toContain("Appointment Letter Original File Name");
    expect(csv).toContain("appointment-letter.pdf");
    expect(csv).toContain("Emergency Contact Mobile");
    expect(csv).not.toContain("Google Drive Folder");
    expect(csv).not.toContain("drive.google.com");
  });
});
