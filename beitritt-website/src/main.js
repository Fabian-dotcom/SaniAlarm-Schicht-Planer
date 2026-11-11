import QRCode from "qrcode";
import { encodeResponse, normalizePerson } from "./beitritt.js";
import "./style.css";

const form = document.querySelector("#form");
const unavailable = document.querySelector("#unavailable");
const result = document.querySelector("#result");
const canvas = document.querySelector("#qr");
const error = document.querySelector("#error");

const invitation = new URLSearchParams(window.location.search).get("beitritt");
const invitationKey = new URLSearchParams(window.location.hash.slice(1)).get("key");
if (invitation === "1" && invitationKey) {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  form.hidden = false;
} else {
  unavailable.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.hidden = true;
  result.hidden = true;

  try {
    const formData = new FormData(form);
    const person = normalizePerson({
      vorname: formData.get("givenName"),
      nachname: formData.get("familyName"),
      klasse: formData.get("group"),
      telefon: formData.get("phone"),
      email: "",
    });
    const responseCode = await encodeResponse(person, invitationKey);
    await QRCode.toCanvas(canvas, responseCode, {
      errorCorrectionLevel: "M",
      margin: 3,
      width: 280,
      color: { dark: "#102c40", light: "#ffffff" },
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
  form.hidden = false;
  result.hidden = true;
  error.hidden = true;
});
