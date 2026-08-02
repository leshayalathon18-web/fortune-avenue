import assert from "node:assert/strict";
import test from "node:test";
import { isShakeImpulse } from "../lib/shake-roll";

test("ignores ordinary phone movement", () => {
  assert.equal(
    isShakeImpulse(
      { x: 0, y: 0, z: 9.8 },
      { x: 1.1, y: -0.8, z: 9.2 },
      { alpha: 8, beta: 5, gamma: 11 },
    ),
    false,
  );
});

test("recognizes a sharp acceleration shake", () => {
  assert.equal(
    isShakeImpulse(
      { x: -2, y: 1, z: 8 },
      { x: 8, y: -7, z: 13 },
      { alpha: 4, beta: 8, gamma: 5 },
    ),
    true,
  );
});

test("recognizes a strong rotational shake", () => {
  assert.equal(
    isShakeImpulse(
      { x: 0, y: 0, z: 9.8 },
      { x: 0.3, y: -0.2, z: 9.7 },
      { alpha: 90, beta: 80, gamma: 70 },
    ),
    true,
  );
});
