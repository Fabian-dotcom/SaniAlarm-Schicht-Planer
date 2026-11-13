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

// Ausbilder-Teams aus dem QR-Link: #key=...&teams=1,2,3 (oder ?teams=…)
const hashParams = new URLSearchParams(window.location.hash.slice(1));
const teamsRaw = new URLSearchParams(window.location.search).get("teams") ?? hashParams.get("teams");
const invitedTeams = (teamsRaw ?? "")
  .split(",").map((t) => Number(t.trim())).filter((n) => Number.isInteger(n) && n >= 0);
let invitedTeamLabels = new Map();
try {
  const encodedLabels = new URLSearchParams(window.location.search).get("teamNames");
  if (encodedLabels) {
    const entries = JSON.parse(encodedLabels);
    invitedTeamLabels = new Map(entries.filter(entry => Array.isArray(entry) && entry.length >= 2)
      .map(([id, label]) => [Number(id), String(label).slice(0, 160)])
      .filter(([id, label]) => Number.isInteger(id) && label));
  }
} catch { /* Invalid labels are ignored; IDs remain safe fallback labels. */ }

if (invitationKey) {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.hash = "";
  cleanUrl.searchParams.delete("teamNames");
  window.history.replaceState(null, "", cleanUrl.pathname + cleanUrl.search);
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

/* Ausbilder-Team-Checkboxen: alle angebotenen Teams sind vorangewählt,
   man muss sie explizit abwählen ("Team ablehnen"), sonst akzeptiert man alle. */
const teamsBox = document.querySelector("#ausbilderTeams");
function renderAusbilderTeams() {
  if (!teamsBox) return;
  if (!invitedTeams.length) {
    teamsBox.innerHTML = '<p class="hint">In dieser Einladung wurden keine Ausbilder-Teams angegeben. Die Leitung ordnet dich bei der Planung einem passenden Team zu.</p>';
    return;
  }
  const checks = document.createElement("div");
  checks.className = "teams-list";
  invitedTeams.forEach((t) => {
    const label = document.createElement("label");
    label.className = "team-check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "ausbilderTeam";
    checkbox.value = String(t);
    checkbox.checked = true;
    const text = document.createElement("span");
    text.textContent = invitedTeamLabels.get(t) || `Team ${t}`;
    label.append(checkbox, text);
    checks.appendChild(label);
  });
  teamsBox.replaceChildren(checks);
}
renderAusbilderTeams();

function selectedAusbilderTeams() {
  return [...document.querySelectorAll("input[name='ausbilderTeam']:checked")]
    .map((el) => Number(el.value));
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
      stufe: formData.get("stufe"),
      klasse: formData.get("klasse") ?? "",
      kontakt: formData.get("kontakt") ?? "",
      ausbildungsStatus: formData.get("ausbildungsStatus") ?? "helfer",
      ausbilderTeams: selectedAusbilderTeams(),
      ausbilderTeamsSpecified: invitedTeams.length > 0,
      ausbilderTeamLabels: [...invitedTeamLabels.entries()],
      ausbilderTeamPrefs: selectedAusbilderTeams().map(id => ({ id, name: invitedTeamLabels.get(id) || `Team ${id}` })),
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
