package com.fabian.sanialarmplaner.viewmodel

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.fabian.sanialarmplaner.data.*
import com.fabian.sanialarmplaner.logic.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.time.LocalDate
import java.time.YearMonth

/** UI-Darstellung eines Schicht-Eintrags im Plan. */
/** Vorschau eines Imports vor der Uebernahme. */
data class ImportVorschau(
    val importPersonen: Int,
    val neuePersonen: List<String>,
    val aktualisiertePersonen: List<String>,
    val dubletten: List<String>,
    val neueHistorie: Int,
    val neueSperrtage: Int,
    val ziel: SaniteamDatei,
)

data class PlanEintrag(
    val woche: Int,
    val tag: String,
    val paar: String?,
    val springer: String?,
    val mitglieder: List<String>,
    val vorbelegt: Boolean,
    val gesperrt: Boolean = false,     // kein Dienst an diesem Tag (z.B. schulfrei)
    val vertretungHinweis: String? = null,
) {
    /** Convenience: true wenn dieser Slot einen Dienst hat. */
    val hatDienst: Boolean get() = paar != null && !gesperrt
}

data class VertretungsVorschlag(
    val name: String,
    val ausSpringerReserve: Boolean,
    val belastungsIndex: Double,
)

/** Statistik-Datensatz pro Person. */
data class PersonenStatistik(
    val name: String,
    val geplant: Int = 0,
    val historisch: Int = 0,
    val monateDabei: Int = 0,
    val ausbildungJahre: Double = 0.0,
    /** Index: geplant+historisch normalisiert auf Mitgliedsdauer & Ausbildung */
    val belastungsIndex: Double = 0.0,
)

data class UiState(
    val datei: SaniteamDatei = SaniteamDatei(),
    val config: AppConfig = AppConfig(),
    val kranke: Set<String> = emptySet(),
    val abwesenheiten: Map<String, Set<Int>> = emptyMap(),
    val vorbelegungen: Map<Pair<Int, String>, Dienst> = emptyMap(),
    /** Tage an denen GAR KEIN Dienst stattfindet (z.B. schulfrei): Indizes 0..19 */
    val gesperrteTage: Set<Int> = emptySet(),
    val plan: List<PlanEintrag> = emptyList(),
    val hinweise: List<String> = emptyList(),
    val fehler: String? = null,
    val laeuft: Boolean = false,
    /** Zeitraum-Filter fuer Statistik, null = alles */
    val statistikVon: LocalDate? = null,
    val statistikBis: LocalDate? = null,
    /** Monat, fuer den der Plan erstellt wird (1. des Monats) */
    val planMonat: YearMonth = YearMonth.now(),
    /** Wer bin ich: voller Name der Person fuer Profil + persoenliche Erinnerungen */
    val ich: String = "",
    /** Standardsortierung der Personen-Kartei: "nachname"|"vorname"|"klasse"|"ausbildung" */
    val karteiSortierung: String = "nachname",
)

class PlanerViewModel(private val store: ConfigStore, private val saniteamStore: SaniteamStore) {

    var state by mutableStateOf(UiState())
        private set

    private val speicher = SaniteamSpeicher()

    init {
        val prefs = store.prefsFuerIch()
        state = state.copy(
            config = store.laden(),
            // Gespeicherte .saniteam-Daten laden (ueberlebt App-Neustart)
            datei = saniteamStore.laden() ?: SaniteamDatei(),
            ich = prefs,
            karteiSortierung = store.prefsKarteiSortierung(),
            // Gesperrte Tage aus der .saniteam-Einstellung laden (#39-Persistenz)
            gesperrteTage = (saniteamStore.laden() ?: SaniteamDatei()).einstellung.gesperrteTage,
        )
        configAusDatei()
    }

    fun setzeIch(name: String) {
        state = state.copy(ich = name)
        store.speichereIch(name)
    }

    fun setzeKarteiSortierung(s: String) {
        state = state.copy(karteiSortierung = s)
        store.speichereKarteiSortierung(s)
    }

    // ------------------------------------------------------------------
    // SANITEAM-DATEI (Personen, Teams, Historie)
    // ------------------------------------------------------------------

    private var saniteamSpeicherOrt: SaniteamStore? = saniteamStore

    /** Persistenz-Speicher injizieren (optional, wird von MainActivity gesetzt). */
    fun setSaniteamStore(s: SaniteamStore) {
        saniteamSpeicherOrt = s
    }

    // ------------------------------------------------------------------
    // MEHRERE GRUPPEN (#29)
    // ------------------------------------------------------------------

    fun gruppen(): List<String> = saniteamStore.gruppen()

    fun aktiveGruppe(): String = saniteamStore.aktiveGruppe()

    fun gruppeWechseln(name: String) {
        saniteamStore.setzeAktiveGruppe(name)
        state = state.copy(
            datei = saniteamStore.laden(name) ?: SaniteamDatei(),
            plan = emptyList(),
            kranke = emptySet(),
            abwesenheiten = emptyMap(),
            vorbelegungen = emptyMap(),
            gesperrteTage = emptySet(),
            hinweise = listOf("Gruppe '$name' geladen"),
        )
        configAusDatei()
    }

    fun neueGruppe(name: String): Boolean {
        val ok = saniteamStore.neueGruppe(name.trim())
        if (ok) gruppeWechseln(name.trim())
        return ok
    }

    fun loescheGruppe(name: String): Boolean {
        val ok = saniteamStore.loescheGruppe(name)
        if (ok && name == aktiveGruppe()) gruppeWechseln("Standard")
        return ok
    }

    // ------------------------------------------------------------------
    // BACKUPS (#50)
    // ------------------------------------------------------------------

    fun backupListe(): List<String> = saniteamStore.backups()

    fun backupWiederherstellen(name: String): Boolean {
        val d = saniteamStore.wiederherstellen(name) ?: return false
        state = state.copy(datei = d)
        configAusDatei()
        return true
    }

    fun updateDatei(transform: (SaniteamDatei) -> SaniteamDatei) {
        state = state.copy(datei = transform(state.datei))
        // Jede Daten-Aenderung sofort dauerhaft speichern
        saniteamSpeicherOrt?.speichern(state.datei)
        configAusDatei()
    }

    /** Baut die AppConfig VOLLSTAENDIG aus der Kartei neu auf - keine Reste
     *  von aenderungen (z.B. alte Namen ohne Nachnamen) bleiben erhalten. */
    private fun configAusDatei() {
        val d = state.datei
        val teams = d.ableiteTeams()
        state = state.copy(
            config = AppConfig(
                teams = teams,
                springer = d.ableiteSpringer(),
                praeferenzen = d.einstellung.praeferenzen,
                teamSperrtage = d.einstellung.teamSperrtage,
                personSperrtage = d.einstellung.personSperrtage,
                personMaxEinsaetze = d.einstellung.personMaxEinsaetze,
                regeln = d.einstellung.regeln,
                modus = d.einstellung.modus,
                seed = d.einstellung.seed,
                maxVersuche = d.einstellung.maxVersuche,
            )
        )
    }

    fun updateConfig(transform: (AppConfig) -> AppConfig) {
        state = state.copy(config = transform(state.config))
        // Config-Aenderungen in die .saniteam-Einstellung zurueckschreiben und
        // PERSISTIEREN (das fehlte: Settings waren nach Neustart weg)
        val c = state.config
        state = state.copy(datei = state.datei.copy(
            einstellung = state.datei.einstellung.copy(
                praeferenzen = c.praeferenzen,
                teamSperrtage = c.teamSperrtage,
                personSperrtage = c.personSperrtage,
                personMaxEinsaetze = c.personMaxEinsaetze,
                regeln = c.regeln,
                modus = c.modus,
                seed = c.seed,
                maxVersuche = c.maxVersuche,
            )
        ))
        saniteamSpeicherOrt?.speichern(state.datei)
        store.speichern(c)
    }

    fun exportSaniteam(): String = speicher.serialisieren(state.datei)

    fun importSaniteam(text: String): Boolean {
        val d = speicher.deserialisieren(text) ?: return false
        state = state.copy(datei = d)
        configAusDatei()
        return true
    }

    /** Von MainActivity aufgerufen: .saniteam-Datei aus Intent oeffnen. */
    fun pruefeOeffnungAnfordern(text: String) {
        val vorschau = analyseImport(text) ?: run {
            // Ggf. eine historie-only- oder defekte Datei: nur melden
            _oeffnungsMeldung = "Datei konnte nicht als .saniteam gelesen werden."
            return
        }
        _oeffnungsVorschau = vorschau
    }

    var _oeffnungsVorschau by mutableStateOf<ImportVorschau?>(null)
        private set
    var _oeffnungsMeldung by mutableStateOf<String?>(null)
        private set

    fun schliesseOeffnungsDialog() {
        _oeffnungsVorschau = null
        _oeffnungsMeldung = null
    }

    // ------------------------------------------------------------------
    // IMPORT MIT VORSCHAU + ZUSAMMENFUEHREN (Dubletten-Filter)
    // ------------------------------------------------------------------

    /**
     * Analysiert eine importierte Datei, OHNE sie zu uebernehmen.
     * Liefert Vorschau-Infos und die gemergte (deduplizierte) Ziel-Datei.
     */
    fun analyseImport(text: String): ImportVorschau? {
        val import = speicher.deserialisieren(text) ?: return null
        val vorhanden = state.datei.personen.map { normalisiereName(it.vollerName()) }.toSet()

        val neue = mutableListOf<Person>()
        val aktualisiert = mutableListOf<String>()
        val dubletten = mutableListOf<String>()
        for (p in import.personen) {
            val key = normalisiereName(p.vollerName())
            when {
                key !in vorhanden -> neue.add(p)
                else -> {
                    // gleicher Name: nur uebernehmen, wenn Import- Eintrag mehr Infos hat
                    val alt = state.datei.personen.first {
                        normalisiereName(it.vollerName()) == key
                    }
                    if (istReicher(p, alt)) aktualisiert.add(p.vollerName())
                    else dubletten.add(p.vollerName())
                }
            }
        }

        // Gemergte Datei erzeugen
        val gemergtePersonen = state.datei.personen + neue
        val gemergteEinstellung = mergeEinstellung(state.datei.einstellung, import.einstellung)
        val gemergteHistorie = (state.datei.historie + import.historie)
            .distinctBy { it.datum }

        val ziel = SaniteamDatei(
            formatVersion = maxOf(state.datei.formatVersion, import.formatVersion),
            personen = gemergtePersonen,
            einstellung = gemergteEinstellung,
            historie = gemergteHistorie,
        )
        return ImportVorschau(
            importPersonen = import.personen.size,
            neuePersonen = neue.map { it.vollerName() },
            aktualisiertePersonen = aktualisiert,
            dubletten = dubletten,
            neueHistorie = import.historie.size,
            neueSperrtage = import.einstellung.teamSperrtage.size,
            ziel = ziel,
        )
    }

    fun uebernehmeImport(vorschau: ImportVorschau) {
        state = state.copy(datei = vorschau.ziel)
        // Import dauerhaft speichern
        saniteamSpeicherOrt?.speichern(state.datei)
        configAusDatei()
    }

    private fun normalisiereName(name: String): String =
        name.lowercase().replace(" ", "").replace(".", "")

    /** true, wenn 'neu' mehr ausgefuellte Felder hat als 'alt'. */
    private fun istReicher(neu: Person, alt: Person): Boolean {
        fun score(p: Person): Int = listOf(
            p.nachname, p.klasse, p.geschlecht, p.bevorzugterPartner,
            p.seit, p.telefon, p.email, p.anmerkung
        ).count { it.isNotBlank() }
        return score(neu) > score(alt)
    }

    private fun mergeEinstellung(alt: PlanEinstellung, neu: PlanEinstellung): PlanEinstellung = alt.copy(
        springerNamen = (alt.springerNamen + neu.springerNamen).distinct(),
        praeferenzen = alt.praeferenzen + neu.praeferenzen,
        teamSperrtage = alt.teamSperrtage + neu.teamSperrtage,
        personSperrtage = alt.personSperrtage + neu.personSperrtage,
        personMaxEinsaetze = alt.personMaxEinsaetze + neu.personMaxEinsaetze,
        regeln = neu.regeln,   // Regeln: Import gewinnt (bewusst)
    )

    // ------------------------------------------------------------------
    // PLANUNG
    // ------------------------------------------------------------------

    fun toggleKrank(person: String) {
        val neue = state.kranke.toMutableSet()
        if (!neue.add(person)) neue.remove(person)
        state = state.copy(kranke = neue)
    }

    fun toggleAbwesenheit(person: String, index: Int) {
        val aktuell = state.abwesenheiten[person].orEmpty().toMutableSet()
        if (!aktuell.add(index)) aktuell.remove(index)
        state = state.copy(abwesenheiten = state.abwesenheiten + (person to aktuell))
    }

    fun vertretungsDienste(person: String): List<PlanEintrag> =
        state.plan.filter { person in it.mitglieder }

    fun vertretungsVorschlaege(eintrag: PlanEintrag, abwesend: String): List<VertretungsVorschlag> {
        if (abwesend !in eintrag.mitglieder) return emptyList()

        val verbleibendeMitglieder = eintrag.mitglieder - abwesend
        val teamHatAusgebildetePerson = state.datei.personen.any {
            it.vollerName() in verbleibendeMitglieder && it.ausbildungAbgeschlossen
        }
        val andereDienste = state.plan.filterNot {
            it.woche == eintrag.woche && it.tag == eintrag.tag
        }
        val block = if (eintrag.woche <= 2) setOf(1, 2) else setOf(3, 4)
        val heute = LocalDate.now()
        val historie = historieGefiltert()

        return state.datei.personen.asSequence()
            .filter { it.aktiv }
            .map { person ->
                val name = person.vollerName()
                val geplante = andereDienste.count { name in it.mitglieder }
                val historische = historie.count { name in it.personNamen }
                val gesamt = geplante + historische
                val monate = try {
                    if (person.seit.isBlank()) 0
                    else java.time.Period.between(YearMonth.parse(person.seit).atDay(1), heute)
                        .toTotalMonths().toInt()
                } catch (_: Exception) {
                    0
                }
                val faktor = if (person.ausbildungAbgeschlossen) 1.2 else 1.0
                val index = if (monate > 0) (gesamt * faktor) / monate else gesamt * faktor * 2.0
                Triple(person, name, index)
            }
            .filter { (person, name, _) ->
                if (name == abwesend || name in eintrag.mitglieder || name in state.kranke) return@filter false
                if (eintrag.tag in state.config.personSperrtage[name].orEmpty()) return@filter false
                if (tagIndex(eintrag.woche, eintrag.tag) in state.abwesenheiten[name].orEmpty()) return@filter false
                if (!teamHatAusgebildetePerson && !person.ausbildungAbgeschlossen) return@filter false

                if (state.config.regeln.maxEineSchichtProWoche &&
                    andereDienste.any { it.woche == eintrag.woche && name in it.mitglieder }
                ) return@filter false
                if (state.config.regeln.wochentagNurEinmal &&
                    andereDienste.any { it.tag == eintrag.tag && name in it.mitglieder }
                ) return@filter false
                if (state.config.regeln.keinBackToBack && eintrag.tag == "Montag" && eintrag.woche > 1 &&
                    state.plan.any { it.woche == eintrag.woche - 1 && it.tag == "Freitag" && name in it.mitglieder }
                ) return@filter false
                if (state.config.regeln.blockFairness &&
                    andereDienste.count { it.woche in block && name in it.mitglieder } >= 2
                ) return@filter false
                val maxEinsaetze = state.config.personMaxEinsaetze[name]
                if (maxEinsaetze != null && geplanteEinsaetze(name) >= maxEinsaetze) return@filter false
                true
            }
            .map { (_, name, index) ->
                VertretungsVorschlag(name, name in state.config.springer, index)
            }
            .sortedWith(compareBy<VertretungsVorschlag>({ !it.ausSpringerReserve }, { it.belastungsIndex }, { it.name }))
            .toList()
    }

    fun ersetzePersonImPlan(eintrag: PlanEintrag, abwesend: String, vertretung: String): Boolean {
        if (vertretungsVorschlaege(eintrag, abwesend).none { it.name == vertretung }) return false

        state = state.copy(
            plan = state.plan.map { aktuell ->
                if (aktuell.woche == eintrag.woche && aktuell.tag == eintrag.tag) {
                    aktuell.copy(
                        springer = if (aktuell.springer == abwesend) vertretung else aktuell.springer,
                        mitglieder = aktuell.mitglieder.map { if (it == abwesend) vertretung else it },
                        vertretungHinweis = "$abwesend → $vertretung",
                    )
                } else aktuell
            }
        )
        return true
    }

    fun tauscheDienste(erste: Schluessel, zweite: Schluessel): List<String> {
        if (erste == zweite) return listOf("Bitte zwei unterschiedliche Dienste auswählen.")
        if (state.plan.any { it.vertretungHinweis != null }) {
            return listOf("Bei manuellen Vertretungen kann der Plan derzeit nicht sicher getauscht werden.")
        }
        val ersterEintrag = state.plan.firstOrNull { it.woche == erste.first && it.tag == erste.second }
            ?: return listOf("Der erste Dienst ist nicht mehr im Plan.")
        val zweiterEintrag = state.plan.firstOrNull { it.woche == zweite.first && it.tag == zweite.second }
            ?: return listOf("Der zweite Dienst ist nicht mehr im Plan.")
        if (ersterEintrag.vorbelegt || zweiterEintrag.vorbelegt) {
            return listOf("Vorbelegte Dienste können nicht getauscht werden.")
        }
        if (ersterEintrag.vertretungHinweis != null || zweiterEintrag.vertretungHinweis != null) {
            return listOf("Dienste mit manueller Vertretung können nicht getauscht werden.")
        }

        val neuerPlan = state.plan.map { eintrag ->
            when {
                eintrag.woche == erste.first && eintrag.tag == erste.second ->
                    eintrag.copy(
                        paar = zweiterEintrag.paar,
                        springer = zweiterEintrag.springer,
                        mitglieder = zweiterEintrag.mitglieder,
                    )
                eintrag.woche == zweite.first && eintrag.tag == zweite.second ->
                    eintrag.copy(
                        paar = ersterEintrag.paar,
                        springer = ersterEintrag.springer,
                        mitglieder = ersterEintrag.mitglieder,
                    )
                else -> eintrag
            }
        }
        val aufstellung = verarbeiteAufstellung(state.config, state.kranke, state.abwesenheiten)
        val fehler = validiereDienstplan(
            state.config,
            aufstellung,
            neuerPlan.filter { !it.gesperrt && it.paar != null }
                .associate { (it.woche to it.tag) to Dienst(it.paar!!, it.springer) },
            state.abwesenheiten,
        )
        if (fehler.isNotEmpty()) return fehler

        state = state.copy(
            plan = neuerPlan,
            hinweise = state.hinweise + "Schichttausch ${erste.first}/${erste.second} ↔ ${zweite.first}/${zweite.second} regelkonform übernommen.",
        )
        return emptyList()
    }

    private fun geplanteEinsaetze(person: String): Int =
        state.plan.count { person in it.mitglieder }

    fun toggleGesperrterTag(woche: Int, tag: String) {
        val idx = tagIndex(woche, tag)
        val neue = state.gesperrteTage.toMutableSet()
        if (!neue.add(idx)) neue.remove(idx)
        // Vorbelegung auf gesperrtem Tag entfernen (Widerspruch vermeiden)
        val neueVorbelegungen = if (idx in neue)
            state.vorbelegungen.filterKeys { it.first != woche || it.second != tag }
        else state.vorbelegungen
        state = state.copy(gesperrteTage = neue, vorbelegungen = neueVorbelegungen)
        // Persistieren in .saniteam (#39)
        updateDatei { d -> d.copy(einstellung = d.einstellung.copy(gesperrteTage = neue)) }
    }

    fun fuegeVorbelegungHinzu(woche: Int, tag: String, paar: String, springer: String?) {
        if (state.vorbelegungen.containsKey(woche to tag)) return
        state = state.copy(
            vorbelegungen = state.vorbelegungen + ((woche to tag) to Dienst(paar, springer))
        )
    }

    fun loescheVorbelegung(schluessel: Pair<Int, String>) {
        state = state.copy(vorbelegungen = state.vorbelegungen - schluessel)
    }

    fun fuegeWiederkehrendesMusterHinzu(m: WiederkehrendeVorbelegung) {
        updateDatei { d -> d.copy(wiederkehrend = d.wiederkehrend + m) }
    }

    fun loescheWiederkehrendesMuster(m: WiederkehrendeVorbelegung) {
        updateDatei { d -> d.copy(wiederkehrend = d.wiederkehrend - m) }
    }

    fun allesZuruecksetzen() {
        state = state.copy(
            kranke = emptySet(),
            abwesenheiten = emptyMap(),
            vorbelegungen = emptyMap(),
            plan = emptyList(),
            hinweise = emptyList(),
            fehler = null,
        )
    }

    /**
     * Archiviert den aktuellen Plan als HistorischeSchicht (#52). Jeder Plan-Eintrag
     * wird als eigene Schicht mit Datum eingetragen, sofern dieses Datum noch
     * nicht in der Historie vorhanden ist.
     */
    private fun archiviereAltenPlan() {
        val alterPlan = state.plan
        if (alterPlan.isEmpty()) return
        val neueEintraege = alterPlan
            .filter { it.hatDienst }
            .mapNotNull { e ->
                val datum = datumFuer(e.woche, e.tag)?.toString() ?: return@mapNotNull null
                if (state.datei.historie.any { it.datum == datum }) return@mapNotNull null
                HistorischeSchicht(datum, e.mitglieder)
            }
        if (neueEintraege.isNotEmpty()) {
            state = state.copy(datei = state.datei.copy(historie = state.datei.historie + neueEintraege))
            saniteamSpeicherOrt?.speichern(state.datei)
        }
    }

    /** Monat vor/zurueck schalten (#42). Wechsel leert Plan + Vorbelegungen. */
    fun wechselPlanMonat(monate: Int) {
        val neu = state.planMonat.plusMonths(monate.toLong())
        state = state.copy(
            planMonat = neu,
            plan = emptyList(),
            vorbelegungen = emptyMap(),
            gesperrteTage = emptySet(),
            hinweise = listOf("Monat gewechselt auf ${neu.month} ${neu.year} — Vorbelegungen zurückgesetzt"),
        )
    }

    /** Echtes Datum fuer (woche, wochentag) im gewaehlten Plan-Monat. */
    fun datumFuer(woche: Int, tag: String): LocalDate? {
        val zielWochentag = try {
            java.time.DayOfWeek.valueOf(mapName(tag))
        } catch (_: Exception) { return null }
        val erster = state.planMonat.atDay(1)
        // Montag der Woche 1 = erster Montag des Monats (oder der 1., falls Montag)
        var montag = erster
        while (montag.dayOfWeek != java.time.DayOfWeek.MONDAY) montag = montag.plusDays(1)
        var datum = montag.plusDays(((woche - 1) * 7).toLong())
        while (datum.dayOfWeek != zielWochentag) datum = datum.plusDays(1)
        return if (datum.month == state.planMonat.month) datum else null
    }

    private fun mapName(tag: String): String = when (tag) {
        "Montag" -> "MONDAY"; "Dienstag" -> "TUESDAY"; "Mittwoch" -> "WEDNESDAY"
        "Donnerstag" -> "THURSDAY"; else -> "FRIDAY"
    }

    suspend fun generiere() {
        // Plan-Archiv (#52): den aktuellen Plan als Historie sichern, bevor ein
        // neuer generiert wird (damit die Statistik von selbst waechst)
        archiviereAltenPlan()

        // Wiederkehrende Vorbelegungen (#36): in konkrete Vorbelegungen uebersetzen
        val patternVorbelegungen = state.datei.wiederkehrend.flatMap { pattern ->
            Wochen.alle.filter { w ->
                pattern.alleXWochen == 1 || (w - pattern.startWoche) % pattern.alleXWochen == 0
            }.mapNotNull { w ->
                val key = w to pattern.tag
                if (tagIndex(w, pattern.tag) in state.gesperrteTage) return@mapNotNull null
                key to Dienst(pattern.paar, pattern.springer)
            }
        }.toMap()
        // Manuelle Vorbelegungen gewinnen gegen Muster
        val effektiveVorbelegungen = patternVorbelegungen + state.vorbelegungen
        state = state.copy(laeuft = true, fehler = null)
        fortlaufend = "Starte Planung…"
        val ergebnis = withContext(Dispatchers.Default) {
            val aufstellung = verarbeiteAufstellung(state.config, state.kranke, state.abwesenheiten)
            // #53: Klassenarbeiten als harte Regel in die Planung
            val kaLookup = klassenArbeitLookup()
            val res = generiereDienstplan(
                state.config, aufstellung, state.abwesenheiten,
                effektiveVorbelegungen, state.gesperrteTage, kaLookup
            ) { schritt ->
                fortlaufend = schritt
            }
            res to aufstellung
        }
        val (res, aufstellung) = ergebnis
        var plan = res.plan
        var teilergebnis = false

        if (plan == null) {
            // #40 Intelligente Teilplanung: Trotz Fehlschlag so viel wie moeglich
            // belegen — die konfliktfreien Tage werden per Greedy gesetzt, die
            // offenen Tage mit Konfliktgruenden gemeldet.
            fortlaufend = "Erstelle Teilplan…"
            val teiler = teilergebnisErzeugen(
                state.config, aufstellung, state.abwesenheiten,
                effektiveVorbelegungen, state.gesperrteTage, klassenArbeitLookup()
            )
            plan = teiler.plan
            teilergebnis = teiler.offeneTage.isNotEmpty()
            if (plan == null) {
                state = state.copy(
                    laeuft = false,
                    fehler = if (res.vorbelegungsProbleme.isNotEmpty())
                        "Vorbelegungen haben Konflikte:\n" + res.vorbelegungsProbleme.joinToString("\n") { "• $it" }
                    else "Kein gültiger Plan mit diesen Einschränkungen / Vorbelegungen möglich!",
                    plan = emptyList(),
                    hinweise = emptyList(),
                )
                return
            }
        }

        val eintraege = Wochen.alle.flatMap { w ->
            Wochentage.dienst.map { t ->
                val idx = tagIndex(w, t)
                if (idx in state.gesperrteTage) {
                    // Gesperrter Tag (z.B. schulfrei): kein Dienst
                    PlanEintrag(w, t, null, null, emptyList(), false, gesperrt = true)
                } else {
                    val d = plan.getValue(w to t)
                    val mitglieder = (aufstellung.aktivePaare[d.paar]
                        ?: state.config.teams[d.paar].orEmpty()) + listOfNotNull(d.springer)
                    PlanEintrag(w, t, d.paar, d.springer, mitglieder,
                        (w to t) in state.vorbelegungen || (w to t) in patternVorbelegungen)
                }
            }
        }
        // Offene Tage markieren (Teilplan): paar = null, aber nicht gesperrt
        val offeneKeys = state.let { s ->
            Wochen.alle.flatMap { w ->
                Wochentage.dienst.map { t -> w to t }
            }.filter { key ->
                tagIndex(key.first, key.second) !in s.gesperrteTage && key !in plan
            }
        }.toSet()
        val eintraegeKomplett = eintraege.map { e ->
            if ((e.woche to e.tag) in offeneKeys) e.copy(paar = null, mitglieder = emptyList()) else e
        }
        val hinweise = buildList {
            if (teilergebnis) {
                add("TEILPLAN: Nicht alle Tage konnten regelkonform besetzt werden — offene Tage sind markiert.")
                addAll(offeneTageGruende)
            }
            addAll(res.entschärfteRegeln)
            addAll(res.erklaerungen.filter { !res.entschärfteRegeln.contains(it) })
            if (aufstellung.ausgefallenePaare.isNotEmpty()) {
                add("Ausgefallene Teams: ${aufstellung.ausgefallenePaare.joinToString()}")
            }
            if (res.versuche > 1) add("Benötigte Versuche: ${res.versuche}")
        }
        state = state.copy(laeuft = false, plan = eintraegeKomplett, hinweise = hinweise,
            fehler = null)
        erinnerungenInvalidiert = true
    }

    private var offeneTageGruende: List<String> = emptyList()

    /** Ergebnis einer Teilplanung (#40): teilweise gefüllter Plan + Konfliktgruende. */
    private data class Teilergebnis(
        val plan: Map<Schluessel, Dienst>?,
        val offeneTage: List<Schluessel>,
    )

    /**
     * Greedy-Teilplanung: versucht jeden unvorbelegten, ungesperrten Tag mit der
     * ersten regelkonformen Besetzung; Tage ohne moegliche Besetzung bleiben offen
     * und bekommen einen verstaendlichen Konfliktgrund.
     */
    private fun teilergebnisErzeugen(
        config: AppConfig,
        aufstellung: Aufstellung,
        abwesenheiten: Abwesenheiten,
        vorbelegungen: Map<Schluessel, Dienst>,
        gesperrteTage: Set<Int>,
        kaLookup: KlassenArbeitLookup,
    ): Teilergebnis {
        val alleTage = Wochen.alle.flatMap { w -> Wochentage.dienst.map { Schluessel(w, it) } }
        val plan = mutableMapOf<Schluessel, Dienst>()
        plan.putAll(vorbelegungen)
        val offene = mutableListOf<Schluessel>()
        val gruende = mutableListOf<String>()

        for (tag in alleTage) {
            if (tagIndex(tag.first, tag.second) in gesperrteTage) continue
            if (tag in plan) continue
            var gesetzt = false
            for (paar in aufstellung.aktivePaare.keys) {
                for (springer in aufstellung.aktiveSpringer + listOf<String?>(null)) {
                    val verstoesse = istGueltig(
                        plan, tag.first, tag.second, paar, springer, config, abwesenheiten, 0, kaLookup
                    )
                    if (verstoesse.isEmpty()) {
                        plan[tag] = Dienst(paar, springer)
                        gesetzt = true
                        break
                    }
                }
                if (gesetzt) break
            }
            if (!gesetzt) {
                offene.add(tag)
                // Konfliktgruende sammeln: warum geht gar nichts?
                val gruendeProTeam = aufstellung.aktivePaare.keys.take(3).map { paar ->
                    val v = istGueltig(plan, tag.first, tag.second, paar, null, config, abwesenheiten, 0, kaLookup)
                    "${paar}: ${v.firstOrNull()?.beschreibung ?: "unbekannt"}"
                }
                gruende.add("Offen: W${tag.first}/${tag.second} — ${gruendeProTeam.joinToString("; ")}")
            }
        }
        offeneTageGruende = gruende
        return Teilergebnis(plan.ifEmpty { null }, offene)
    }

    /** Aktueller Schrittwaehrend der Planung (statt nur "Rechnet...") */
    var fortlaufend by mutableStateOf("")
        private set

    /** true, wenn nach der letzten Generierung noch keine Erinnerungen geplant wurden (#25). */
    var erinnerungenInvalidiert by mutableStateOf(false)
        private set

    fun markiereErinnerungenGeplant() {
        erinnerungenInvalidiert = false
    }

    fun planAlsText(): String {
        val sb = StringBuilder()
        sb.appendLine("================ MONATSDIENSTPLAN ================")
        sb.appendLine()
        for (w in Wochen.alle) {
            sb.appendLine("--- WOCHE $w ---")
            for (t in Wochentage.dienst) {
                val e = state.plan.firstOrNull { it.woche == w && it.tag == t } ?: continue
                val marker = buildString {
                    if (e.gesperrt) append(" [KEIN DIENST]")
                    if (e.vorbelegt) append(" [VORBELEGT]")
                    e.vertretungHinweis?.let { append(" [VERTRETUNG: $it]") }
                }
                sb.appendLine("  ${t.padEnd(11)}: ${e.mitglieder.joinToString()} (${e.mitglieder.size}er-Team)$marker")
            }
            sb.appendLine()
        }
        if (state.hinweise.isNotEmpty()) {
            sb.appendLine("Hinweise:")
            state.hinweise.forEach { sb.appendLine("• $it") }
        }
        return sb.toString()
    }

    // ------------------------------------------------------------------
    // TAUSCHBOERSE (#27)
    // ------------------------------------------------------------------

    /**
     * Prueft, ob der Tausch von [personA] (aus [dienstA]) mit [personB]
     * (aus [dienstB]) alle aktiven Regeln erfuellt. Liefert Verstoss-Liste.
     */
    fun pruefeTausch(dienstA: PlanEintrag, dienstB: PlanEintrag, personA: String, personB: String): List<String> {
        if (personA !in dienstA.mitglieder || personB !in dienstB.mitglieder) {
            return listOf("Personen gehoeren nicht zu den gewaehlten Diensten")
        }
        if (personA == personB) return listOf("Gleiche Person kann nicht mit sich selbst tauschen")

        // Neuen Plan simulieren: A kriegt B's Slot, B kriegt A's Slot
        val neuerPlan = state.plan.map { e ->
            when {
                e.woche == dienstA.woche && e.tag == dienstA.tag ->
                    e.copy(mitglieder = (e.mitglieder - personA) + personB)
                e.woche == dienstB.woche && e.tag == dienstB.tag ->
                    e.copy(mitglieder = (e.mitglieder - personB) + personA)
                else -> e
            }
        }
        val aufstellung = verarbeiteAufstellung(state.config, state.kranke, state.abwesenheiten)
        val neueDienste = neuerPlan.filter { it.hatDienst }
            .associate { (it.woche to it.tag) to Dienst(it.paar!!, it.springer) }

        // Ausbildungs-Regel pruefen: beide Teams muessen mind. 1 ausgebildete Person haben
        val probleme = mutableListOf<String>()
        for (e in neuerPlan.filter { it.hatDienst }) {
            val hatAusbildung = e.mitglieder.any { m ->
                state.datei.personen.firstOrNull { it.vollerName() == m }?.ausbildungAbgeschlossen == true
            }
            if (!hatAusbildung) {
                probleme += "W${e.woche}/${e.tag}: Kein ausgebildetes Team-Mitglied mehr (Regel: mind. 1)"
            }
        }

        probleme += validiereDienstplan(state.config, aufstellung, neueDienste, state.abwesenheiten)
        return probleme.distinct()
    }

    /** Fuehrt einen gueltigen Tausch aus. */
    fun fuehreTauschAus(dienstA: PlanEintrag, dienstB: PlanEintrag, personA: String, personB: String): Boolean {
        if (pruefeTausch(dienstA, dienstB, personA, personB).isNotEmpty()) return false
        state = state.copy(
            plan = state.plan.map { e ->
                when {
                    e.woche == dienstA.woche && e.tag == dienstA.tag ->
                        e.copy(mitglieder = (e.mitglieder - personA) + personB)
                    e.woche == dienstB.woche && e.tag == dienstB.tag ->
                        e.copy(mitglieder = (e.mitglieder - personB) + personA)
                    else -> e
                }
            }
        )
        return true
    }

    /** Lookup: Tag-Index -> Personen, die an dem Tag eine Klassenarbeit haben (#53). */
    private fun klassenArbeitLookup(): KlassenArbeitLookup {
        val map = mutableMapOf<Int, MutableSet<String>>()
        val personen = state.datei.personen
        for (t in state.datei.schultermine) {
            if (t.typ != "Klassenarbeit") continue
            val datum = try { LocalDate.parse(t.datum) } catch (_: Exception) { continue }
            // Datum -> (Woche, Wochentag) des Planungsmonats
            val woche = kalenderWocheFuer(datum) ?: continue
            val tag = Wochentage.dienst.firstOrNull { datumFuer(woche, it) == datum } ?: continue
            val idx = tagIndex(woche, tag)
            val betroffene = (t.personNamen.toSet() + personen
                .filter { it.klasse in t.klassen }.map { it.vollerName() }).toMutableSet()
            map.getOrPut(idx) { mutableSetOf() }.addAll(betroffene)
        }
        return object : KlassenArbeitLookup {
            override fun betroffene(tagIdx: Int): Set<String> = map[tagIdx].orEmpty()
        }
    }

    /** Kalenderwoche (1-4) des Planungsmonats, in der ein Datum liegt; null wenn ausserhalb. */
    private fun kalenderWocheFuer(datum: LocalDate): Int? {
        for (w in 1..4) {
            if (datumFuer(w, "Montag")?.let { datum >= it } == true) {
                val ende = datumFuer(w, "Freitag")
                if (ende != null && datum <= ende) return w
            }
        }
        return null
    }

    // ------------------------------------------------------------------
    // SCHULTERMINE & KALENDER (#53-55)
    // ------------------------------------------------------------------

    fun fuegeSchulterminHinzu(t: Schultermin) {
        updateDatei { d -> d.copy(schultermine = d.schultermine + t) }
    }

    fun loescheSchultermin(t: Schultermin) {
        updateDatei { d -> d.copy(schultermine = d.schultermine - t) }
    }

    fun schultermineFuer(datum: LocalDate): List<Schultermin> =
        state.datei.schultermine.filter { it.datum == datum.toString() }

    fun tagesAnalyse(von: LocalDate, bis: LocalDate, klassenFilter: Set<String> = emptySet()) =
        KalenderAnalyse.betroffeneProTag(state.datei, von, bis, klassenFilter)

    fun klassenListe(): List<String> =
        state.datei.personen.map { it.klasse }.filter { it.isNotBlank() }.distinct().sorted()

    fun archivierteHistorie(): List<HistorischeSchicht> = state.datei.historie

    // ------------------------------------------------------------------
    // STATISTIK
    // ------------------------------------------------------------------

    fun setStatistikZeitraum(von: LocalDate?, bis: LocalDate?) {
        state = state.copy(statistikVon = von, statistikBis = bis)
    }

    private fun historieGefiltert(): List<HistorischeSchicht> {
        val von = state.statistikVon
        val bis = state.statistikBis
        return state.datei.historie.filter { h ->
            try {
                val d = LocalDate.parse(h.datum)
                (von == null || !d.isBefore(von)) && (bis == null || !d.isAfter(bis))
            } catch (_: Exception) { false }
        }
    }

    /**
     * Erklärbare Planung (#44): Schulische Belastung je Person im Planungsmonat
     * (Anzahl Schultermine, an denen die Person betroffen ist) + Termine.
     */
    fun schulischeBelastung(): Map<String, Pair<Int, List<String>>> {
        val result = mutableMapOf<String, Pair<Int, List<String>>>()
        val analyse = tagesAnalyse(LocalDate.now().withDayOfMonth(1), LocalDate.now().plusMonths(1).withDayOfMonth(1))
        for ((_, a) in analyse) {
            val termineNamen = a.termine.map { it.titel }
            for (p in a.betroffenePersonen) {
                val alt = result[p] ?: (0 to emptyList<String>())
                result[p] = (alt.first + 1) to (alt.second + termineNamen).distinct()
            }
        }
        return result
    }

    /** Kennzahlen-Engine (#44-Erweiterung): alle 10 Kennzahlen pro Person. */
    fun kennzahlen(): List<com.fabian.sanialarmplaner.logic.PersonKennzahlen> {
        val planMitglieder = state.datei.historie.associate { it.datum to it.personNamen }.toMutableMap()
        // aktueller Plan mit echten Daten einrechnen
        for (e in state.plan) {
            if (!e.hatDienst) continue
            val datum = datumFuer(e.woche, e.tag)?.toString() ?: continue
            planMitglieder[datum] = e.mitglieder
        }
        // Verfuegbare Tage: Personen ohne Krank-/Sperr-/Abwesenheits-Eintraege
        val verfuegbar = state.datei.personen.filter { it.aktiv }.associate { p ->
            val name = p.vollerName()
            var tage = 0
            for (w in Wochen.alle) for (t in Wochentage.dienst) {
                val idx = tagIndex(w, t)
                if (idx in state.gesperrteTage) continue
                if (name in state.kranke) continue
                if (idx in state.abwesenheiten[name].orEmpty()) continue
                if (t in state.config.personSperrtage[name].orEmpty()) continue
                tage++
            }
            name to tage
        }
        return com.fabian.sanialarmplaner.logic.KennzahlenEngine.berechne(state.datei, planMitglieder, verfuegbar)
    }

    fun statistik(): List<PersonenStatistik> {
        val d = state.datei
        val alle = d.personen.filter { it.aktiv }.map { it.vollerName() }.toSet()

        // geplante Schichten (aktueller Plan)
        val geplant = mutableMapOf<String, Int>()
        for (e in state.plan) for (p in e.mitglieder) {
            if (p in alle) geplant[p] = (geplant[p] ?: 0) + 1
        }

        // historische Schichten
        val historisch = mutableMapOf<String, Int>()
        for (h in historieGefiltert()) for (p in h.personNamen) {
            if (p in alle) historisch[p] = (historisch[p] ?: 0) + 1
        }

        val heute = LocalDate.now()
        val kurzNamen = kurzeNamen(d.personen)
        return alle.map { name ->
            val p = d.personen.first { it.vollerName() == name }
            val monate = try {
                if (p.seit.isBlank()) 0
                else java.time.Period.between(
                    YearMonth.parse(p.seit).atDay(1), heute
                ).months + (java.time.Period.between(
                    YearMonth.parse(p.seit).atDay(1), heute
                ).years * 12)
            } catch (_: Exception) { 0 }
            val gesamt = (geplant[name] ?: 0) + (historisch[name] ?: 0)
            // Belastungsindex: Gesamt-Einsaetze pro Monat Mitgliedschaft,
            // ausgebildete zaehlen 1.2x (mehr Verantwortung)
            // #34: Ausbildungs-Dauer praezise einrechnen: der Faktor steigt mit
            // der Ausbildungsdauer von 1.0 (frisch) bis 1.3 (>= 2 Jahre)
            val ausbildungMonate = try {
                if (p.ausbildungSeit.isBlank()) 0
                else java.time.Period.between(
                    YearMonth.parse(p.ausbildungSeit).atDay(1), heute
                ).toTotalMonths().toInt()
            } catch (_: Exception) { 0 }
            val faktor = when {
                !p.ausbildungAbgeschlossen -> 1.0
                ausbildungMonate >= 24 -> 1.3
                ausbildungMonate >= 12 -> 1.2
                else -> 1.1
            }
            val ausbildungJahre = if (p.ausbildungAbgeschlossen) ausbildungMonate / 12.0 else 0.0
            val index = if (monate > 0) (gesamt * faktor) / monate else gesamt * faktor * 2.0
            PersonenStatistik(
                name = kurzNamen[name] ?: name,
                geplant = geplant[name] ?: 0,
                historisch = historisch[name] ?: 0,
                monateDabei = monate,
                ausbildungJahre = ausbildungJahre,
                belastungsIndex = index,
            )
        }.sortedByDescending { it.belastungsIndex }
    }

    /** Historische Schicht hinzufuegen (Import manuell). */
    fun fuegeHistorischeSchichtHinzu(datum: String, personen: List<String>) {
        val neue = HistorischeSchicht(datum, personen)
        updateDatei { it.copy(historie = it.historie + neue) }
    }

    fun loescheHistorischeSchicht(datum: String) {
        updateDatei { it.copy(historie = it.historie.filterNot { h -> h.datum == datum }) }
    }
}
