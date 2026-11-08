export const RESPONSE_PREFIX = "sani-alarm-beitritt-v2:";

const MAX_PAYLOAD_LENGTH = 2048;

function bytesFromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("Ungültiger Beitrittsschlüssel.");
  }
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
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

export function normalizePerson(formData) {
  const person = {
    typ: "person",
    version: 1,
    vorname: String(formData.vorname ?? "").trim(),
    nachname: String(formData.nachname ?? "").trim(),
    klasse: String(formData.klasse ?? "").trim(),
    telefon: String(formData.telefon ?? "").trim(),
    email: String(formData.email ?? "").trim(),
  };

  if (!person.vorname) {
    throw new Error("Bitte gib mindestens deinen Vornamen an.");
  }
  if (person.vorname.length > 80 || person.nachname.length > 100 ||
      person.klasse.length > 80 || person.telefon.length > 40 ||
      person.email.length > 120) {
    throw new Error("Mindestens eine Angabe ist zu lang.");
  }

  return person;
}

export async function encodeResponse(person, secret) {
  const rawKey = bytesFromBase64Url(secret);
  if (rawKey.length !== 32) {
    throw new Error("Ungültiger Beitrittsschlüssel.");
  }
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
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

  const rawKey = bytesFromBase64Url(secret);
  if (rawKey.length !== 32) {
    throw new Error("Ungültiger Beitrittsschlüssel.");
  }

  try {
    const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
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
    if (person?.typ !== "person" || person.version !== 1 ||
        typeof person.vorname !== "string" || !person.vorname.trim() ||
        typeof person.nachname !== "string" || typeof person.klasse !== "string" ||
        typeof person.telefon !== "string" || typeof person.email !== "string") {
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
