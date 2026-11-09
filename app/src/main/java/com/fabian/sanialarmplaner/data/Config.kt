package com.fabian.sanialarmplaner.data

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

// ==============================================================================
// AKTIVE PLAN-KONFIGURATION (Laufzeit-Sicht auf die .saniteam-Daten)
// ==============================================================================
/**
 * Die aktive Planung-Konfiguration. Wird NICHT mehr hartkodiert, sondern aus
 * der .saniteam-Datei abgeleitet bzw. in der App bearbeitet.
 */
@Serializable
data class AppConfig(
    val teams: Map<String, List<String>> = emptyMap(),
    val springer: List<String> = emptyList(),
    val praeferenzen: Map<String, List<String>> = emptyMap(),
    val teamSperrtage: Map<String, List<String>> = emptyMap(),
    /** Optional: Person -> Liste von Wochentagen, an denen SIE generell nicht kann */
    val personSperrtage: Map<String, List<String>> = emptyMap(),
    /** Optional: max. Einsätze pro Person im Monat (Sonderfall Teilzeit) */
    val personMaxEinsaetze: Map<String, Int> = emptyMap(),
    /** Entspannung des Algorithmus: "streng", "normal", "lockerer" */
    val modus: String = "normal",
    /** Zufalls-Seed (0 = zufällig). Gleicher Seed => gleicher Plan */
    val seed: Long = 0L,
    /** Wie oft bei Fehlschlag mit neuem Zufall neu versucht wird */
    val maxVersuche: Int = 400,
    /** Einzeln abschaltbare Regeln */
    val regeln: RegelKonfig = RegelKonfig(),
)

@Serializable
data class RegelKonfig(
    val teamSperrtageAktiv: Boolean = true,
    val maxEineSchichtProWoche: Boolean = true,
    val wochentagNurEinmal: Boolean = true,     // "kein Wochentag doppelt im Monat"
    val keinBackToBack: Boolean = true,
    val springerPraeferenzen: Boolean = true,
    val blockFairness: Boolean = true,
    /** #53: Klassenarbeits-Modus: "streng" (hart), "gewichtet" (weich), "aus" */
    val klassenarbeitModus: String = "streng",
    /** #53: Optionaler Vortagsfaktor — Lernen am Vortag als weicher Verstoß */
    val klassenarbeitVortag: Boolean = false,
)

// ==============================================================================
// PERSISTENZ (SharedPreferences + kotlinx.serialization)
// ==============================================================================

class ConfigStore(context: Context) {
    private val prefs = context.getSharedPreferences("sanialarm_config", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    fun prefsFuerIch(): String = prefs.getString("ich", "") ?: ""

    fun speichereIch(name: String) {
        prefs.edit().putString("ich", name).apply()
    }

    fun prefsKarteiSortierung(): String = prefs.getString("karteiSortierung", "nachname") ?: "nachname"

    fun speichereKarteiSortierung(s: String) {
        prefs.edit().putString("karteiSortierung", s).apply()
    }

    fun laden(): AppConfig = try {
        val raw = prefs.getString("config", null)
        if (raw.isNullOrBlank()) AppConfig() else json.decodeFromString<AppConfig>(raw)
    } catch (_: Exception) {
        AppConfig()
    }

    fun speichern(config: AppConfig) {
        prefs.edit().putString("config", json.encodeToString(config)).apply()
    }
}
