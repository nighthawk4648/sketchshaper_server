import test from "node:test";
import assert from "node:assert/strict";
import { fractionDigits, isCurrency, toMinorUnits } from "./money.mjs";

test("knows real currency codes only", () => {
  for (const code of ["USD", "GBP", "EUR", "BDT", "JPY", "BHD"]) assert.equal(isCurrency(code), true, code);
  for (const code of ["usd", "XYZ", "", "US", null]) assert.equal(isCurrency(code), false, String(code));
});

test("uses each currency's own decimals", () => {
  assert.equal(fractionDigits("USD"), 2);
  assert.equal(fractionDigits("JPY"), 0);
  assert.equal(fractionDigits("BHD"), 3);
});

test("turns typed amounts into exact minor units", () => {
  assert.equal(toMinorUnits("10", "USD"), 1000);
  assert.equal(toMinorUnits("10.5", "USD"), 1050);
  assert.equal(toMinorUnits("1,250.50", "BDT"), 125050);
  assert.equal(toMinorUnits(" 1 250 ", "GBP"), 125000);
  assert.equal(toMinorUnits("0.10", "EUR"), 10);
  assert.equal(toMinorUnits("500", "JPY"), 500);
  assert.equal(toMinorUnits("1.234", "BHD"), 1234);
  assert.equal(toMinorUnits(19.99, "USD"), 1999, "a number works too, without float error");
});

test("refuses amounts that would be wrong or ambiguous, with a clear message", () => {
  assert.throws(() => toMinorUnits("10.555", "USD"), /at most 2 decimals/);
  assert.throws(() => toMinorUnits("10.5", "JPY"), /no decimals/);
  assert.throws(() => toMinorUnits("0", "USD"), /more than 0/);
  assert.throws(() => toMinorUnits("0.00", "USD"), /more than 0/);
  assert.throws(() => toMinorUnits("-5", "USD"), /as a number/);
  assert.throws(() => toMinorUnits("abc", "USD"), /as a number/);
  assert.throws(() => toMinorUnits("", "USD"), /as a number/);
  assert.throws(() => toMinorUnits("1e5", "USD"), /as a number/);
  assert.throws(() => toMinorUnits("10.", "USD"), /as a number/);
  assert.throws(() => toMinorUnits("99999999999999", "USD"), /too large/);
  assert.throws(() => toMinorUnits("20000000.01", "USD"), /too large/);
});
