import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeResponse,
  encodeResponse,
  normalizePerson,
  RESPONSE_PREFIX,
} from "../src/beitritt.js";

const SECRET = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 43 Zeichen Hex-artig, wie aus der App

test("antwortcode ist UTF-8-sicher und mit dem Einladungsgeheimnis verschlüsselt", async () => {
  const person = normalizePerson({
    vorname: "Élodie",
    nachname: "Müller",
    stufe: "10",
    klasse: "2",
    ausbildungsStatus: "ausbildung",
    ausbilderTeams: [1, 3],
    ausbilderTeamLabels: [[1, "Team 1 · Trainerin & Trainer"], [3, "Team 3"]],
    ausbilderTeamPrefs: [{ id: 1, name: "Team 1 · Trainerin & Trainer" }],
  });
  const code = await encodeResponse(person, SECRET);

  assert.ok(code.startsWith(RESPONSE_PREFIX));
  assert.notEqual(code.includes("Müller"), true);
  assert.deepEqual(await decodeResponse(code, SECRET), person);
  const roundTrip = await decodeResponse(code, SECRET);
  assert.equal(roundTrip.ausbildungsStatus, "ausbildung");
  assert.deepEqual(roundTrip.ausbilderTeams, [1, 3]);
  assert.match(roundTrip.ausbilderTeamLabels[0][1], /Trainerin/u);
  assert.deepEqual(roundTrip.ausbilderTeamPrefs, [{ id: 1, name: "Team 1 · Trainerin & Trainer" }]);
});

test("kurzer 24-Byte-Hex-Schlüssel aus der App funktioniert (SHA-256-Ableitung)", async () => {
  const appSecret = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4"; // 48 Hex-Zeichen = 24 Byte
  const person = normalizePerson({ vorname: "Alex", stufe: "7", klasse: "3" });
  const code = await encodeResponse(person, appSecret);
  assert.deepEqual(await decodeResponse(code, appSecret), person);
});

test("beliebiger Textschlüssel funktioniert ebenfalls", async () => {
  const person = normalizePerson({ vorname: "Sam", stufe: "Q2" });
  const code = await encodeResponse(person, "irgend-ein-text-key");
  assert.deepEqual(await decodeResponse(code, "irgend-ein-text-key"), person);
});

test("mindestens ein Vorname wird verlangt", () => {
  assert.throws(() => normalizePerson({ vorname: "   " }), /Vorname/u);
});

test("unbekannte, manipulierte und falsch verschlüsselte Codes werden abgelehnt", async () => {
  await assert.rejects(decodeResponse("https://example.org", SECRET), /Ungültiger/u);
  await assert.rejects(decodeResponse(`${RESPONSE_PREFIX}%%%`, SECRET), /Ungültiger/u);
  const code = await encodeResponse(normalizePerson({ vorname: "Alex" }), SECRET);
  await assert.rejects(
    decodeResponse(code, "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"),
    /passt nicht/u,
  );
});
