import { describe, expect, it } from "vitest";
import {
  buildIdentifiers,
  identifierFor,
  normalizeCode,
  normalizeEmail,
  normalizeMobile
} from '#shared';
describe("identifier normalization", () => {
  it("normalizes employee codes and emails", () => {
    expect(normalizeCode("  bpi-007 ")).toBe("BPI-007");
    expect(normalizeEmail("  Test.User@Example.COM ")).toBe(
      "test.user@example.com"
    );
  });
  it("strips Indian country codes and separators from mobiles", () => {
    expect(normalizeMobile("+91 98765 43210")).toBe("9876543210");
    expect(normalizeMobile("098765 43210")).toBe("9876543210");
    expect(normalizeMobile("9876543210")).toBe("9876543210");
  });
  it("builds code, personal email, and mobile identifiers", () => {
    const identifiers = buildIdentifiers({
      employeeCode: " bpi-007 ",
      personalEmail: "Test@Example.com",
      personalMobile: "+91 98765 43210",
      officeMobile: "91234 56789"
    });
    expect(identifiers).toEqual([
      "code:BPI-007",
      "email:test@example.com",
      "mobile:9876543210",
      "mobile:9123456789"
    ]);
  });
  it("does not include the office email in identifiers", () => {
    const identifiers = buildIdentifiers({
      employeeCode: "BPI-007",
      personalEmail: "personal@example.com",
      personalMobile: "9876543210",
      officeMobile: "9123456789"
    });
    expect(identifiers.some((value) => value.includes("office"))).toBe(false);
  });
  it("returns null for empty values", () => {
    expect(identifierFor("employeeCode", "")).toBeNull();
    expect(identifierFor("personalEmail", "   ")).toBeNull();
    expect(identifierFor("personalMobile", "")).toBeNull();
  });
});
