export const RESPONSE_PREFIX = "sani-alarm-beitritt-v2:";

const MAX_PAYLOAD_LENGTH = 2048;

function bytesFromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("Ungültiger Beitrittsschlüssel.");
  }
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(base64);
  return Uint8Array.from(bin, (character) => character.charCodeAt(0));
}

function base64UrlFromBytes(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

/**
 * Leitet unabhängig vom Format des Einladungsschlüssels (Hex, Base64-URL oder
 * beliebiger Text) immer deterministisch einen 32-Byte-AES-Schlüssel ab.
 * So passen App und Website immer zusammen.
 */
async function deriveKey(secret) {
  const material = new TextEncoder().encode(String(secret ?? "").trim());
  if (!material.length) {
    throw new Error("Ungültiger Beitrittsschlüssel.");
  }
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function normalizePerson(formData) {
  const person = {
    typ: "person",
    version: 2,
    vorname: String(formData.vorname ?? "").trim(),
    nachname: String(formData.nachname ?? "").trim(),
    stufe: String(formData.stufe ?? "").trim(),
    klasse: String(formData.klasse ?? "").trim(),
  };

  if (!person.vorname) {
    throw new Error("Bitte gib mindestens deinen Vornamen an.");
  }
  if (person.vorname.length > 80 || person.nachname.length > 100 ||
      person.stufe.length > 20 || person.klasse.length > 20) {
    throw new Error("Mindestens eine Angabe ist zu lang.");
  }

  return person;
}

export async function encodeResponse(person, secret) {
  const key = await deriveKey(secret);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plainText = new TextEncoder().encode(JSON.stringify(person));
  const cipherText = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plainText),
  );
  const encoded = `${RESPONSE_PREFIX}${base64UrlFromBytes(nonce)}.${base64UrlFromBytes(cipherText)}`;

  if (encoded.length > MAX_PAYLOAD_LENGTH) {
    throw new Error("Die Angaben sind zu umfangreich für einen QR-Code.");
  }

  return encoded;
}

export async function decodeResponse(encoded, secret) {
  if (typeof encoded !== "string" ||
      !encoded.startsWith(RESPONSE_PREFIX) ||
      encoded.length > MAX_PAYLOAD_LENGTH) {
    throw new Error("Ungültiger SaniAlarm-Antwortcode.");
  }

  const parts = encoded.slice(RESPONSE_PREFIX.length).split(".");
  if (parts.length !== 2) {
    throw new Error("Ungültiger SaniAlarm-Antwortcode.");
  }

  try {
    const key = await deriveKey(secret);
    const nonce = bytesFromBase64Url(parts[0]);
    const cipherText = bytesFromBase64Url(parts[1]);
    if (nonce.length !== 12 || cipherText.length < 16) {
      throw new Error("Ungültiger SaniAlarm-Antwortcode.");
    }
    const plainText = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      cipherText,
    );
    const person = JSON.parse(new TextDecoder().decode(plainText));
    if (person?.typ !== "person" ||
        typeof person.vorname !== "string" || !person.vorname.trim() ||
        typeof person.nachname !== "string") {
      throw new Error("Der QR-Code enthält kein gültiges Beitrittsformular.");
    }
    return person;
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith("Der QR-Code")) {
      throw cause;
    }
    throw new Error("Der Antwortcode ist ungültig oder passt nicht zu dieser Einladung.");
  }
}
