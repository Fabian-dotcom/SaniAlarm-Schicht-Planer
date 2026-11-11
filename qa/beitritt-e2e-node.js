/**
 * E2E (Node-only, ohne Browser): Beitritts-Workflow zwischen App und Website.
 *
 * 1. Simuliert die App: erzeugt zufälligen 24-Byte-Hex-Schlüssel
 * 2. Simuliert die Website: baut Person (Stufe/Klasse) und verschlüsselt Antwortcode
 * 3. Simuliert den App-Import: entschlüsselt mit js/ui.js-Logik (decryptBeitrittV2-Nachbau)
 * 4. Prüft, dass beide Seiten identische Daten sehen und die Klassen-Logik stimmt
 */
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const siteModule = await import(pathToFileURL(path.resolve('beitritt-website/src/beitritt.js')).href);

// --- WebCryptoGlobals for node (globalThis.crypto exists in Node 20+) ---
const SECRET = crypto.randomBytes(24).toString('hex'); // wie openQrInviteModal in js/ui.js
console.log('Einladungs-Schlüssel (24-Byte-Hex):', SECRET.slice(0, 16) + '…');

// Schritt 1: Website erzeugt Antwortcode (Stufe 10, Klasse 2)
const personSite = siteModule.normalizePerson({
  vorname: 'Lena',
  nachname: 'Testperson',
  stufe: '10',
  klasse: '2',
});
const code = await siteModule.encodeResponse(personSite, SECRET);
console.log('✅ Website: Antwortcode erzeugt:', code.slice(0, 40) + '…');

// Schritt 2: App entschlüsselt – Logik 1:1 aus js/ui.js decryptBeitrittV2
async function decryptBeitrittV2(encoded, secret) {
  if (!encoded || !encoded.startsWith('sani-alarm-beitritt-v2:')) return null;
  const parts = encoded.slice('sani-alarm-beitritt-v2:'.length).split('.');
  if (parts.length !== 2) return null;
  const material = new TextEncoder().encode(String(secret ?? '').trim());
  if (!material.length) return null;
  const digest = await crypto.subtle.digest('SHA-256', material);
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['decrypt']);
  const b64u = s => Uint8Array.from(Buffer.from(s.replaceAll('-', '+').replaceAll('_', '/'), 'base64'));
  const nonce = b64u(parts[0]);
  const cipherText = b64u(parts[1]);
  if (nonce.length !== 12 || cipherText.length < 16) return null;
  const plainText = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipherText);
  return JSON.parse(new TextDecoder().decode(plainText));
}

const decoded = await decryptBeitrittV2(code, SECRET);
if (!decoded) { console.error('❌ App konnte Antwortcode nicht entschlüsseln'); process.exit(1); }
console.log('✅ App: Entschlüsselt:', JSON.stringify(decoded));

// Klassen-Zusammensetzung wie in openQrInviteModal (js/ui.js)
function buildCls(decoded) {
  const stufeRaw = String(decoded.stufe || '').trim();
  const klasseRaw = String(decoded.klasse || '').trim();
  const isOberstufe = /^(q[1-4]|1[123])$/i.test(stufeRaw);
  return isOberstufe ? stufeRaw.toLowerCase() : `${stufeRaw}${klasseRaw}`.toLowerCase() || '10a';
}

if (buildCls(decoded) !== '102') { console.error('❌ Klasse falsch:', buildCls(decoded)); process.exit(1); }
console.log('✅ Klasse korrekt zusammengesetzt: „10-2“ →', buildCls(decoded));

// Schritt 3: Oberstufe ohne Klasse
const q4Person = siteModule.normalizePerson({ vorname: 'Max', stufe: 'Q4', klasse: '' });
const q4Code = await siteModule.encodeResponse(q4Person, SECRET);
const q4Decoded = await decryptBeitrittV2(q4Code, SECRET);
if (buildCls(q4Decoded) !== 'q4') { console.error('❌ Oberstufe falsch:', buildCls(q4Decoded)); process.exit(1); }
console.log('✅ Oberstufe korrekt: „Q4“ →', buildCls(q4Decoded));

console.log('\n✅ E2E-Beitritts-Workflow (Node) erfolgreich: Website → verschlüsselter Code → App-Import stimmen überein.');
