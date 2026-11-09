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
    /** Schulische Termine (Klassenarbeiten, Ferien etc.) fuer Kalender/Heatmap */
    val schultermine: List<Schultermin> = emptyList(),
)

@Serializable
data class Person(
    val vorname: String,
    val nachname: String = "",
    val klasse: String = "",          // z.B. "Sani-AG 10b"
    val geschlecht: String = "",      // "m", "w", "d" (optional, frei)
    val bevorzugterPartner: String = "",   // Vorname Nachname
    val ausbildungAbgeschlossen: Boolean = false,
    /** Ausbildungsbeginn (JJJJ-MM), fuer praezisen Belastungsindex (#34) */
    val ausbildungSeit: String = "",
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
// SCHULTERMINE (Klassenarbeiten etc.) - Fundament fuer Kalender/Heatmap (#53-55)
// ==============================================================================

@Serializable
data class Schultermin(
    val datum: String,             // "2026-11-12"
    val titel: String = "Klassenarbeit",
    val klassen: List<String> = emptyList(),   // betroffene Klassen, z.B. ["10b"]
    /** Personen direkt betroffen (leer = alle aus den genannten Klassen) */
    val personNamen: List<String> = emptyList(),
    /** Typ: "Klassenarbeit", "Ferien", "Feiertag", "Sonstiges" */
    val typ: String = "Klassenarbeit",
)

// ==============================================================================
// HILFSFUNKTIONEN
// ==============================================================================

/** Kompletter Anzeigename einer Person. */
fun Person.vollerName(): String =
    if (nachname.isBlank()) vorname else "${vorname} ${nachname}".trim()

/**
 * Eindeutiger Kurzname: "Vorname N." bzw. bei doppelten Anfangsbuchstaben
 * "Vorname Ab." / "Vorname Abc." - long-enough um Personen zu unterscheiden.
 */
fun kurzeNamen(personen: List<Person>): Map<String, String> {
    val aktiv = personen.filter { it.aktiv }
    val result = mutableMapOf<String, String>()

    fun nachnameInitial(p: Person, laenge: Int): String {
        if (p.nachname.isBlank()) return ""
        // Mehrfachnamen ("Meyer Schmidt"): von JEDEM Teil die ersten Buchstaben
        val teile = p.nachname.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
        val teileStr = teile.joinToString("") { teil ->
            teil.take(laenge).replaceFirstChar { it.uppercase() }
        }
        return if (teile.size > 1) "$teileStr." else "${teileStr.take(laenge).replaceFirstChar { it.uppercase() }}."
    }

    // Laenge 1, 2, 3 ... erhoehen, bis eindeutig
    val gruppiert = aktiv.groupBy { it.vorname }
    for ((vorname, gruppe) in gruppiert) {
        if (gruppe.size == 1) {
            val p = gruppe.first()
            result[p.vollerName()] = if (p.nachname.isBlank()) vorname
                else "$vorname ${nachnameInitial(p, 1)}"
        } else {
            for (laenge in 1..10) {
                val kuerzel = gruppe.map { it to nachnameInitial(it, laenge) }
                val eindeutig = kuerzel.groupBy { it.second }.all { it.value.size == 1 }
                if (eindeutig) {
                    kuerzel.forEach { (p, k) ->
                        result[p.vollerName()] = if (k.isBlank()) vorname else "$vorname $k"
                    }
                    break
                }
            }
        }
        // Fallback falls nicht eindeutig
        gruppe.forEach { p ->
            if (result[p.vollerName()] == null) result[p.vollerName()] = p.vollerName()
        }
    }
    return result
}

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

/** Springer-Pool: ausgebildete Personen ohne festes Team + explizit genannte.
 *  Explizit genannte Namen nur, wenn sie tatsaechlich in der Kartei existieren
 *  (filtert veraltete/hartcodierte Kurz-Namen raus). */
fun SaniteamDatei.ableiteSpringer(): List<String> {
    val bekannte = personen.filter { it.aktiv }.map { it.vollerName() }.toSet()
    val explizit = einstellung.springerNamen.filter { it in bekannte }
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
    private val backupOrdner = File(context.filesDir, "backups")
    private val speicher = SaniteamSpeicher()
    private var letztesBackup: Long = 0L

    fun laden(): SaniteamDatei? = try {
        if (!file.exists()) null else speicher.deserialisieren(file.readText())
    } catch (_: Exception) {
        // Hauptdatei beschaedigt? Letztes Backup versuchen (#50)
        val backup = neuestesBackup()
        backup?.let { speicher.deserialisieren(it.readText()) }
    }

    fun speichern(datei: SaniteamDatei) {
        try {
            file.parentFile?.mkdirs()
            file.writeText(speicher.serialisieren(datei))
            vielleichtBackup()
        } catch (_: Exception) {
            // Schreibfehler still ignorieren; beim naechsten Speichern erneut versuchen
        }
    }

    /** Taegliches Backup: max. 1x pro Tag eine Kopie, max. 10 werden behalten. */
    private fun vielleichtBackup() {
        val jetzt = System.currentTimeMillis()
        if (jetzt - letztesBackup < 24 * 60 * 60 * 1000L) return
        letztesBackup = jetzt
        try {
            backupOrdner.mkdirs()
            val stamp = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.GERMANY)
                .format(java.util.Date(jetzt))
            File(backupOrdner, "backup-$stamp.saniteam").writeText(file.readText())
            // Alte Backups auf 10 begrenzen
            backupOrdner.listFiles()
                ?.sortedByDescending { it.name }
                ?.drop(10)
                ?.forEach { it.delete() }
        } catch (_: Exception) {
            // Backup-Fehler sind nicht kritisch
        }
    }

    private fun neuestesBackup(): File? =
        backupOrdner.listFiles()?.maxByOrNull { it.name }

    /** Manuelle Backup-Liste fuer die Einstellungen (Wiederherstellen). */
    fun backups(): List<String> =
        backupOrdner.listFiles()?.sortedByDescending { it.name }?.map { it.name } ?: emptyList()

    fun wiederherstellen(backupName: String): SaniteamDatei? {
        val f = File(backupOrdner, backupName)
        val d = speicher.deserialisieren(f.readText()) ?: return null
        speichern(d)
        return d
    }
}
