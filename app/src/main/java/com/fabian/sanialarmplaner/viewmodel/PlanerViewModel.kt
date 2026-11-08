package com.fabian.sanialarmplaner.viewmodel

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.fabian.sanialarmplaner.data.*
import com.fabian.sanialarmplaner.logic.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
    val paar: String,
    val springer: String?,
    val mitglieder: List<String>,
    val vorbelegt: Boolean,
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
    val plan: List<PlanEintrag> = emptyList(),
    val hinweise: List<String> = emptyList(),
    val fehler: String? = null,
    val laeuft: Boolean = false,
    /** Zeitraum-Filter fuer Statistik, null = alles */
    val statistikVon: LocalDate? = null,
    val statistikBis: LocalDate? = null,
)

class PlanerViewModel(private val store: ConfigStore) {

    var state by mutableStateOf(UiState())
        private set

    private val speicher = SaniteamSpeicher()

    init {
        state = state.copy(config = store.laden())
    }

    // ------------------------------------------------------------------
    // SANITEAM-DATEI (Personen, Teams, Historie)
    // ------------------------------------------------------------------

    fun updateDatei(transform: (SaniteamDatei) -> SaniteamDatei) {
        state = state.copy(datei = transform(state.datei))
        configAusDatei()
    }

    /** Leitet AppConfig (Teams/Springer/Präferenzen/Regeln) aus der Kartei ab. */
    private fun configAusDatei() {
        val d = state.datei
        val teams = d.ableiteTeams()
        state = state.copy(
            config = state.config.copy(
                teams = if (teams.isEmpty()) state.config.teams else teams,
                springer = if (d.personen.isEmpty()) state.config.springer else d.ableiteSpringer(),
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
        store.speichern(state.config)
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

    fun fuegeVorbelegungHinzu(woche: Int, tag: String, paar: String, springer: String?) {
        if (state.vorbelegungen.containsKey(woche to tag)) return
        state = state.copy(
            vorbelegungen = state.vorbelegungen + ((woche to tag) to Dienst(paar, springer))
        )
    }

    fun loescheVorbelegung(schluessel: Pair<Int, String>) {
        state = state.copy(vorbelegungen = state.vorbelegungen - schluessel)
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

    suspend fun generiere() {
        state = state.copy(laeuft = true, fehler = null)
        val ergebnis = withContext(Dispatchers.Default) {
            val aufstellung = verarbeiteAufstellung(state.config, state.kranke, state.abwesenheiten)
            val res = generiereDienstplan(
                state.config, aufstellung, state.abwesenheiten, state.vorbelegungen
            )
            res to aufstellung
        }
        val (res, aufstellung) = ergebnis
        val plan = res.plan
        if (plan == null) {
            state = state.copy(
                laeuft = false,
                fehler = "Kein gültiger Plan mit diesen Einschränkungen / Vorbelegungen möglich!",
                plan = emptyList(),
                hinweise = emptyList(),
            )
            return
        }

        val eintraege = Wochen.alle.flatMap { w ->
            Wochentage.dienst.map { t ->
                val d = plan.getValue(w to t)
                val mitglieder = (aufstellung.aktivePaare[d.paar]
                    ?: state.config.teams[d.paar].orEmpty()) + listOfNotNull(d.springer)
                PlanEintrag(w, t, d.paar, d.springer, mitglieder, (w to t) in state.vorbelegungen)
            }
        }
        val hinweise = buildList {
            addAll(res.entschärfteRegeln)
            if (aufstellung.ausgefallenePaare.isNotEmpty()) {
                add("Ausgefallene Teams: ${aufstellung.ausgefallenePaare.joinToString()}")
            }
            if (res.versuche > 1) add("Benötigte Versuche: ${res.versuche}")
        }
        state = state.copy(laeuft = false, plan = eintraege, hinweise = hinweise, fehler = null)
    }

    fun planAlsText(): String {
        val sb = StringBuilder()
        sb.appendLine("================ MONATSDIENSTPLAN ================")
        sb.appendLine()
        for (w in Wochen.alle) {
            sb.appendLine("--- WOCHE $w ---")
            for (t in Wochentage.dienst) {
                val e = state.plan.firstOrNull { it.woche == w && it.tag == t } ?: continue
                val marker = if (e.vorbelegt) " [VORBELEGT]" else ""
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
            val faktor = if (p.ausbildungAbgeschlossen) 1.2 else 1.0
            val index = if (monate > 0) (gesamt * faktor) / monate else gesamt * faktor * 2.0
            PersonenStatistik(
                name = name,
                geplant = geplant[name] ?: 0,
                historisch = historisch[name] ?: 0,
                monateDabei = monate,
                ausbildungJahre = 0.0,   // TODO: aus Ausbildungs-Startdatum berechnen
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
