package com.fabian.sanialarmplaner.logic

import com.fabian.sanialarmplaner.data.Person
import com.fabian.sanialarmplaner.data.SaniteamDatei
import com.fabian.sanialarmplaner.data.Schultermin
import com.fabian.sanialarmplaner.data.vollerName
import java.time.LocalDate

/**
 * Analyse von Schulterminen und Planungs-Engpaessen (#53-55).
 * Liefert Tages-Daten fuer Heatmap und Kalender.
 */
data class TagesAnalyse(
    val datum: LocalDate,
    val betroffenePersonen: List<String>,   // Personen mit Arbeit an diesem Tag
    val klassen: List<String>,              // betroffene Klassen
    val termine: List<Schultermin>,
    /** Engpass-Bewertung: 0 = ok, 1 = Engpass, 2 = kritisch */
    val engpassStufe: Int,
)

object KalenderAnalyse {

    /** Personen je Datum aus Schulterminen (Klassen-Filter angewendet). */
    fun betroffeneProTag(
        datei: SaniteamDatei,
        von: LocalDate,
        bis: LocalDate,
        klassenFilter: Set<String> = emptySet(),
    ): Map<LocalDate, TagesAnalyse> {
        val personen = datei.personen.filter { it.aktiv }
        val ergebnis = mutableMapOf<LocalDate, TagesAnalyse>()

        val relevante = datei.schultermine.filter { t ->
            val d = try { LocalDate.parse(t.datum) } catch (_: Exception) { return@filter false }
            d in von..bis && (klassenFilter.isEmpty() || t.klassen.any { it in klassenFilter })
        }
        for (t in relevante) {
            val d = try { LocalDate.parse(t.datum) } catch (_: Exception) { continue }
            // Betroffene: direkt genannte Personen ODER alle aus den genannten Klassen
            val direkt = t.personNamen.toSet()
            val perKlasse: List<String> = if (t.klassen.isNotEmpty())
                personen.filter { it.klasse in t.klassen }.map { it.vollerName() }
            else emptyList()
            val betroffene = (direkt + perKlasse).distinct()

            val alt = ergebnis[d]
            ergebnis[d] = TagesAnalyse(
                datum = d,
                betroffenePersonen = ((alt?.betroffenePersonen ?: emptyList()) + betroffene).distinct(),
                klassen = ((alt?.klassen ?: emptyList()) + t.klassen).distinct(),
                termine = (alt?.termine ?: emptyList()) + t,
                engpassStufe = alt?.engpassStufe ?: 0,
            )
        }

        // Engpass-Bewertung: Anteil betroffener Personen an aktiven Personen
        val gesamt = personen.size.coerceAtLeast(1)
        for ((d, a) in ergebnis) {
            val anteil = a.betroffenePersonen.size.toDouble() / gesamt
            a.copyForStufe(
                when {
                    anteil >= 0.5 -> 2   // kritisch: mehr als die Haelfte fehlt
                    anteil >= 0.25 -> 1  // Engpass
                    else -> 0
                }
            )?.let { ergebnis[d] = it }
        }
        return ergebnis
    }

    private fun TagesAnalyse.copyForStufe(stufe: Int) =
        if (stufe == engpassStufe) null else copy(engpassStufe = stufe)

    /** Klassen-Auswertung: Anzahl Arbeiten je Klasse in einem Zeitraum. */
    fun arbeitenProKlasse(
        datei: SaniteamDatei,
        von: LocalDate,
        bis: LocalDate,
    ): Map<String, Int> {
        val zaehler = mutableMapOf<String, Int>()
        for (t in datei.schultermine) {
            val d = try { LocalDate.parse(t.datum) } catch (_: Exception) { continue }
            if (d !in von..bis || t.typ != "Klassenarbeit") continue
            val klassen = t.klassen.ifEmpty { listOf("(keine Klasse)") }
            for (k in klassen) zaehler[k] = (zaehler[k] ?: 0) + 1
        }
        return zaehler
    }

    /** Planungs-Engpaesse: Tage, an denen weniger Personen verfuegbar sind als benoetigt. */
    fun problemTage(
        datei: SaniteamDatei,
        analyse: Map<LocalDate, TagesAnalyse>,
    ): List<LocalDate> = analyse.entries
        .filter { it.value.engpassStufe >= 1 }
        .map { it.key }
        .sorted()
}
