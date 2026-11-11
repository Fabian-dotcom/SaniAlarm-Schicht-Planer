import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeResponse,
  encodeResponse,
  normalizePerson,
  RESPONSE_PREFIX,
} from "../src/beitritt.js";

test("antwortcode ist UTF-8-sicher und mit dem Einladungsgeheimnis verschlüsselt", async () => {
  const person = normalizePerson({
    vorname: "Élodie",
    nachname: "Müller",
    klasse: "10b",
    telefon: "+49 123",
    email: "elodie@example.org",
  });
  const secret = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const code = await encodeResponse(person, secret);

  assert.ok(code.startsWith(RESPONSE_PREFIX));
  assert.notEqual(code.includes("Müller"), true);
  assert.deepEqual(await decodeResponse(code, secret), person);
});

test("mindestens ein Vorname wird verlangt", () => {
  assert.throws(() => normalizePerson({ vorname: "   " }), /Vorname/u);
});

test("unbekannte, manipulierte und falsch verschlüsselte Codes werden abgelehnt", async () => {
  const secret = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  await assert.rejects(decodeResponse("https://example.org", secret), /Ungültiger/u);
  await assert.rejects(decodeResponse(`${RESPONSE_PREFIX}%%%`, secret), /Ungültiger/u);
  const code = await encodeResponse(normalizePerson({ vorname: "Alex" }), secret);
  await assert.rejects(
    decodeResponse(code, "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"),
    /passt nicht/u,
  );
});
