import test from "node:test";
import assert from "node:assert/strict";
import { revalidateFrontend } from "./revalidate.mjs";

process.env.REVALIDATION_SECRET = "test-secret";
process.env.FRONTEND_REVALIDATE_URL = "http://frontend.test/api/revalidate";
const noWait = { retryDelays: [0, 0] };

// Runs revalidateFrontend with scripted fetch answers (Error = network failure)
async function run(answers) {
  const realFetch = globalThis.fetch;
  const realError = console.error;
  const calls = [];
  const errors = [];
  globalThis.fetch = async (url, init) => {
    calls.push(init);
    const next = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (next instanceof Error) throw next;
    return new Response("{}", { status: next });
  };
  console.error = (...a) => errors.push(a.join(" "));
  try {
    await revalidateFrontend(["assets", "assets", null, "asset-1"], [], noWait);
    return { calls, errors };
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
  }
}

test("sends deduplicated tags with the secret", async () => {
  const { calls, errors } = await run([200]);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].body).tags, ["assets", "asset-1"]);
  assert.equal(calls[0].headers["x-revalidate-secret"], "test-secret");
  assert.equal(errors.length, 0);
});

test("retries network failures and succeeds", async () => {
  const { calls, errors } = await run([new Error("down"), new Error("down"), 200]);
  assert.equal(calls.length, 3);
  assert.equal(errors.length, 0);
});

test("gives up after 3 attempts on server errors and logs it", async () => {
  const { calls, errors } = await run([503]);
  assert.equal(calls.length, 3);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /FAILED/);
});

test("does not retry a wrong secret (401) but still logs it", async () => {
  const { calls, errors } = await run([401]);
  assert.equal(calls.length, 1);
  assert.equal(errors.length, 1);
});
