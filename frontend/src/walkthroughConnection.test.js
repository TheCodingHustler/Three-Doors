import { test } from "node:test";
import assert from "node:assert/strict";
import { connectFrame, connectionError } from "./walkthroughConnection.js";

test("only connects once when effects request the same loaded iframe", async () => {
  const frame = {};
  let count = 0;
  const sdk = {};
  const api = { connect: async (target) => { assert.equal(target, frame); count++; return sdk; } };
  const [first, second] = await Promise.all([connectFrame(api, frame, "key"), connectFrame(api, frame, "key")]);
  assert.equal(count, 1);
  assert.equal(first, sdk); assert.equal(second, sdk);
});

test("new iframe gets a fresh connection and a rejected connection can retry", async () => {
  let calls = 0;
  const api = { connect: async () => { if (++calls === 1) throw new Error("temporary failure"); return {}; } };
  const frame = {};
  await assert.rejects(connectFrame(api, frame, "key"));
  await connectFrame(api, frame, "key");
  await connectFrame(api, {}, "key");
  assert.equal(calls, 3);
});

test("displays vendor failure and origin without exposing the SDK key or URLs", () => {
  const message = connectionError(new Error("Invalid domain for secret-key https://vendor.test/?applicationKey=secret-key"), "secret-key", "http://localhost:5175");
  assert.match(message, /Invalid domain/);
  assert.match(message, /localhost:5175/);
  assert.ok(!message.includes("secret-key"));
  assert.ok(!message.includes("vendor.test"));
});
