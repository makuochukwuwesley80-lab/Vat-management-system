import { describe, it, expect } from "vitest";
import {
  validateScore,
  totalScore,
  attendanceRate,
  nextClass,
  buildRegistrationNumber,
  validatePdrIdentifier,
  phoneToEmail,
} from "@/lib/logic";

describe("score validation (business rules)", () => {
  it("accepts scores within component maxima", () => {
    expect(validateScore("first_ca", 20)).toBeNull();
    expect(validateScore("second_ca", 0)).toBeNull();
    expect(validateScore("exam", 60)).toBeNull();
  });
  it("rejects scores above component maxima (CA 20, exam 60)", () => {
    expect(validateScore("first_ca", 21)).toMatch(/cannot exceed 20/);
    expect(validateScore("second_ca", 25)).toMatch(/cannot exceed 20/);
    expect(validateScore("exam", 61)).toMatch(/cannot exceed 60/);
  });
  it("rejects negative and non-numeric input", () => {
    expect(validateScore("exam", -1)).toMatch(/negative/);
    expect(validateScore("exam", NaN)).toMatch(/number/);
  });
  it("totals the 20/20/60 components", () => {
    expect(totalScore(15, 18, 55)).toBe(88);
  });
});

describe("attendance rate", () => {
  it("computes percentage correctly", () => {
    expect(attendanceRate(9, 10)).toBe(90);
    expect(attendanceRate(0, 10)).toBe(0);
  });
  it("never divides by zero", () => {
    expect(attendanceRate(0, 0)).toBe(0);
  });
});

describe("annual promotion rules", () => {
  it("promotes each class to the next level", () => {
    expect(nextClass(1)).toBe(2); // JS1 -> JS2
    expect(nextClass(3)).toBe(4); // JS3 -> SS1
    expect(nextClass(5)).toBe(6); // SS2 -> SS3
  });
  it("moves SS3 graduates to the alumni directory, never another class", () => {
    expect(nextClass(6)).toBe("ALUMNI");
  });
  it("rejects invalid levels", () => {
    expect(() => nextClass(0)).toThrow();
    expect(() => nextClass(7)).toThrow();
  });
});

describe("registration number format (configurable)", () => {
  it("substitutes placeholders without hardcoding a format", () => {
    expect(buildRegistrationNumber("VAT/{year}/{serial}", { year: 2026, serial: 42 })).toBe("VAT/2026/0042");
    expect(
      buildRegistrationNumber("VAT/{year}/{pdr}/{gdc}/{serial}", { year: 2027, pdr: "A", gdc: "G3", serial: 7 })
    ).toBe("VAT/2027/A/G3/0007");
  });
});

describe("PDR identifier rules", () => {
  it("male groups use a single letter", () => {
    expect(validatePdrIdentifier("A", "male")).toBeNull();
    expect(validatePdrIdentifier("AA", "male")).toMatch(/single capital letter/);
  });
  it("female groups use double letters", () => {
    expect(validatePdrIdentifier("AB", "female")).toBeNull();
    expect(validatePdrIdentifier("A", "female")).toMatch(/two capital letters/);
  });
});

describe("credential provisioning", () => {
  it("derives a deterministic sign-in email from the phone number", () => {
    expect(phoneToEmail("+234-803 123 4567")).toBe("2348031234567@vat.accounts");
  });
});
