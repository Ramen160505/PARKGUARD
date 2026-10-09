const test=require("node:test");const assert=require("node:assert/strict");const {getParkingVerdict,getRemainingMs}=require("../src/parkingRules.cjs");
test("asks for photo when no sign photo exists",()=>assert.equal(getParkingVerdict(false).verdict,"unknown"));
test("does not claim parking is permitted after a photo",()=>assert.equal(getParkingVerdict(true).verdict,"check"));
test("remaining time is positive before expiry",()=>assert.equal(getRemainingMs(2000,1000),1000));
test("remaining time never goes below zero",()=>assert.equal(getRemainingMs(1000,2000),0));
