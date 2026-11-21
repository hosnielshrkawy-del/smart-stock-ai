import assert from "node:assert/strict";
import test from "node:test";
import { createUuid } from "./uuid.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("uses crypto.randomUUID when available", () => {
  const expected = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(createUuid({ randomUUID: () => expected, getRandomValues: (bytes) => bytes } as Crypto), expected);
});

test("falls back to getRandomValues and preserves UUID v4 bits", () => {
  const provider = {
    getRandomValues<T extends ArrayBufferView>(bytes: T) {
      new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).fill(0);
      return bytes;
    },
  } as Crypto;
  assert.equal(createUuid(provider), "00000000-0000-4000-8000-000000000000");
});

test("still creates valid unique IDs when Web Crypto is unavailable", () => {
  const ids = Array.from({ length: 100 }, () => createUuid(null));
  assert.ok(ids.every((id) => uuidPattern.test(id)));
  assert.equal(new Set(ids).size, ids.length);
});
