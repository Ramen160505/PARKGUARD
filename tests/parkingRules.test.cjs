const test = require("node:test");
const assert = require("node:assert/strict");
const { getParkingVerdict, getRemainingMs } = require("../src/parkingRules.cjs");

test("asks for a sign photo when none exists", () => {
  const result = getParkingVerdict(false);
  assert.equal(result.verdict, "unknown");
  assert.match(result.title, /фото/i);
});

test("does not claim parking is permitted after a photo", () => {
  const result = getParkingVerdict(true);
  assert.equal(result.verdict, "check");
  assert.match(result.explanation, /розпізнавання|перевірте/i);
  assert.notEqual(result.verdict, "permitted");
});

test("remaining time is positive before expiry", () => {
  assert.equal(getRemainingMs(2000, 1000), 1000);
});

test("remaining time is zero at the expiry moment", () => {
  assert.equal(getRemainingMs(1000, 1000), 0);
});

test("remaining time never goes below zero", () => {
  assert.equal(getRemainingMs(1000, 2000), 0);
});

test("a future expiry is preserved as a millisecond duration", () => {
  assert.equal(getRemainingMs(90_000, 30_000), 60_000);
});
