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

private fun tagIdx(s: Schluessel): Int = tagIndex(s.first, s.second)

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
/** Klassenarbeits-Lookup (#53): Index -> betroffene Personennamen */
interface KlassenArbeitLookup {
    fun betroffene(tagIdx: Int): Set<String>
}

fun istGueltig(
    dienstplan: Map<Schluessel, Dienst>,
    woche: Int,
    tagName: String,
    gewaehltesPaar: String,
    springerPerson: String?,
    config: AppConfig,
    abwesenheiten: Abwesenheiten,
    entspannung: Int = 0,
    klassenArbeiten: KlassenArbeitLookup? = null,
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
    // REGEL 1d (#53): Klassenarbeit am selben Tag = harte Regel (nie lockerbar).
    // Die Termine werden als Parameter uebergeben (siehe istGueltig-Signatur).
    if (config.regeln.klassenarbeitHart && klassenArbeiten != null) {
        val personenMitArbeit = klassenArbeiten.betroffene(tagIndex(woche, tagName))
        for (p in beteiligtePersonen) {
            if (p in personenMitArbeit) {
                verstoesse += RegelVerstoß(RegelId.SPERRTAG, "$p hat am $tagName eine Klassenarbeit (harte Regel)")
            }
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
    /** Konkrete Konflikte bei den Vorbelegungen (leer = ok). */
    val vorbelegungsProbleme: List<String> = emptyList(),
    /** Erklärbare Planung (#44): Abweichungen, die bewusst akzeptiert wurden */
    val erklaerungen: List<String> = emptyList(),
)

/**
 * Prueft Vorbelegungen auf Konflikte (#51): gleiche Woche, gleicher Tag doppelt,
 * Sperrtag-Verstoss, abwesende Personen, unregelkonforme Kombinationen.
 */
fun validiereVorbelegungen(
    config: AppConfig,
    aufstellung: Aufstellung,
    vorbelegungen: Map<Schluessel, Dienst>,
    gesperrteTage: Set<Int>,
): List<String> {
    val probleme = mutableListOf<String>()

    for ((key, d) in vorbelegungen) {
        val (woche, tag) = key
        val idx = tagIndex(woche, tag)

        // Gesperrter Tag mit Vorbelegung
        if (idx in gesperrteTage) {
            probleme += "Vorbelegung W$woche/$tag kollidiert mit gesperrtem Tag (kein Dienst)"
        }
        // Team existiert nicht / ist ausgefallen
        if (d.paar !in aufstellung.aktivePaare) {
            probleme += "Team '${d.paar}' ist nicht aktiv (ausgefallen oder unbekannt) — Vorbelegung W$woche/$tag"
        }
        // Springer unbekannt
        d.springer?.let { s ->
            if (s !in aufstellung.aktiveSpringer) {
                probleme += "Springer '$s' ist nicht verfügbar — Vorbelegung W$woche/$tag"
            }
        }
        // Sperrtag des Teams
        if (config.regeln.teamSperrtageAktiv && tag in config.teamSperrtage[d.paar].orEmpty()) {
            probleme += "'${d.paar}' hat Sperrtag am $tag — Vorbelegung W$woche/$tag verletzt die Regel"
        }
    }

    // Gleiches Team mehrmals in derselben Woche
    if (config.regeln.maxEineSchichtProWoche) {
        val proWoche = mutableMapOf<Int, MutableSet<String>>()
        for ((key, d) in vorbelegungen) {
            val set = proWoche.getOrPut(key.first) { mutableSetOf() }
            if (!set.add(d.paar)) {
                probleme += "'${d.paar}' ist mehrfach in Woche ${key.first} vorbelegt"
            }
        }
        // Doppelt vergebene Tage (verschiedene Teams am selben Tag)
        val tageDoppelt = vorbelegungen.keys.groupBy { it }.filterValues { it.size > 1 }
        tageDoppelt.keys.forEach { (w, t) ->
            probleme += "Tag W$w/$t ist doppelt vorbelegt"
        }
    }

    return probleme
}

fun generiereDienstplan(
    config: AppConfig,
    aufstellung: Aufstellung,
    abwesenheiten: Abwesenheiten = emptyMap(),
    vorbelegungen: Map<Schluessel, Dienst> = emptyMap(),
    gesperrteTage: Set<Int> = emptySet(),
    klassenArbeiten: KlassenArbeitLookup? = null,
    fortschritt: ((String) -> Unit)? = null,
): PlanErgebnis {
    if (aufstellung.aktivePaare.isEmpty() && gesperrteTage.size < 10) return PlanErgebnis()

    // Vorbelegungen vorab validieren (#51)
    val probleme = validiereVorbelegungen(config, aufstellung, vorbelegungen, gesperrteTage)
    // Inaktive Teams/Springer: NICHT blockieren — Vorbelegungen mit ausgefallenem
    // Team werden ignoriert statt alles scheitern zu lassen ("immer Fehler"-Falle)
    val hart = probleme.filterNot {
        it.contains("nicht aktiv") || it.contains("nicht verfügbar")
    }
    if (hart.isNotEmpty()) return PlanErgebnis(vorbelegungsProbleme = hart)
    val nutzbare = vorbelegungen.filter { (_, d) ->
        d.paar in aufstellung.aktivePaare &&
            (d.springer == null || d.springer in aufstellung.aktiveSpringer)
    }
    return generiereMitVorbelegungen(config, aufstellung, abwesenheiten, nutzbare, gesperrteTage, klassenArbeiten, fortschritt)
}

private fun generiereMitVorbelegungen(
    config: AppConfig,
    aufstellung: Aufstellung,
    abwesenheiten: Abwesenheiten,
    vorbelegungen: Map<Schluessel, Dienst>,
    gesperrteTage: Set<Int>,
    klassenArbeiten: KlassenArbeitLookup?,
    fortschritt: ((String) -> Unit)? = null,
): PlanErgebnis {

    val streng = config.maxVersuche == 0 || config.modus == "streng"
    val stufen = if (streng) listOf(0) else listOf(0, 1, 2)
    val stufenNamen = mapOf(0 to "mit allen Regeln", 1 to "mit gelockerter Fairness", 2 to "mit gelockerten Weichregeln")
    for (entspannung in stufen) {
        // Vorbelegungen veraendern die Loesbarkeit; mit hohem Versuchslimit +
        // Zeitdeckel bleibt die Suche bei schwierigen Vorbelegungen responsiv.
        val versuchLimit = if (config.seed != 0L) 50 else config.maxVersuche.coerceAtMost(60)
        val deadline = System.currentTimeMillis() + 10_000L   // max 10 s pro Stufe
        for (versuch in 1..versuchLimit) {
            if (System.currentTimeMillis() > deadline) break
            fortschritt?.invoke("Versuch $versuch/${versuchLimit.coerceAtMost(20)} ${stufenNamen[entspannung]}")
            val seed = if (config.seed != 0L) config.seed + entspannung * 1_000_000L + versuch
                       else Random(System.nanoTime()).nextLong()
            val plan = versucheMitSeed(
                seed, config, aufstellung, abwesenheiten, vorbelegungen, entspannung, gesperrteTage, klassenArbeiten
            )
            if (plan != null) {
                val entschaerft = when (entspannung) {
                    0 -> emptyList()
                    1 -> listOf(
                        "Fairness- und Wochentags-Regel gelockert (Stufe 1)",
                        "Warum: Mit allen Regeln war kein Plan möglich — diese Erleichterung war nötig."
                    )
                    else -> listOf(
                        "Fairness, Wochentage, Back-to-Back und Präferenzen gelockert (Stufe 2)",
                        "Warum: Selbst mit Stufe 1 war kein Plan möglich. Sperrtage blieben immer aktiv."
                    )
                }
                // Erklärbare Planung (#44): Engagement-Bilanz beifügen
                val erklaerungen = entschaerft.toMutableList()
                val einsaetzeProPaar = plan.values.groupingBy { it.paar }.eachCount()
                val min = einsaetzeProPaar.values.minOrNull() ?: 0
                val max = einsaetzeProPaar.values.maxOrNull() ?: 0
                if (max - min > 1) {
                    erklaerungen.add("Einsatzverteilung: mind. $min×, max. $max× pro Team (Differenz $max-min) — durch Vorbelegungen/Ausfälle bedingt")
                }
                if (gesperrteTage.isNotEmpty()) {
                    erklaerungen.add("${gesperrteTage.size} Tag(e) ohne Dienst (schulfrei etc.) berücksichtigt")
                }
                return PlanErgebnis(plan, entschaerft, versuch, erklaerungen = erklaerungen)
            }
        }
    }
    return PlanErgebnis()
}

/**
 * Schnelle Regelpruefung mit Zaehler-Struktur (Performance-Fix).
 * Semantik identisch zu istGueltig, aber ohne volles Plan-Durchlaufen.
 */
private fun pruefeSchnell(
    woche: Int,
    tag: String,
    paar: String,
    springer: String?,
    config: AppConfig,
    abwesenheiten: Abwesenheiten,
    entspannung: Int,
    proWochePaar: Map<Int, Set<String>>,
    proWocheSpringer: Map<Int, Set<String>>,
    proTagPaar: Map<String, Set<String>>,
    proTagSpringer: Map<String, Set<String>>,
    einsaetzeProPaar: Map<String, Int>,
    einsaetzeProSpringer: Map<String, Int>,
    einsaetzeProBlock: Map<String, Int>,
    letzerFreitagPaar: String?,
    springerLetzterFreitag: String?,
    klassenArbeiten: KlassenArbeitLookup?,
): Boolean {
    // Regel 1: Team-Sperrtage + Personen-Sperrtage + Abwesenheiten
    if (config.regeln.teamSperrtageAktiv && tag in config.teamSperrtage[paar].orEmpty()) return false
    val beteiligte = config.teams[paar].orEmpty() + listOfNotNull(springer)
    for (p in beteiligte) {
        if (tag in config.personSperrtage[p].orEmpty()) return false
        val idx = tagIndex(woche, tag)
        if (idx in abwesenheiten[p].orEmpty()) return false
        // #53: Klassenarbeit = harte Regel
        if (klassenArbeiten != null && p in klassenArbeiten.betroffene(idx)) return false
    }
    // Regel 2: max 1 Schicht pro Woche
    if (config.regeln.maxEineSchichtProWoche) {
        if (paar in proWochePaar[woche].orEmpty()) return false
        if (springer != null && springer in proWocheSpringer[woche].orEmpty()) return false
    }
    // Regel 3: Wochentag nur 1x im Monat
    if (entspannung < 1 && config.regeln.wochentagNurEinmal) {
        if (paar in proTagPaar[tag].orEmpty()) return false
        if (springer != null && springer in proTagSpringer[tag].orEmpty()) return false
    }
    // Regel 4: Back-to-Back Freitag->Montag
    if (entspannung < 2 && config.regeln.keinBackToBack && tag == "Montag" && woche > 1) {
        if (letzerFreitagPaar == paar) return false
        if (springer != null && springerLetzterFreitag == springer) return false
    }
    // Regel 5: Praeferenzen
    if (entspannung < 2 && config.regeln.springerPraeferenzen && springer != null) {
        val pr = config.praeferenzen[springer]
        if (!pr.isNullOrEmpty() && paar !in pr) return false
    }
    // Regel 6: Fairness pro Block (exakt via Block-Zaehler)
    if (entspannung < 1 && config.regeln.blockFairness) {
        val block = if (woche <= 2) "1" else "2"
        if ((einsaetzeProBlock["p|$paar|$block"] ?: 0) >= 2) return false
        if (springer != null && (einsaetzeProBlock["s|$springer|$block"] ?: 0) >= 2) return false
    }
    // Springer-Limit (max 2/Monat)
    if (springer != null && (einsaetzeProSpringer[springer] ?: 0) >= 2) return false
    // Regel 7: Einsatz-Limits pro Person
    for (p in beteiligte) {
        val max = config.personMaxEinsaetze[p] ?: continue
        val bisher = if (p in config.teams[paar].orEmpty()) einsaetzeProPaar[paar] ?: 0
                     else einsaetzeProSpringer[p] ?: 0
        if (bisher >= max) return false
    }
    return true
}

private fun versucheMitSeed(
    seed: Long,
    config: AppConfig,
    aufstellung: Aufstellung,
    abwesenheiten: Abwesenheiten,
    vorbelegungen: Map<Schluessel, Dienst>,
    entspannung: Int,
    gesperrteTage: Set<Int>,
    klassenArbeiten: KlassenArbeitLookup?,
): Map<Schluessel, Dienst>? {
    val alleTage = Wochen.alle.flatMap { w -> Wochentage.dienst.map { Schluessel(w, it) } }
    val dienstplan = mutableMapOf<Schluessel, Dienst>()
    dienstplan.putAll(vorbelegungen)
    // 6 s Budget pro Versuch: verhindert Endlos-Rechnen bei widerspruechlichen
    // Vorbelegungen (das war der eingefrorene "rechnet..."-Button)
    val deadline = System.currentTimeMillis() + 6_000L

    // Performance-Fix: Zaehler-Struktur statt vollem Plan-Durchlauf pro Option.
    // isGueltig iteriert sonst den ganzen Plan (20 Eintraege) * 30 Optionen pro
    // Knoten - das explodiert exponentiell im Backtracking.
    var proWochePaar = mutableMapOf<Int, MutableSet<String>>()
    var proWocheSpringer = mutableMapOf<Int, MutableSet<String>>()
    var proTagPaar = mutableMapOf<String, MutableSet<String>>()
    var proTagSpringer = mutableMapOf<String, MutableSet<String>>()
    var einsaetzeProPaar = mutableMapOf<String, Int>()
    var einsaetzeProSpringer = mutableMapOf<String, Int>()
    var einsaetzeProBlock = mutableMapOf<String, Int>()   // Key: "paar|1", "springer|2"
    var springerLetzterFreitag: String? = null
    var letzerFreitagPaar: String? = null   // paar des Freitags der vorigen Woche

    fun registriere(woche: Int, tag: String, d: Dienst) {
        proWochePaar.getOrPut(woche) { mutableSetOf() }.add(d.paar)
        d.springer?.let { proWocheSpringer.getOrPut(woche) { mutableSetOf() }.add(it) }
        proTagPaar.getOrPut(tag) { mutableSetOf() }.add(d.paar)
        d.springer?.let { proTagSpringer.getOrPut(tag) { mutableSetOf() }.add(it) }
        einsaetzeProPaar[d.paar] = (einsaetzeProPaar[d.paar] ?: 0) + 1
        d.springer?.let { einsaetzeProSpringer[it] = (einsaetzeProSpringer[it] ?: 0) + 1 }
        val block = if (woche <= 2) "1" else "2"
        einsaetzeProBlock["p|${d.paar}|$block"] = (einsaetzeProBlock["p|${d.paar}|$block"] ?: 0) + 1
        d.springer?.let {
            einsaetzeProBlock["s|$it|$block"] = (einsaetzeProBlock["s|$it|$block"] ?: 0) + 1
        }
        if (tag == "Freitag") {
            letzerFreitagPaar = d.paar
            springerLetzterFreitag = d.springer
        }
    }

    fun entferne(woche: Int, tag: String, d: Dienst) {
        proWochePaar.getOrPut(woche) { mutableSetOf() }.remove(d.paar)
        d.springer?.let { proWocheSpringer.getOrPut(woche) { mutableSetOf() }.remove(it) }
        proTagPaar.getOrPut(tag) { mutableSetOf() }.remove(d.paar)
        d.springer?.let { proTagSpringer.getOrPut(tag) { mutableSetOf() }.remove(it) }
        einsaetzeProPaar[d.paar] = (einsaetzeProPaar[d.paar] ?: 1) - 1
        d.springer?.let { einsaetzeProSpringer[it] = (einsaetzeProSpringer[it] ?: 1) - 1 }
        val block = if (woche <= 2) "1" else "2"
        einsaetzeProBlock["p|${d.paar}|$block"] = (einsaetzeProBlock["p|${d.paar}|$block"] ?: 1) - 1
        d.springer?.let {
            einsaetzeProBlock["s|$it|$block"] = (einsaetzeProBlock["s|$it|$block"] ?: 1) - 1
        }
    }

    for ((key, d) in dienstplan) registriere(key.first, key.second, d)

    // wie im Python-Original: vollständige rekursive Suche über alle Optionen
    // mit Zeitdeckel: nach 'budgetMs' Millisekunden wird dieser Versuch abgebrochen
    fun suchen(index: Int, random: Random, tiefe: Int): Map<Schluessel, Dienst>? {
        if (tiefe > 200) return null   // Schutz vor Extremfällen
        if (System.currentTimeMillis() > deadline) return null
        var i = index
        while (i < alleTage.size && (alleTage[i] in dienstplan || tagIdx(alleTage[i]) in gesperrteTage)) i++

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
            // Schnellpruefung ueber Zaehler statt vollem Plan-Durchlauf
            val schnellOk = pruefeSchnell(
                woche, tagName, paar, springer, config, abwesenheiten, entspannung,
                proWochePaar, proWocheSpringer, proTagPaar, proTagSpringer,
                einsaetzeProPaar, einsaetzeProSpringer, einsaetzeProBlock,
                letzerFreitagPaar, springerLetzterFreitag, klassenArbeiten
            )
            if (schnellOk) {
                val d = Dienst(paar, springer)
                dienstplan[alleTage[i]] = d
                registriere(woche, tagName, d)
                val ergebnis = suchen(i + 1, random, tiefe + 1)
                if (ergebnis != null) return ergebnis
                dienstplan.remove(alleTage[i])
                entferne(woche, tagName, d)
            }
        }
        return null
    }

    return suchen(0, Random(seed), 0)
}
