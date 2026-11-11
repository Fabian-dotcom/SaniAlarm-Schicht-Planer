import QRCode from "qrcode";
import { encodeResponse, normalizePerson } from "./beitritt.js";
import "./style.css";

const form = document.querySelector("#form");
const unavailable = document.querySelector("#unavailable");
const result = document.querySelector("#result");
const canvas = document.querySelector("#qr");
const error = document.querySelector("#error");

const invitation = new URLSearchParams(window.location.search).get("beitritt")
  ?? (window.location.hash.includes("key=") ? "1" : null);
const invitationKey = new URLSearchParams(window.location.hash.slice(1)).get("key");
if (invitationKey) {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

if (invitation && invitationKey) {
  form.hidden = false;
} else {
  unavailable.hidden = false;
}

/* Klasse nur erforderlich, wenn die Stufe 7-10 ist (Q1-Q4 haben keine Klassen) */
const stufeSelect = document.querySelector("#stufeSelect");
const klasseSelect = document.querySelector("#klasseSelect");
const klasseLabel = document.querySelector("#klasseLabel");

function updateKlasseVisibility() {
  const stufe = stufeSelect.value;
  const isOberstufe = /^Q[1-4]$/.test(stufe);
  klasseLabel.hidden = isOberstufe;
  klasseSelect.required = !isOberstufe;
  if (isOberstufe) klasseSelect.value = "";
}

stufeSelect.addEventListener("change", updateKlasseVisibility);
updateKlasseVisibility();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.hidden = true;
  result.hidden = true;

  try {
    const formData = new FormData(form);
    const person = normalizePerson({
      vorname: formData.get("givenName"),
      nachname: formData.get("familyName"),
      stufe: formData.get("stufe"),
      klasse: formData.get("klasse") ?? "",
    });
    const responseCode = await encodeResponse(person, invitationKey);
    await QRCode.toCanvas(canvas, responseCode, {
      errorCorrectionLevel: "M",
      margin: 3,
      width: 280,
      color: { dark: "#272727", light: "#ffffff" },
    });
    const respTextEl = document.querySelector("#responseText");
    if (respTextEl) respTextEl.value = responseCode;
    result.hidden = false;
    form.hidden = true;
  } catch (cause) {
    error.textContent = cause instanceof Error
      ? cause.message
      : "Der Antwortcode konnte nicht erstellt werden.";
    error.hidden = false;
  }
});

const copyBtn = document.querySelector("#copyResponse");
if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    const respTextEl = document.querySelector("#responseText");
    if (!respTextEl || !respTextEl.value) return;
    try {
      await navigator.clipboard.writeText(respTextEl.value);
      copyBtn.textContent = "Kopiert!";
      setTimeout(() => { copyBtn.textContent = "Text kopieren"; }, 2000);
    } catch (e) {
      respTextEl.select();
    }
  });
}

document.querySelector("#reset").addEventListener("click", () => {
  form.reset();
  updateKlasseVisibility();
  form.hidden = false;
  result.hidden = true;
  error.hidden = true;
});
