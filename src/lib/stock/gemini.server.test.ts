import assert from "node:assert/strict";
import test from "node:test";
import { callGemini } from "./gemini.server.ts";

const originalKey = process.env.GEMINI_API_KEY;
const originalModel = process.env.GEMINI_MODEL;
const originalFetch = globalThis.fetch;

function restoreEnvironment() {
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = originalModel;
  globalThis.fetch = originalFetch;
}

test("returns a clear configuration error without making a network request", async () => {
  delete process.env.GEMINI_API_KEY;
  let requested = false;
  globalThis.fetch = (async () => { requested = true; throw new Error("unexpected fetch"); }) as typeof fetch;
  try {
    assert.deepEqual(await callGemini({ system: "s", prompt: "p" }), { ok: false, error: "AI_NOT_CONFIGURED" });
    assert.equal(requested, false);
  } finally { restoreEnvironment(); }
});

test("sends the key only in the server request header and forwards bounded chat history", async () => {
  process.env.GEMINI_API_KEY = "unit-test-secret";
  process.env.GEMINI_MODEL = "gemini-3.8-flash";
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "  إجابة تجريبية  " }] } }] }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const result = await callGemini({
      system: "system prompt", prompt: "current question",
      history: [
        { role: "user", text: "سؤال سابق" },
        { role: "model", text: "رد سابق" },
      ],
    });
    assert.deepEqual(result, { ok: true, text: "إجابة تجريبية" });
    assert.match(capturedUrl, /models\/gemini-3\.8-flash:generateContent$/);
    assert.equal(capturedUrl.includes("unit-test-secret"), false);
    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.get("x-goog-api-key"), "unit-test-secret");
    const body = JSON.parse(String(capturedInit?.body)) as { contents: Array<{ role: string; parts: Array<{ text: string }> }> };
    assert.deepEqual(body.contents.map((item) => item.role), ["user", "model", "user"]);
    assert.equal(body.contents[2].parts[0].text, "current question");
  } finally { restoreEnvironment(); }
});

test("maps provider authentication, quota, and missing-model responses", async () => {
  process.env.GEMINI_API_KEY = "unit-test-secret";
  const cases: Array<[number, string]> = [
    [401, "AI_INVALID_KEY"],
    [403, "AI_INVALID_KEY"],
    [429, "AI_PROVIDER_RATE"],
    [404, "AI_MODEL"],
  ];
  for (const [status, expected] of cases) {
    globalThis.fetch = (async () => new Response("{}", { status })) as typeof fetch;
    assert.deepEqual(await callGemini({ system: "s", prompt: "p" }), { ok: false, error: expected });
  }
  restoreEnvironment();
});

test("rejects an invalid model value before making a request", async () => {
  process.env.GEMINI_API_KEY = "unit-test-secret";
  process.env.GEMINI_MODEL = "invalid/model?x=1";
  let requested = false;
  globalThis.fetch = (async () => { requested = true; return new Response("{}", { status: 200 }); }) as typeof fetch;
  try {
    assert.deepEqual(await callGemini({ system: "s", prompt: "p" }), { ok: false, error: "AI_MODEL" });
    assert.equal(requested, false);
  } finally { restoreEnvironment(); }
});
