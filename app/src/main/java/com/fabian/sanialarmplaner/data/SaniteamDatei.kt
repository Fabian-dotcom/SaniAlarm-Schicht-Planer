package com.fabian.sanialarmplaner.data

import android.content.Context
import java.io.File
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

// ==============================================================================
// EIGENES DATEIFORMAT: .saniteam
// ==============================================================================
/**
 * Enthaelt ALLE projektspezifischen Daten: Personen (Kartei), Teams, Springer,
 * Regeln, Sperrtage und vergangene Schichten fuer Statistiken.
 *
 * Wird in der App erstellt/bearbeitet und kann als .saniteam-Datei exportiert
 * bzw. importiert werden (JSON-basiert). Enthaltet echte Namen -> nicht in git!
 */
@Serializable
data class SaniteamDatei(
    val formatVersion: Int = 1,
    val personen: List<Person> = emptyList(),
    val einstellung: PlanEinstellung = PlanEinstellung(),
    /** Vergangene Schichten fuer Statistiken: "JJJJ-MM-TT" -> SchichtEintrag */
    val historie: List<HistorischeSchicht> = emptyList(),
)

@Serializable
data class Person(
    val vorname: String,
    val nachname: String = "",
    val klasse: String = "",          // z.B. "Sani-AG 10b"
    val geschlecht: String = "",      // "m", "w", "d" (optional, frei)
    val bevorzugterPartner: String = "",   // Vorname Nachname
    val ausbildungAbgeschlossen: Boolean = false,
    val seit: String = "",            // Beitritt, z.B. "2024-09" (fuer Belastungsindex)
    val anmerkung: String = "",
    val telefon: String = "",         // optional, fuer schnelle Absagen
    val email: String = "",
    val aktiv: Boolean = true,        // ausgetreten / Schulabschluss etc.
)

@Serializable
data class PlanEinstellung(
    /** Springer sind Personen ohne festes Team oder mit ausgebildeter Rolle */
    val springerNamen: List<String> = emptyList(),
    val praeferenzen: Map<String, List<String>> = emptyMap(),
    val teamSperrtage: Map<String, List<String>> = emptyMap(),
    val personSperrtage: Map<String, List<String>> = emptyMap(),
    val personMaxEinsaetze: Map<String, Int> = emptyMap(),
    /** Regel-Schalter */
    val regeln: RegelKonfig = RegelKonfig(),
    val modus: String = "normal",
    val seed: Long = 0L,
    val maxVersuche: Int = 400,
)

@Serializable
data class HistorischeSchicht(
    val datum: String,        // "2026-11-05"
    val personNamen: List<String>,   // alle, die dabei waren (inkl. Springer)
)

// ==============================================================================
// HILFSFUNKTIONEN
// ==============================================================================

/** Kompletter Anzeigename einer Person. */
fun Person.vollerName(): String =
    if (nachname.isBlank()) vorname else "${vorname} ${nachname}".trim()

/** Teams abgeleitet aus bevorzugtemPartner + Klasse (heuristisch, bearbeitbar). */
fun SaniteamDatei.ableiteTeams(): Map<String, List<String>> {
    val aktiv = personen.filter { it.aktiv }
    val teams = linkedMapOf<String, MutableList<String>>()
    val zugeordnet = mutableSetOf<String>()

    // 1) explizite Partnerwuensche beruecksichtigen (gegenseitig oder einseitig)
    for (p in aktiv) {
        if (p.bevorzugterPartner.isBlank() || p.vollerName() in zugeordnet) continue
        val partner = aktiv.firstOrNull { it.vollerName() == p.bevorzugterPartner } ?: continue
        if (partner.vollerName() in zugeordnet) continue
        // Ausbildungs-Regel: mind. eine Person pro Team muss ausgebildet sein
        if (!p.ausbildungAbgeschlossen && !partner.ausbildungAbgeschlossen) continue
        val name = "${p.vorname} & ${partner.vorname}"
        teams[name] = mutableListOf(p.vollerName(), partner.vollerName())
        zugeordnet += p.vollerName(); zugeordnet += partner.vollerName()
    }

    val restliche = aktiv.filter { it.vollerName() !in zugeordnet }
    val ausgebildetRest = restliche.filter { it.ausbildungAbgeschlossen }.toMutableList()
    val unabgebildetRest = restliche.filter { !it.ausbildungAbgeschlossen }.toMutableList()

    // Paare aus Rest-Ausgebildeten bilden
    while (ausgebildetRest.size >= 2) {
        val a = ausgebildetRest.removeAt(0)
        val b = ausgebildetRest.removeAt(0)
        val name = "${a.vorname} & ${b.vorname}"
        teams[name] = mutableListOf(a.vollerName(), b.vollerName())
        zugeordnet += a.vollerName(); zugeordnet += b.vollerName()
    }

    // Unausgebildete an Ausgebildete aus 2er-Teams haengen -> 3er-Team
    val drei = unabgebildetRest.iterator()
    for ((name, mitglieder) in teams.toList()) {
        if (!drei.hasNext()) break
        if (mitglieder.size != 2) continue
        val hatAusbildung = mitglieder.any { m ->
            personen.firstOrNull { it.vollerName() == m }?.ausbildungAbgeschlossen == true
        }
        if (hatAusbildung) {
            val u = drei.next()
            mitglieder.add(u.vollerName())
            zugeordnet += u.vollerName()
            teams[name] = mitglieder
        }
    }
    // Restliche Unausgebildete ohne Ausgebildeten bleiben unberuecksichtigt
    // (werden als Warnung im Planungstab angezeigt)
    return teams
}

/** Springer-Pool: ausgebildete Personen ohne festes Team + explizit genannte. */
fun SaniteamDatei.ableiteSpringer(): List<String> {
    val explizit = einstellung.springerNamen
    val teams = ableiteTeams()
    val inTeam = teams.values.flatten().toSet()
    val ausgebildetOhneTeam = personen
        .filter { it.aktiv && it.ausbildungAbgeschlossen && it.vollerName() !in inTeam }
        .map { it.vollerName() }
    return (explizit + ausgebildetOhneTeam).distinct()
}

// ==============================================================================
// SPEICHERN / LADEN
// ==============================================================================

class SaniteamSpeicher(private val json: Json = Json { prettyPrint = true; ignoreUnknownKeys = true }) {

    fun serialisieren(datei: SaniteamDatei): String = json.encodeToString(datei)

    fun deserialisieren(text: String): SaniteamDatei? = try {
        json.decodeFromString<SaniteamDatei>(text)
    } catch (_: Exception) {
        null
    }
}

// ==============================================================================
// PERSISTENZ DER .saniteam-DATEN (app-interner Speicher, ueberlebt Neustart)
// ==============================================================================

class SaniteamStore(context: Context) {
    private val file = File(context.filesDir, "daten.saniteam")
    private val speicher = SaniteamSpeicher()

    fun laden(): SaniteamDatei? = try {
        if (!file.exists()) null else speicher.deserialisieren(file.readText())
    } catch (_: Exception) {
        null
    }

    fun speichern(datei: SaniteamDatei) {
        try {
            file.parentFile?.mkdirs()
            file.writeText(speicher.serialisieren(datei))
        } catch (_: Exception) {
            // Schreibfehler still ignorieren; beim naechsten Speichern erneut versuchen
        }
    }
}
