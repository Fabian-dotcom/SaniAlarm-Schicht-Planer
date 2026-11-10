package com.fabian.sanialarmplaner.logic

import com.fabian.sanialarmplaner.data.ableiteTeams
import com.fabian.sanialarmplaner.data.SaniteamDatei
import com.fabian.sanialarmplaner.data.vollerName
import java.time.LocalDate
import java.time.YearMonth
import kotlin.math.ln
import kotlin.math.sqrt

// ==============================================================================
// GEMEINSAMES BEWERTUNGSMODELL (#44-Erweiterung)
// Zehn Kennzahlen aus EINEM Modell: Verteilung, Flexibilitaet, Risiko, Vertrauen
// Keine Ranglisten nach "Leistung" - nur Fairness und Planungssicherheit.
// ==============================================================================

data class PersonKennzahlen(
    val name: String,
    // 1-6: Verteilung & Vergangenheit
    val belastungsIndex: Double,        // relativ zum Gruppenmittel
    val kurzzeitBelastung: Double,      // exponentiell gewichtet (Halbwertszeit 28 T)
    val fairnessAbweichung: Double,     // (a_i - e_i) / (e_i + eps)
    val wochentagBalance: Double,       // 0 = gleichmaessig, hoeher = ungleicher,m
    val springerZusatzbelastung: Int,   // Dienste ausserhalb der Praeferenzen
    val einsatzquote: Double?,          // E_i / D_i (null = keine Daten)
    // 7-9: Planbarkeit
    val teamFlexibilitaet: Int,         // Teams, in denen einsetzbar
    val qualifikationsBeitrag: Int,     // Anzahl Teams, die ohne diese Person keine ausgebildete Person haetten
    val planungsOptionen: Int,          // gueltige (Tag, Team)-Zuweisungen im aktuellen Plan
    // 10: Datenqualitaet
    val datenVertrauen: String,         // "hoch"|"mittel"|"niedrig"
    val datenHinweis: String,
)

object KennzahlenEngine {

    private const val EPS = 1e-6
    private const val HALBWERTSZEIT_TAGE = 28.0

    /** Schulstufen: 7-10 mit Klassen, Q1-Q4 ohne Klassen. */
    val STUFEN = listOf("7", "8", "9", "10", "Q1", "Q2", "Q3", "Q4")

    /**
     * Aufstiegslogik (#Wunsch): Alle Personen steigen einmal auf.
     * 10 -> Q1, Q1 -> Q2, Q2 -> Q3, Q3 -> Q4, Q4 -> (Ausbildung = Abschluss).
     * Klassen (a-c) gibt es nur bis Stufe 10; ab Q1 bleibt die Klasse leer.
     * Die Klasse selbst wird NICHT gemischt (10a bleibt 10a, nur Jahrgang +1).
     */
    fun alleAufsteigen(datei: SaniteamDatei): SaniteamDatei {
        val neuePersonen = datei.personen.map { p ->
            val (neueStufe, neueKlasse) = aufsteigen(p.stufe, p.klasse)
            p.copy(stufe = neueStufe, klasse = neueKlasse)
        }
        return datei.copy(personen = neuePersonen)
    }

    private fun aufsteigen(stufe: String, klasse: String): Pair<String, String> = when (stufe) {
        "7" -> "8" to klasse
        "8" -> "9" to klasse
        "9" -> "10" to klasse
        "10" -> "Q1" to ""      // Klassen fallen in der Oberstufe weg
        "Q1" -> "Q2" to ""
        "Q2" -> "Q3" to ""
        "Q3" -> "Q4" to ""
        else -> stufe to klasse   // Q4 oder unbekannt: bleibt (Abschluss)
    }

    /** Alle Kennzahlen fuer alle aktiven Personen berechnen. */
    fun berechne(
        datei: SaniteamDatei,
        planMitglieder: Map<String, List<String>>,   // Datum -> Personen (aktueller Plan + Historie)
        verfuegbareTageProPerson: Map<String, Int>,  // Person -> Anzahl moeglicher Diensttage
        einsatzQuoten: Map<String, Double> = emptyMap(),   // Person -> E_i/D_i (#43)
    ): List<PersonKennzahlen> {
        val aktiv = datei.personen.filter { it.aktiv }
        val heute = LocalDate.now()
        val lambda = ln(2.0) / HALBWERTSZEIT_TAGE

        // Gesamt-Einsaetze und Datenbasis
        val einsaetzeProPerson = mutableMapOf<String, Int>()
        val kurzzeit = mutableMapOf<String, Double>()
        val wochentagVerteilung = mutableMapOf<String, MutableMap<String, Int>>()
        var datenZeitraumTage = 0
        if (datei.historie.isNotEmpty()) {
            val daten = datei.historie.mapNotNull { try { LocalDate.parse(it.datum) } catch (_: Exception) { null } }
            if (daten.isNotEmpty()) {
                datenZeitraumTage = (heute.toEpochDay() - daten.minOf { it.toEpochDay() }).toInt()
            }
        }

        for ((datumStr, personen) in planMitglieder) {
            val datum = try { LocalDate.parse(datumStr) } catch (_: Exception) { continue }
            val alterTage = (heute.toEpochDay() - datum.toEpochDay()).coerceAtLeast(0)
            val gewicht = kotlin.math.exp(-lambda * alterTage)
            for (p in personen) {
                einsaetzeProPerson[p] = (einsaetzeProPerson[p] ?: 0) + 1
                kurzzeit[p] = (kurzzeit[p] ?: 0.0) + gewicht
                val wt = datum.dayOfWeek.name
                wochentagVerteilung.getOrPut(p) { mutableMapOf() }[wt] =
                    (wochentagVerteilung[p]?.get(wt) ?: 0) + 1
            }
        }

        val gesamtEinsaetze = einsaetzeProPerson.values.sum().toDouble()
        val nPersonen = aktiv.size.coerceAtLeast(1)
        val mittel = gesamtEinsaetze / nPersonen

        // Team-Flexibilitaet: in wie vielen Teams koennte die Person sitzen?
        // (als zusaetzliche dritte Person in bestehenden Teams + Springer-Pool)
        val teams = datei.ableiteTeams()
        val flexibilitaet = aktiv.associate { p ->
            val name = p.vollerName()
            var count = 0
            for ((_, mitglieder) in teams) {
                if (name in mitglieder) { count++; continue }
                // haengbar als dritte Person, wenn Ausbildungs-Regel erfuellt bleibt
                val mitAusbildung = mitglieder.any { m ->
                    datei.personen.firstOrNull { it.vollerName() == m }?.ausbildungAbgeschlossen == true
                }
                if (mitAusbildung) count++
            }
            if (p.ausbildungAbgeschlossen) count += 1   // Springer-Pool
            name to count
        }

        // Qualifikations-Beitrag: Teams ohne diese Person ohne Ausgebildeten
        val quali = aktiv.associate { p ->
            val name = p.vollerName()
            var kritisch = 0
            for ((_, mitglieder) in teams) {
                if (name !in mitglieder) continue
                val andereAusbildet = mitglieder.any { m ->
                    m != name && datei.personen.firstOrNull { it.vollerName() == m }?.ausbildungAbgeschlossen == true
                }
                if (!andereAusbildet) kritisch++
            }
            name to kritisch
        }

        // Springer-Zusatzbelastung: Dienste ausserhalb der Praeferenzen
        val praeferenzen = datei.einstellung.praeferenzen
        val zusatzbelastung = mutableMapOf<String, Int>()
        for ((datumStr, personen) in planMitglieder) {
            val datum = try { LocalDate.parse(datumStr) } catch (_: Exception) { continue }
            // welchem Team gehoert der Dienst? (Heuristik: Namen im Team)
            val team = teams.entries.firstOrNull { entry -> entry.value.toSet() == personen.toSet() }?.key
                ?: teams.entries.firstOrNull { entry -> personen.all { p -> p in entry.value } }?.key
            if (team != null) {
                for (p in personen) {
                    val pr = praeferenzen[p]
                    if (!pr.isNullOrEmpty() && team !in pr) {
                        zusatzbelastung[p] = (zusatzbelastung[p] ?: 0) + 1
                    }
                }
            }
        }

        return aktiv.map { p ->
            val name = p.vollerName()
            val a = (einsaetzeProPerson[name] ?: 0).toDouble()
            // erwartete Dienste proportional zur Verfuegbarkeit
            val verf = (verfuegbareTageProPerson[name] ?: 0).toDouble()
            val verfSumme = verfuegbareTageProPerson.values.sum().toDouble().coerceAtLeast(EPS)
            val e = (verf / verfSumme) * gesamtEinsaetze
            val fairness = if (e > EPS) (a - e) / (e + EPS) else 0.0

            val wtVert = wochentagVerteilung[name]
            val wtBalance = if (wtVert != null && wtVert.isNotEmpty()) {
                val werte = wtVert.values.map { it.toDouble() }
                val m = werte.sum() / werte.size
                if (m > 0) werte.sumOf { (it - m) * (it - m) } / werte.size / m else 0.0
            } else 0.0

            // Datenvertrauen
            val nDienste = a.toInt()
            val vertrauen = when {
                datenZeitraumTage < 28 || nDienste < 3 ->
                    "niedrig" to "Nur ${nDienste} Dienste über ${datenZeitraumTage} Tage — Werte sind Richtwerte."
                datenZeitraumTage < 84 ->
                    "mittel" to "Datenbasis ${datenZeitraumTage} Tage — Tendenzen vorsichtig lesen."
                else -> "hoch" to "Datenbasis ${datenZeitraumTage} Tage — belastbar."
            }

            PersonKennzahlen(
                name = name,
                belastungsIndex = if (mittel > 0) a / mittel else 0.0,
                kurzzeitBelastung = kurzzeit[name] ?: 0.0,
                fairnessAbweichung = fairness,
                wochentagBalance = wtBalance,
                springerZusatzbelastung = zusatzbelastung[name] ?: 0,
                // #43: Einsatzquote aus dokumentierten Einsaetzen, null ohne Daten
                einsatzquote = einsatzQuoten[name],
                teamFlexibilitaet = flexibilitaet[name] ?: 0,
                qualifikationsBeitrag = quali[name] ?: 0,
                planungsOptionen = (verfuegbareTageProPerson[name] ?: 0),
                datenVertrauen = vertrauen.first,
                datenHinweis = vertrauen.second,
            )
        }.sortedByDescending { it.belastungsIndex }
    }

    /** Planungsrisiko pro Tag (#44): R_d = 1 / (1 + N_d) */
    fun planRisikoProTag(
        plan: Map<Schluessel, Dienst>,
        aufstellung: Aufstellung,
        config: com.fabian.sanialarmplaner.data.AppConfig,
        abwesenheiten: Abwesenheiten,
        gesperrteTage: Set<Int>,
        kaLookup: KlassenArbeitLookup?,
    ): Map<Schluessel, Double> {
        val risiko = mutableMapOf<Schluessel, Double>()
        for ((key, dienst) in plan) {
            if (tagIndex(key.first, key.second) in gesperrteTage) continue
            var alternativen = 0
            for (paar in aufstellung.aktivePaare.keys) {
                if (paar == dienst.paar) continue
                for (springer in aufstellung.aktiveSpringer + listOf<String?>(null)) {
                    // nur die aktuellen anderen Dienste pruefen (ohne diesen Slot)
                    val rest = plan.filterKeys { it != key }
                    if (istGueltig(rest, key.first, key.second, paar, springer, config, abwesenheiten, 0, kaLookup).isEmpty()) {
                        alternativen++
                    }
                }
            }
            risiko[key] = 1.0 / (1.0 + alternativen)
        }
        return risiko
    }
}
