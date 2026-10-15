import { expect, it } from "vitest";
import { ConsentGate } from "../src/core/consent";
it("requires both explicit permission and an enabled mode for capture", () => {
  const gate = new ConsentGate();
  expect(() => gate.assertCapture()).toThrow("consent");
  expect(() => gate.setMode(true)).toThrow("consent");
  gate.grant();
  expect(() => gate.assertCapture()).toThrow("consent");
  gate.setMode(true);
  expect(() => gate.assertCapture()).not.toThrow();
  gate.setMode(false);
  expect(() => gate.assertCapture()).toThrow("consent");
});
it("revoking consent turns mode off and new sessions do not inherit consent", () => {
  const gate = new ConsentGate();
  gate.grant();
  gate.setMode(true);
  gate.revoke();
  expect(gate.enabled).toBe(false);
  expect(() => gate.assertCapture()).toThrow("consent");
  expect(new ConsentGate().granted).toBe(false);
});
