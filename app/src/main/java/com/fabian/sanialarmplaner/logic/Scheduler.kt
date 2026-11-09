package com.fabian.sanialarmplaner.logic

import com.fabian.sanialarmplaner.data.AppConfig
import kotlin.random.Random

// ==============================================================================
// GRUNDDATEN
// ==============================================================================
object Wochen {
    val alle = listOf(1, 2, 3, 4)
}

object Wochentage {
    val dienst = listOf("Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag")
}

/** Ein Dienst-Slot: Team + optional eine Springer-Person. */
data class Dienst(val paar: String, val springer: String?)

typealias Schluessel = Pair<Int, String>   // (Woche, Wochentag)

/** Tagesgenaue Abwesenheit (Sonderfall): Person -> Menge "(woche,tag)"-Indices 0..19 */
typealias Abwesenheiten = Map<String, Set<Int>>

fun tagIndex(woche: Int, tag: String): Int =
    (woche - 1) * 5 + Wochentage.dienst.indexOf(tag)

// ==============================================================================
// AUFSTELLUNG: Wer ist überhaupt verfügbar?
// ==============================================================================
data class Aufstellung(
    val aktivePaare: Map<String, List<String>>,
    val aktiveSpringer: List<String>,
    val ausgefallenePaare: List<String>,
)

fun verarbeiteAufstellung(
    config: AppConfig,
    krankePersonen: Set<String>,
    abwesenheiten: Abwesenheiten = emptyMap(),
): Aufstellung {
    // Eine Person gilt als dauerhaft krank, wenn sie "krank" gemarkt ist ODER
    // an ALLEN 10 Tagen abwesend gemeldet ist (Sonderfall: lange Erkrankung).
    val dauerhaftKrank = krankePersonen + abwesenheiten
        .filterValues { s -> s.size >= 10 }.keys

    val aktivePaare = mutableMapOf<String, List<String>>()
    val aktiveSpringer = config.springer.filter { it !in dauerhaftKrank }.toMutableList()
    val ausgefallen = mutableListOf<String>()

    for ((teamName, mitglieder) in config.teams) {
        val gesunde = mitglieder.filter { it !in dauerhaftKrank }
        when {
            gesunde.size == 2 -> aktivePaare[teamName] = gesunde
            gesunde.size == 1 -> {
                aktiveSpringer.add(gesunde.first())   // halbes Team -> wird Springer
                ausgefallen.add(teamName)
            }
            else -> ausgefallen.add(teamName)          // komplettes Team fällt aus
        }
    }
    return Aufstellung(aktivePaare, aktiveSpringer, ausgefallen)
}

// ==============================================================================
// REGELPRÜFUNG (Regeln 1–6 aus der Python-Version + Erweiterungen)
// ==============================================================================
enum class RegelId {
    SPERRTAG, WOCHE, WOCHENTAG, BACK_TO_BACK, PRAEFERENZ, FAIRNESS,
    ABWESENHEIT, MAX_EINSAETZE
}

data class RegelVerstoß(val regel: RegelId, val beschreibung: String)

/**
 * Prüft, ob ein Paar(+Springer) an (woche, tag) eingesetzt werden darf.
 *
 * @param entspannung 0 = streng (alle Regeln), 1 = Fairness + Wochentags-Regel
 *                    gelockert, 2 = zusätzlich Back-to-Back + Präferenzen
 *                    gelockert. Sperrtage/Woche/Abwesenheit bleiben immer hart.
 */
fun istGueltig(
    dienstplan: Map<Schluessel, Dienst>,
    woche: Int,
    tagName: String,
    gewaehltesPaar: String,
    springerPerson: String?,
    config: AppConfig,
    abwesenheiten: Abwesenheiten,
    entspannung: Int = 0,
): List<RegelVerstoß> {
    val verstoesse = mutableListOf<RegelVerstoß>()

    // REGEL 1: Team-Sperrtage einhalten (abschaltbar, gilt IMMER wenn aktiv)
    if (config.regeln.teamSperrtageAktiv && tagName in config.teamSperrtage[gewaehltesPaar].orEmpty()) {
        verstoesse += RegelVerstoß(RegelId.SPERRTAG, "${gewaehltesPaar} hat Sperrtag am $tagName")
    }
    // REGEL 1b (Erweiterung): Personen-Sperrtage
    val beteiligtePersonen = config.teams[gewaehltesPaar].orEmpty() + listOfNotNull(springerPerson)
    for (p in beteiligtePersonen) {
        if (tagName in config.personSperrtage[p].orEmpty()) {
            verstoesse += RegelVerstoß(RegelId.SPERRTAG, "$p hat persönlichen Sperrtag am $tagName")
        }
    }
    // REGEL 1c (Erweiterung): tagesgenaue Abwesenheit
    val idx = tagIndex(woche, tagName)
    for (p in beteiligtePersonen) {
        if (idx in abwesenheiten[p].orEmpty()) {
            verstoesse += RegelVerstoß(RegelId.ABWESENHEIT, "$p ist am $tagName (Woche $woche) abwesend")
        }
    }

    // REGEL 2: Max 1 Schicht pro Woche pro Paar ODER Springer — gilt IMMER
    if (config.regeln.maxEineSchichtProWoche) {
        for ((key, d) in dienstplan) {
            if (key.first == woche) {
                if (d.paar == gewaehltesPaar)
                    verstoesse += RegelVerstoß(RegelId.WOCHE, "${gewaehltesPaar} ist in Woche $woche schon eingeteilt")
                if (springerPerson != null && d.springer == springerPerson)
                    verstoesse += RegelVerstoß(RegelId.WOCHE, "$springerPerson ist in Woche $woche schon Springer")
            }
        }
    }

    // REGEL 3: Nicht den gleichen Wochentag im Monat wiederholen (abschaltbar)
    if (entspannung < 1 && config.regeln.wochentagNurEinmal) {
        for ((key, d) in dienstplan) {
            if (key.second == tagName) {
                if (d.paar == gewaehltesPaar)
                    verstoesse += RegelVerstoß(RegelId.WOCHENTAG, "${gewaehltesPaar} hatte schon einen $tagName")
                if (springerPerson != null && d.springer == springerPerson)
                    verstoesse += RegelVerstoß(RegelId.WOCHENTAG, "$springerPerson war schon an einem $tagName Springer")
            }
        }
    }

    // REGEL 4: Kein Back-to-Back (Freitag -> Montag)
    if (entspannung < 2 && config.regeln.keinBackToBack && tagName == "Montag" && woche > 1) {
        val vorher = dienstplan[Schluessel(woche - 1, "Freitag")]
        if (vorher != null) {
            if (vorher.paar == gewaehltesPaar)
                verstoesse += RegelVerstoß(RegelId.BACK_TO_BACK, "${gewaehltesPaar} hätte Freitag→Montag Doppeldienst")
            if (springerPerson != null && vorher.springer == springerPerson)
                verstoesse += RegelVerstoß(RegelId.BACK_TO_BACK, "$springerPerson hätte Freitag→Montag Doppeldienst")
        }
    }

    // REGEL 4b (Erweiterung): Springer hart begrenzen - max 2 Einsaetze im Monat,
    // gilt UNABHAENGIG von der Entspannungsstufe (Bug: Springer waren sonst in
    // fast jeder Woche eingeteilt)
    if (springerPerson != null) {
        val einsaetzeImMonat = dienstplan.values.count { it.springer == springerPerson }
        if (einsaetzeImMonat >= 2) {
            verstoesse += RegelVerstoß(
                RegelId.FAIRNESS,
                "$springerPerson ist bereits $einsaetzeImMonat× im Monat als Springer eingeteilt (Limit 2)"
            )
        }
    }

    // REGEL 5: Springer-Präferenzen
    if (entspannung < 2 && config.regeln.springerPraeferenzen && springerPerson != null) {
        val praeferenzen = config.praeferenzen[springerPerson]
        if (!praeferenzen.isNullOrEmpty() && gewaehltesPaar !in praeferenzen) {
            verstoesse += RegelVerstoß(RegelId.PRAEFERENZ, "$springerPerson möchte nur bei: ${praeferenzen.joinToString()}")
        }
    }

    // REGEL 6: Fairness (Min 1x, Max 2x pro 2-Wochen-Block)
    if (entspannung < 1 && config.regeln.blockFairness) {
        val aktuellerBlock = if (woche <= 2) listOf(1, 2) else listOf(3, 4)
        var einsaetzePaar = 0
        var einsaetzeSpringer = 0
        for ((key, d) in dienstplan) {
            if (key.first in aktuellerBlock) {
                if (d.paar == gewaehltesPaar) einsaetzePaar++
                if (springerPerson != null && d.springer == springerPerson) einsaetzeSpringer++
            }
        }
        if (einsaetzePaar >= 2)
            verstoesse += RegelVerstoß(RegelId.FAIRNESS, "${gewaehltesPaar} hat im Block schon $einsaetzePaar Einsätze")
        if (springerPerson != null && einsaetzeSpringer >= 2)
            verstoesse += RegelVerstoß(RegelId.FAIRNESS, "$springerPerson hat im Block schon $einsaetzeSpringer Einsätze")
    }

    // REGEL 7 (Erweiterung): Monatliches Einsatzlimit pro Person (Teilzeit-Sonderfall)
    for (p in beteiligtePersonen) {
        val max = config.personMaxEinsaetze[p] ?: continue
        val bisher = dienstplan.values.count { d ->
            (d.paar == gewaehltesPaar && p in config.teams[gewaehltesPaar].orEmpty()) || d.springer == p
        }
        if (bisher >= max) {
            verstoesse += RegelVerstoß(RegelId.MAX_EINSAETZE, "$p hat sein Limit von $max Einsätzen erreicht")
        }
    }

    return verstoesse
}

// ==============================================================================
// BLOCK-FAIRNESS
// ==============================================================================
fun pruefeBlockFairness(
    dienstplan: Map<Schluessel, Dienst>,
    blockWochen: List<Int>,
    aufstellung: Aufstellung,
): Boolean {
    val geplantePaare = mutableSetOf<String>()
    val geplanteSpringer = mutableSetOf<String>()
    for ((key, d) in dienstplan) {
        if (key.first in blockWochen) {
            geplantePaare.add(d.paar)
            d.springer?.let { geplanteSpringer.add(it) }
        }
    }
    return geplantePaare.size == aufstellung.aktivePaare.size &&
        geplanteSpringer.size == aufstellung.aktiveSpringer.size
}

fun validiereDienstplan(
    config: AppConfig,
    aufstellung: Aufstellung,
    dienstplan: Map<Schluessel, Dienst>,
    abwesenheiten: Abwesenheiten = emptyMap(),
): List<String> {
    val erwarteteTage = Wochen.alle.flatMap { woche ->
        Wochentage.dienst.map { tag -> Schluessel(woche, tag) }
    }.toSet()
    if (dienstplan.keys != erwarteteTage) {
        return listOf("Der Tausch muss alle 20 geplanten Dienste enthalten.")
    }

    val validierteDienste = mutableMapOf<Schluessel, Dienst>()
    val fehler = mutableListOf<String>()
    val sortiert = dienstplan.entries.sortedWith(
        compareBy({ it.key.first }, { Wochentage.dienst.indexOf(it.key.second) })
    )
    for ((schluessel, dienst) in sortiert) {
        val (woche, tag) = schluessel
        if (dienst.paar !in aufstellung.aktivePaare) {
            fehler += "$tag, Woche $woche: Team ${dienst.paar} ist nicht verfügbar."
            continue
        }
        if (dienst.springer != null && dienst.springer !in aufstellung.aktiveSpringer) {
            fehler += "$tag, Woche $woche: Springer ${dienst.springer} ist nicht verfügbar."
            continue
        }
        val verstoesse = istGueltig(
            validierteDienste, woche, tag, dienst.paar, dienst.springer,
            config, abwesenheiten,
        )
        if (verstoesse.isNotEmpty()) {
            fehler += verstoesse.map { "$tag, Woche $woche: ${it.beschreibung}" }
        } else {
            validierteDienste[schluessel] = dienst
        }
    }

    if (config.regeln.blockFairness) {
        if (!pruefeBlockFairness(validierteDienste, listOf(1, 2), aufstellung)) {
            fehler += "Der Tausch verletzt die Fairness im ersten Zwei-Wochen-Block."
        }
        if (!pruefeBlockFairness(validierteDienste, listOf(3, 4), aufstellung)) {
            fehler += "Der Tausch verletzt die Fairness im zweiten Zwei-Wochen-Block."
        }
    }
    return fehler.distinct()
}

// ==============================================================================
// BACKTRACKING-GENERATOR
// ==============================================================================
data class PlanErgebnis(
    val plan: Map<Schluessel, Dienst>? = null,
    val entschärfteRegeln: List<String> = emptyList(),
    val versuche: Int = 0,
)

fun generiereDienstplan(
    config: AppConfig,
    aufstellung: Aufstellung,
    abwesenheiten: Abwesenheiten = emptyMap(),
    vorbelegungen: Map<Schluessel, Dienst> = emptyMap(),
): PlanErgebnis {
    if (aufstellung.aktivePaare.isEmpty()) return PlanErgebnis()

    // Vorbelegungen vorab validieren: widerspruechliche Vorbelegungen (z.B.
    // zwei Teams in derselben Woche) machen die Suche unloesbar -> sofort abbrechen
    if (config.regeln.maxEineSchichtProWoche) {
        val proWoche = mutableMapOf<Int, MutableSet<String>>()
        for ((key, d) in vorbelegungen) {
            val set = proWoche.getOrPut(key.first) { mutableSetOf() }
            if (!set.add(d.paar)) return PlanErgebnis()   // gleiches Team 2x in einer Woche
        }
    }

    val streng = config.maxVersuche == 0 || config.modus == "streng"
    val stufen = if (streng) listOf(0) else listOf(0, 1, 2)
    for (entspannung in stufen) {
        // Vorbelegungen veraendern die Loesbarkeit; mit hohem Versuchslimit +
        // Zeitdeckel bleibt die Suche bei schwierigen Vorbelegungen responsiv.
        val versuchLimit = if (config.seed != 0L) 50 else config.maxVersuche.coerceAtMost(60)
        val deadline = System.currentTimeMillis() + 10_000L   // max 10 s pro Stufe
        for (versuch in 1..versuchLimit) {
            if (System.currentTimeMillis() > deadline) break
            val seed = if (config.seed != 0L) config.seed + entspannung * 1_000_000L + versuch
                       else Random(System.nanoTime()).nextLong()
            val plan = versucheMitSeed(
                seed, config, aufstellung, abwesenheiten, vorbelegungen, entspannung
            )
            if (plan != null) {
                val entschaerft = when (entspannung) {
                    0 -> emptyList()
                    1 -> listOf("Fairness- und Wochentags-Regel gelockert (Stufe 1)")
                    else -> listOf("Fairness, Wochentage, Back-to-Back und Präferenzen gelockert (Stufe 2)")
                }
                return PlanErgebnis(plan, entschaerft, versuch)
            }
        }
    }
    return PlanErgebnis()
}

private fun versucheMitSeed(
    seed: Long,
    config: AppConfig,
    aufstellung: Aufstellung,
    abwesenheiten: Abwesenheiten,
    vorbelegungen: Map<Schluessel, Dienst>,
    entspannung: Int,
): Map<Schluessel, Dienst>? {
    val alleTage = Wochen.alle.flatMap { w -> Wochentage.dienst.map { Schluessel(w, it) } }
    val dienstplan = mutableMapOf<Schluessel, Dienst>()
    dienstplan.putAll(vorbelegungen)
    // 6 s Budget pro Versuch: verhindert Endlos-Rechnen bei widerspruechlichen
    // Vorbelegungen (das war der eingefrorene "rechnet..."-Button)
    val deadline = System.currentTimeMillis() + 6_000L

    // wie im Python-Original: vollständige rekursive Suche über alle Optionen
    // mit Zeitdeckel: nach 'budgetMs' Millisekunden wird dieser Versuch abgebrochen
    fun suchen(index: Int, random: Random, tiefe: Int): Map<Schluessel, Dienst>? {
        if (tiefe > 200) return null   // Schutz vor Extremfällen
        if (System.currentTimeMillis() > deadline) return null
        var i = index
        while (i < alleTage.size && alleTage[i] in dienstplan) i++

        if (i == 10 && config.regeln.blockFairness && !pruefeBlockFairness(dienstplan, listOf(1, 2), aufstellung)) return null
        if (i == alleTage.size) {
            return if (!config.regeln.blockFairness || pruefeBlockFairness(dienstplan, listOf(3, 4), aufstellung)) dienstplan else null
        }

        val (woche, tagName) = alleTage[i]
        val optionen = buildList {
            for (p in aufstellung.aktivePaare.keys.shuffled(random)) {
                for (s in aufstellung.aktiveSpringer.shuffled(random) + listOf<String?>(null)) {
                    add(p to s)
                }
            }
        }.shuffled(random)

        for ((paar, springer) in optionen) {
            val verstoesse = istGueltig(
                dienstplan, woche, tagName, paar, springer, config, abwesenheiten, entspannung
            )
            if (verstoesse.isEmpty()) {
                dienstplan[alleTage[i]] = Dienst(paar, springer)
                val ergebnis = suchen(i + 1, random, tiefe + 1)
                if (ergebnis != null) return ergebnis
                dienstplan.remove(alleTage[i])
            }
        }
        return null
    }

    return suchen(0, Random(seed), 0)
}
