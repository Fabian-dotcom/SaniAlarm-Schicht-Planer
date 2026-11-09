package com.fabian.sanialarmplaner.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import com.fabian.sanialarmplaner.data.Person
import com.fabian.sanialarmplaner.data.RegelKonfig
import com.fabian.sanialarmplaner.data.vollerName
import com.fabian.sanialarmplaner.logic.Wochentage
import com.fabian.sanialarmplaner.viewmodel.PlanerViewModel
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter

// ==============================================================================
// TAB: PERSONEN-KARTEI
// ==============================================================================
@Composable
fun PersonenTab(vm: PlanerViewModel) {
    val state = vm.state
    var bearbeite by remember { mutableStateOf<Person?>(null) }
    var neu by remember { mutableStateOf(false) }
    var zeigeQrBeitritt by remember { mutableStateOf(false) }
    var gridAnsicht by remember { mutableStateOf(false) }
    var suche by remember { mutableStateOf("") }

    val gefilterte = state.datei.personen.filter { p ->
        suche.isBlank() ||
            p.vollerName().contains(suche, ignoreCase = true) ||
            p.klasse.contains(suche, ignoreCase = true)
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp, horizontal = 12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    if (suche.isBlank()) "Personen-Kartei (${state.datei.personen.size})"
                    else "Treffer: ${gefilterte.size} von ${state.datei.personen.size}",
                    style = MaterialTheme.typography.titleMedium
                )
            }
            // Ansicht umschalten
            FilterChip(
                selected = !gridAnsicht, onClick = { gridAnsicht = false }, label = { Text("Liste") }
            )
            FilterChip(
                selected = gridAnsicht, onClick = { gridAnsicht = true }, label = { Text("Kacheln") }
            )
            Spacer(Modifier.width(6.dp))
            Button(onClick = { neu = true }) { Text("+ Neu") }
        }
        Text(
            "Alle Angaben werden lokal in der .saniteam-Datei gespeichert (Export/Import in den Einstellungen). Ausgebildete Personen ohne Team dienen als Springer. Jedes Team braucht mindestens 1 ausgebildete Person.",
            style = MaterialTheme.typography.bodySmall
        )
        OutlinedButton(onClick = { zeigeQrBeitritt = true }) {
            Text("Beitritt per QR-Code")
        }
        Spacer(Modifier.height(8.dp))

        // Volltextsuche (#40)
        OutlinedTextField(
            value = suche,
            onValueChange = { suche = it },
            label = { Text("Suchen (Vor-/Nachname, Klasse)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        Spacer(Modifier.height(6.dp))

        if (state.datei.personen.isEmpty()) {
            Text("Noch keine Personen angelegt.", style = MaterialTheme.typography.bodySmall)
        }

        val sortierte = gefilterte.sortedWith(compareBy({ !it.aktiv }, { it.nachname }, { it.vorname }))
        if (sortierte.isEmpty() && state.datei.personen.isNotEmpty()) {
            Text("Keine Treffer für '$suche'.", style = MaterialTheme.typography.bodySmall)
        }
        if (gridAnsicht) {
            // Kacheln: 2 Spalten
            val zeilen = sortierte.chunked(2)
            zeilen.forEach { paarzeile ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    paarzeile.forEach { p ->
                        PersonKachel(p, Modifier.weight(1f)) { bearbeite = p }
                    }
                    if (paarzeile.size == 1) Spacer(Modifier.weight(1f))
                }
                Spacer(Modifier.height(8.dp))
            }
        } else {
            sortierte.forEach { p ->
                Card(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(p.vollerName(), style = MaterialTheme.typography.bodyLarge)
                            Text(
                                buildList {
                                    if (p.klasse.isNotBlank()) add(p.klasse)
                                    if (p.geschlecht.isNotBlank()) add(p.geschlecht)
                                    if (p.ausbildungAbgeschlossen) add("ausgebildet")
                                    if (p.bevorzugterPartner.isNotBlank()) add("Partner: ${p.bevorzugterPartner}")
                                    if (p.seit.isNotBlank()) add("seit ${p.seit}")
                                    if (!p.aktiv) add("INAKTIV")
                                }.joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                                color = if (p.aktiv) MaterialTheme.colorScheme.onSurfaceVariant
                                        else MaterialTheme.colorScheme.error
                            )
                        }
                        TextButton(onClick = { bearbeite = p }) { Text("Bearbeiten") }
                    }
                }
            }
        }
        Spacer(Modifier.height(80.dp))
    }

    if (neu) {
        PersonDialog(vm, null) { neu = false }
    }
    bearbeite?.let { p ->
        PersonDialog(vm, p) { bearbeite = null }
    }
    if (zeigeQrBeitritt) {
        BeitrittQrDialog(vm) { zeigeQrBeitritt = false }
    }
}

@Composable
fun PersonKachel(p: Person, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Card(modifier = modifier, onClick = onClick) {
        Column(Modifier.padding(10.dp)) {
            Text(p.vollerName(), style = MaterialTheme.typography.titleSmall, maxLines = 1)
            Text(
                buildList {
                    if (p.klasse.isNotBlank()) add(p.klasse)
                    if (p.ausbildungAbgeschlossen) add("ausgebildet")
                    if (!p.aktiv) add("INAKTIV")
                }.joinToString(" · ").ifBlank { "Tap fuer Details" },
                style = MaterialTheme.typography.bodySmall,
                maxLines = 2,
                color = if (p.aktiv) MaterialTheme.colorScheme.onSurfaceVariant
                        else MaterialTheme.colorScheme.error
            )
        }
    }
}

@Composable
fun PersonDialog(vm: PlanerViewModel, bestaehend: Person?, onSchliessen: () -> Unit) {
    val alleNamen = vm.state.datei.personen.map { it.vollerName() }.filter {
        it != (bestaehend?.vollerName() ?: "")
    }

    var vorname by remember { mutableStateOf(bestaehend?.vorname ?: "") }
    var nachname by remember { mutableStateOf(bestaehend?.nachname ?: "") }
    var klasse by remember { mutableStateOf(bestaehend?.klasse ?: "") }
    var geschlecht by remember { mutableStateOf(bestaehend?.geschlecht ?: "") }
    var partner by remember { mutableStateOf(bestaehend?.bevorzugterPartner ?: "") }
    var ausbildung by remember { mutableStateOf(bestaehend?.ausbildungAbgeschlossen ?: false) }
    var seit by remember { mutableStateOf(bestaehend?.seit ?: "") }
    var telefon by remember { mutableStateOf(bestaehend?.telefon ?: "") }
    var email by remember { mutableStateOf(bestaehend?.email ?: "") }
    var anmerkung by remember { mutableStateOf(bestaehend?.anmerkung ?: "") }
    var aktiv by remember { mutableStateOf(bestaehend?.aktiv ?: true) }

    AlertDialog(
        onDismissRequest = onSchliessen,
        confirmButton = {
            TextButton(onClick = {
                if (vorname.isNotBlank()) {
                    val p = Person(
                        vorname = vorname.trim(), nachname = nachname.trim(),
                        klasse = klasse.trim(), geschlecht = geschlecht,
                        bevorzugterPartner = partner.trim(),
                        ausbildungAbgeschlossen = ausbildung, seit = seit.trim(),
                        telefon = telefon.trim(), email = email.trim(),
                        anmerkung = anmerkung.trim(), aktiv = aktiv,
                    )
                    vm.updateDatei { d ->
                        val ohneAlt = if (bestaehend != null)
                            d.personen.filterNot { it.vollerName() == bestaehend.vollerName() }
                        else d.personen
                        d.copy(personen = ohneAlt + p)
                    }
                    onSchliessen()
                }
            }) { Text("Speichern") }
        },
        dismissButton = {
            Row {
                if (bestaehend != null) {
                    TextButton(onClick = {
                        vm.updateDatei { d ->
                            d.copy(personen = d.personen.filterNot { it.vollerName() == bestaehend.vollerName() })
                        }
                        onSchliessen()
                    }) { Text("Löschen", color = MaterialTheme.colorScheme.error) }
                }
                TextButton(onClick = onSchliessen) { Text("Abbrechen") }
            }
        },
        title = { Text(if (bestaehend == null) "Neue Person" else "Person bearbeiten") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(vorname, { vorname = it }, label = { Text("Vorname *") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(nachname, { nachname = it }, label = { Text("Nachname") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(klasse, { klasse = it }, label = { Text("Klasse / Gruppe") }, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("m", "w", "d").forEach { g ->
                        FilterChip(selected = geschlecht == g, onClick = { geschlecht = g }, label = { Text(g) })
                    }
                }
                LabeledDropdown("Bevorzugter Partner", listOf("") + alleNamen, partner, Modifier.fillMaxWidth()) { partner = it }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = ausbildung, onCheckedChange = { ausbildung = it })
                    Text("Ausbildung abgeschlossen")
                }
                OutlinedTextField(seit, { seit = it }, label = { Text("Dabei seit (JJJJ-MM)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(telefon, { telefon = it }, label = { Text("Telefon (optional)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(email, { email = it }, label = { Text("E-Mail (optional)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(anmerkung, { anmerkung = it }, label = { Text("Anmerkung") }, modifier = Modifier.fillMaxWidth())
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = aktiv, onCheckedChange = { aktiv = it })
                    Text("Aktiv")
                }
            }
        }
    )
}

// ==============================================================================
// TAB: STATISTIK
// ==============================================================================
@Composable
fun StatistikTab(vm: PlanerViewModel) {
    val state = vm.state
    var zeigeVerlauf by remember { mutableStateOf(true) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp, horizontal = 12.dp)
    ) {
        Text("Zeitraum", style = MaterialTheme.typography.titleMedium)
        val formatter = DateTimeFormatter.ofPattern("dd.MM.yyyy")
        val vonText = state.statistikVon?.format(formatter) ?: "Anfang"
        val bisText = state.statistikBis?.format(formatter) ?: "Heute"
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Von: $vonText")
            Text("Bis: $bisText")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 4.dp)) {
            FilterChip(
                selected = state.statistikVon == null && state.statistikBis == null,
                onClick = { vm.setStatistikZeitraum(null, null) },
                label = { Text("Alles") }
            )
            FilterChip(
                selected = state.statistikVon == LocalDate.now().withDayOfYear(1),
                onClick = { vm.setStatistikZeitraum(LocalDate.now().withDayOfYear(1), LocalDate.now()) },
                label = { Text("Dieses Jahr") }
            )
            FilterChip(
                selected = state.statistikVon == LocalDate.now().withDayOfMonth(1),
                onClick = { vm.setStatistikZeitraum(LocalDate.now().withDayOfMonth(1), LocalDate.now()) },
                label = { Text("Dieser Monat") }
            )
        }

        Spacer(Modifier.height(12.dp))
        Text("Vergangene Schichten", style = MaterialTheme.typography.titleMedium)
        HistorieEditor(vm)

        Spacer(Modifier.height(12.dp))
        Text("Belastungsindex", style = MaterialTheme.typography.titleMedium)
        Text(
            "Einsätze gesamt × Faktor (ausgebildet 1,2×) pro Monat Mitgliedschaft — so vergleicht man fair, wer relativ zu seiner Zeit am meisten übernommen hat.",
            style = MaterialTheme.typography.bodySmall
        )
        Spacer(Modifier.height(8.dp))

        val stats = vm.statistik()
        if (stats.isEmpty()) {
            Text("Keine Daten.", style = MaterialTheme.typography.bodySmall)
        } else {
            val maxIndex = stats.maxOf { it.belastungsIndex }.coerceAtLeast(0.001)
            stats.forEach { s ->
                Card(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    Column(Modifier.padding(horizontal = 10.dp, vertical = 6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(s.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1)
                            Spacer(Modifier.weight(1f))
                            Text("Index %.2f".format(s.belastungsIndex),
                                style = MaterialTheme.typography.titleSmall)
                        }
                        Text(
                            "gesamt ${s.geplant + s.historisch} · geplant ${s.geplant} · Historie ${s.historisch} · ${s.monateDabei} Monate",
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1
                        )
                        LinearProgressIndicator(
                            progress = { (s.belastungsIndex / maxIndex).toFloat() },
                            modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        Text("Aktueller Plan", style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = zeigeVerlauf, onClick = { zeigeVerlauf = true }, label = { Text("Balken") })
            FilterChip(selected = !zeigeVerlauf, onClick = { zeigeVerlauf = false }, label = { Text("Kuchen") })
        }
        val planStats = state.plan.groupingBy { e -> e.mitglieder.joinToString(" & ") }.eachCount()
        if (planStats.isEmpty()) {
            Text("Noch kein Plan generiert.", style = MaterialTheme.typography.bodySmall)
        } else if (zeigeVerlauf) {
            val max = planStats.values.max()
            planStats.entries.sortedByDescending { it.value }.forEach { (team, n) ->
                Column(Modifier.padding(vertical = 3.dp)) {
                    Row { Text(team, Modifier.weight(1f)); Text("$n×") }
                    LinearProgressIndicator(progress = { n.toFloat() / max }, modifier = Modifier.fillMaxWidth())
                }
            }
        } else {
            // "Kuchen"-Darstellung: Balken stapelbar, einfach als proportionalen Streifen
            val gesamt = planStats.values.sum().toFloat()
            Row(Modifier.fillMaxWidth().height(28.dp)) {
                val farben = listOf(Color(0xFF6750A4), Color(0xFF625b71), Color(0xFF7D5260),
                    Color(0xFF386A20), Color(0xFFB3261E), Color(0xFF006A60))
                planStats.values.sortedDescending().forEachIndexed { i, n ->
                    Box(Modifier.weight(n.toFloat()).fillMaxHeight().background(farben[i % farben.size]))
                }
            }
            Spacer(Modifier.height(4.dp))
            planStats.entries.sortedByDescending { it.value }.forEachIndexed { i, (team, n) ->
                val farben = listOf(Color(0xFF6750A4), Color(0xFF625b71), Color(0xFF7D5260),
                    Color(0xFF386A20), Color(0xFFB3261E), Color(0xFF006A60))
                Row {
                    Box(Modifier.size(10.dp).background(farben[i % farben.size]))
                    Spacer(Modifier.width(4.dp))
                    Text("$team: $n× (${(n / gesamt * 100).toInt()}%)", style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        Text("Springer-Einsätze (aktueller Plan)", style = MaterialTheme.typography.titleMedium)
        val springerStats = state.plan.mapNotNull { it.springer }.groupingBy { it }.eachCount()
        if (springerStats.isEmpty()) Text("Keine Springer-Einsätze im Plan.", style = MaterialTheme.typography.bodySmall)
        springerStats.forEach { (s, n) -> Text("• $s: $n×") }

        Spacer(Modifier.height(80.dp))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HistorieEditor(vm: PlanerViewModel) {
    var datum by remember { mutableStateOf(LocalDate.now().toString()) }
    var auswahl by remember { mutableStateOf(setOf<String>()) }
    val allePersonen = vm.state.datei.personen.filter { it.aktiv }.map { it.vollerName() }.sorted()

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(10.dp)) {
            Text("Schicht nachtragen (für Statistik):", style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(datum, { datum = it }, label = { Text("Datum (JJJJ-MM-TT)") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(4.dp))
            // FlowRow: Chips brechen um, alle Namen sind erreichbar
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                allePersonen.forEach { p ->
                    FilterChip(
                        selected = p in auswahl,
                        onClick = { auswahl = if (p in auswahl) auswahl - p else auswahl + p },
                        label = { Text(p.split(" ").first()) }
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        if (auswahl.isNotEmpty()) {
                            vm.fuegeHistorischeSchichtHinzu(datum, auswahl.toList())
                            auswahl = emptySet()
                        }
                    },
                    enabled = auswahl.isNotEmpty()
                ) { Text("Speichern") }
            }
            if (vm.state.datei.historie.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text("${vm.state.datei.historie.size} historische Schichten:", style = MaterialTheme.typography.labelSmall)
                vm.state.datei.historie.sortedByDescending { it.datum }.take(5).forEach { h ->
                    Row {
                        Text("${h.datum}: ${h.personNamen.joinToString()}", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                        TextButton(onClick = { vm.loescheHistorischeSchicht(h.datum) }) {
                            Text("×", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }
}

// ==============================================================================
// TAB: EINSTELLUNGEN
// ==============================================================================
@Composable
fun EinstellungenTab(vm: PlanerViewModel) {
    val cfg = vm.state.config
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var importText by remember { mutableStateOf("") }
    var importMeldung by remember { mutableStateOf<String?>(null) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp, horizontal = 12.dp)
    ) {
        // ---------------- Regeln ----------------
        Text("Regeln (ein-/ausschaltbar)", style = MaterialTheme.typography.titleMedium)
        data class RegelRow(val name: String, val aktiv: Boolean, val setter: (Boolean) -> Unit)
        val regelListe = listOf(
            RegelRow("Team-Sperrtage", cfg.regeln.teamSperrtageAktiv) { v ->
                vm.updateConfig { c -> c.copy(regeln = c.regeln.copy(teamSperrtageAktiv = v)) }
            },
            RegelRow("Max. 1 Schicht pro Woche", cfg.regeln.maxEineSchichtProWoche) { v ->
                vm.updateConfig { c -> c.copy(regeln = c.regeln.copy(maxEineSchichtProWoche = v)) }
            },
            RegelRow("Kein Wochentag doppelt im Monat", cfg.regeln.wochentagNurEinmal) { v ->
                vm.updateConfig { c -> c.copy(regeln = c.regeln.copy(wochentagNurEinmal = v)) }
            },
            RegelRow("Kein Freitag→Montag-Doppeldienst", cfg.regeln.keinBackToBack) { v ->
                vm.updateConfig { c -> c.copy(regeln = c.regeln.copy(keinBackToBack = v)) }
            },
            RegelRow("Springer-Präferenzen", cfg.regeln.springerPraeferenzen) { v ->
                vm.updateConfig { c -> c.copy(regeln = c.regeln.copy(springerPraeferenzen = v)) }
            },
            RegelRow("Fairness (1–2× pro 2-Wochen-Block)", cfg.regeln.blockFairness) { v ->
                vm.updateConfig { c -> c.copy(regeln = c.regeln.copy(blockFairness = v)) }
            },
        )
        regelListe.forEach { r ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = r.aktiv, onCheckedChange = { r.setter(it) })
                Text(r.name, Modifier.weight(1f))
            }
        }
        Text(
            "Alle Regeln können hier abgeschaltet werden. „Kein Wochentag doppelt im Monat\" bedeutet: Ein Team, das an einem Montag diente, soll im selben Monat nicht noch einmal an einem Montag dienen — es verteilt die Teams gleichmäßiger über die Wochentage.",
            style = MaterialTheme.typography.bodySmall
        )

        Spacer(Modifier.height(16.dp))
        // ---------------- Team-Sperrtage bearbeiten ----------------
        Text("Team-Sperrtage bearbeiten", style = MaterialTheme.typography.titleMedium)
        TeamSperrtageEditor(vm)

        Spacer(Modifier.height(16.dp))
        // ---------------- Planungsmodus ----------------
        Text("Planungsmodus", style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("streng", "normal", "lockerer").forEach { m ->
                FilterChip(
                    selected = cfg.modus == m,
                    onClick = { vm.updateConfig { c -> c.copy(modus = m) } },
                    label = { Text(m.replaceFirstChar { it.uppercase() }) }
                )
            }
        }
        Text(
            "„Streng\" versucht nur die Stufe mit allen aktiven Regeln; „lockerer\" erlaubt dem Algorithmus im Notfall, Fairness-/Wochentags-Regeln zu entspannen (wird als Hinweis markiert).",
            style = MaterialTheme.typography.bodySmall
        )

        Spacer(Modifier.height(16.dp))
        // ---------------- .saniteam Export / Import ----------------
        Text("Daten (.saniteam)", style = MaterialTheme.typography.titleMedium)
        SaniteamExportImport(vm)

        Spacer(Modifier.height(16.dp))
        Text("Springer & priorisierte Teams", style = MaterialTheme.typography.titleMedium)
        SpringerEditor(vm)

        Spacer(Modifier.height(16.dp))
        Text("Präferenzen (Springer → bevorzugte Teams)", style = MaterialTheme.typography.titleMedium)
        if (cfg.praeferenzen.isEmpty()) Text("Keine hinterlegt.", style = MaterialTheme.typography.bodySmall)
        cfg.praeferenzen.forEach { (springer, teams) ->
            Text("• $springer: ${teams.joinToString()}")
        }

        Spacer(Modifier.height(16.dp))
        Text("Einsatz-Limits pro Person", style = MaterialTheme.typography.titleMedium)
        EinsatzLimitEditor(vm)

        Spacer(Modifier.height(80.dp))
    }
}

@Composable
fun SaniteamExportImport(vm: PlanerViewModel) {
    val context = LocalContext.current
    var meldung by remember { mutableStateOf<String?>(null) }

    // Datei-Auswahl (System-Dateidialog)
    val oeffnenLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                val text = context.contentResolver.openInputStream(uri)
                    ?.bufferedReader()?.use { it.readText() }
                if (text != null) {
                    if (vm.analyseImport(text) != null) {
                        vm.pruefeOeffnungAnfordern(text)   // oeffnet den Vorschau-Dialog
                        meldung = null
                    } else {
                        meldung = "Datei konnte nicht als .saniteam gelesen werden."
                    }
                }
            } catch (e: Exception) {
                meldung = "Lesefehler: ${e.message}"
            }
        }
    }

    // Export als echte Datei speichern (Downloads etc.)
    val speichernLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream")
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                context.contentResolver.openOutputStream(uri)?.use { out ->
                    out.write(vm.exportSaniteam().toByteArray(Charsets.UTF_8))
                }
                meldung = "Datei gespeichert."
            } catch (e: Exception) {
                meldung = "Schreibfehler: ${e.message}"
            }
        }
    }

    Column {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { speichernLauncher.launch("saniteam-export.saniteam") }) {
                Text("Datei speichern…")
            }
            OutlinedButton(onClick = { oeffnenLauncher.launch(arrayOf("*/*")) }) {
                Text("Datei öffnen…")
            }
        }
        meldung?.let {
            Text(it, style = MaterialTheme.typography.bodySmall,
                color = if (it.startsWith("Datei gespeichert")) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(4.dp))
        Text(
            "Alternativ: Eine .saniteam-Datei aus dem Messenger direkt mit dieser App öffnen – der Vorschau-Dialog erscheint automatisch.",
            style = MaterialTheme.typography.bodySmall
        )
    }
}

@Composable
fun TeamSperrtageEditor(vm: PlanerViewModel) {
    val cfg = vm.state.config
    if (cfg.teams.isEmpty()) {
        Text("Keine Teams vorhanden.", style = MaterialTheme.typography.bodySmall)
        return
    }
    var team by remember { mutableStateOf(cfg.teams.keys.first()) }
    LabeledDropdown("Team", cfg.teams.keys.toList(), team, Modifier.fillMaxWidth()) { team = it }
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Wochentage.dienst.forEach { tag ->
            val aktiv = tag in cfg.teamSperrtage[team].orEmpty()
            FilterChip(
                selected = aktiv,
                onClick = {
                    vm.updateConfig { c ->
                        val tage = c.teamSperrtage[team].orEmpty().toMutableList()
                        if (!tage.add(tag)) tage.remove(tag)
                        val neu = if (tage.isEmpty()) c.teamSperrtage - team else c.teamSperrtage + (team to tage)
                        c.copy(teamSperrtage = neu)
                    }
                    // auch in die .saniteam-Einstellung schreiben
                    vm.updateDatei { d ->
                        val tage = d.einstellung.teamSperrtage[team].orEmpty().toMutableList()
                        if (!tage.add(tag)) tage.remove(tag)
                        val neu = if (tage.isEmpty()) d.einstellung.teamSperrtage - team
                                  else d.einstellung.teamSperrtage + (team to tage)
                        d.copy(einstellung = d.einstellung.copy(teamSperrtage = neu))
                    }
                },
                label = { Text(tag.take(2)) }
            )
        }
    }
    cfg.teamSperrtage.forEach { (t, tage) ->
        Text("• $t: ${tage.joinToString()}", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun EinsatzLimitEditor(vm: PlanerViewModel) {
    val cfg = vm.state.config
    val allePersonen = (cfg.teams.values.flatten() + cfg.springer).sorted()
    var person by remember { mutableStateOf(allePersonen.firstOrNull() ?: "") }
    var limit by remember { mutableStateOf("") }

    if (allePersonen.isEmpty()) return
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        LabeledDropdown("Person", allePersonen, person, Modifier.weight(1f)) { person = it }
        OutlinedTextField(
            value = limit,
            onValueChange = { limit = it.filter { ch -> ch.isDigit() }.take(1) },
            label = { Text("Max./Monat") },
            modifier = Modifier.width(120.dp)
        )
        Button(onClick = {
            val v = limit.toIntOrNull()
            if (v != null && v > 0) {
                vm.updateConfig { c -> c.copy(personMaxEinsaetze = c.personMaxEinsaetze + (person to v)) }
                vm.updateDatei { d ->
                    d.copy(einstellung = d.einstellung.copy(personMaxEinsaetze = d.einstellung.personMaxEinsaetze + (person to v)))
                }
                limit = ""
            }
        }) { Text("Setzen") }
    }
    cfg.personMaxEinsaetze.forEach { (p, m) ->
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("• $p: max. $m", Modifier.weight(1f))
            TextButton(onClick = {
                vm.updateConfig { c -> c.copy(personMaxEinsaetze = c.personMaxEinsaetze - p) }
                vm.updateDatei { d ->
                    d.copy(einstellung = d.einstellung.copy(personMaxEinsaetze = d.einstellung.personMaxEinsaetze - p))
                }
            }) { Text("Entfernen") }
        }
    }
}

// ==============================================================================
// SPRINGER-EDITOR: Springer hinzufuegen/entfernen + priorisierte Teams pro Springer
// ==============================================================================
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun SpringerEditor(vm: PlanerViewModel) {
    val cfg = vm.state.config
    val datei = vm.state.datei
    val allePersonen = datei.personen.filter { it.aktiv }.map { it.vollerName() }.sorted()
    var neuerSpringer by remember { mutableStateOf("") }

    // --- Springer hinzufuegen/entfernen ---
    Text("Springer-Liste:", style = MaterialTheme.typography.bodySmall)
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        allePersonen.forEach { p ->
            val istSpringer = p in cfg.springer
            FilterChip(
                selected = istSpringer,
                onClick = {
                    vm.updateDatei { d ->
                        val liste = d.einstellung.springerNamen.toMutableList()
                        if (istSpringer) liste.remove(p) else liste.add(p)
                        d.copy(einstellung = d.einstellung.copy(springerNamen = liste))
                    }
                },
                label = { Text(p) }
            )
        }
    }
    Text(
        "Angetippt = ist Springer. Nur ausgebildete Personen ohne festes Team oder explizit Markierte tauchen im Plan als Springer auf.",
        style = MaterialTheme.typography.bodySmall
    )

    Spacer(Modifier.height(10.dp))

    // --- Priorisierte Teams pro Springer ---
    if (cfg.springer.isEmpty()) {
        Text("Keine Springer markiert.", style = MaterialTheme.typography.bodySmall)
        return
    }
    var springerWaehl by remember(cfg.springer) { mutableStateOf(cfg.springer.first()) }
    LabeledDropdown("Springer", cfg.springer, springerWaehl, Modifier.fillMaxWidth()) { springerWaehl = it }

    if (cfg.teams.isEmpty()) {
        Text("Keine Teams vorhanden.", style = MaterialTheme.typography.bodySmall)
        return
    }
    Text("Priorisierte Teams für $springerWaehl:", style = MaterialTheme.typography.bodySmall)
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        cfg.teams.keys.forEach { team ->
            val priorisiert = team in cfg.praeferenzen[springerWaehl].orEmpty()
            FilterChip(
                selected = priorisiert,
                onClick = {
                    vm.updateDatei { d ->
                        val aktuelle = d.einstellung.praeferenzen[springerWaehl].orEmpty().toMutableList()
                        if (!aktuelle.add(team)) aktuelle.remove(team)
                        val neu = if (aktuelle.isEmpty())
                            d.einstellung.praeferenzen - springerWaehl
                        else d.einstellung.praeferenzen + (springerWaehl to aktuelle)
                        d.copy(einstellung = d.einstellung.copy(praeferenzen = neu))
                    }
                },
                label = { Text(team) }
            )
        }
    }
    Text(
        "Leer = Springer darf überall. Mit Auswahl darf der Springer nur bei den markierten Teams eingesetzt werden.",
        style = MaterialTheme.typography.bodySmall
    )
}
