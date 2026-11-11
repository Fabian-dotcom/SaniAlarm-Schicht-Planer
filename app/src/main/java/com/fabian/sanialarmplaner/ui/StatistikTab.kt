package com.fabian.sanialarmplaner.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.fabian.sanialarmplaner.data.vollerName
import com.fabian.sanialarmplaner.ui.theme.ActiveSaniBlue
import com.fabian.sanialarmplaner.ui.theme.ConflictRed
import com.fabian.sanialarmplaner.ui.theme.PendingOrange
import com.fabian.sanialarmplaner.viewmodel.PlanerViewModel
import java.time.LocalDate
import java.time.format.DateTimeFormatter

// ==============================================================================
// TAB: STATISTIK — nach UI-Richtlinie: Progressive Disclosure, Sections,
// große Zahlen, Balken statt Text, Admin-Formulare aufklappbar.
// ==============================================================================
@Composable
fun StatistikTab(vm: PlanerViewModel) {
    val state = vm.state
    var zeigeVerlauf by remember { mutableStateOf(true) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp, horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // ------------------------------------------------------------------
        // 1. GLOBALER FILTER-HEADER (kompakt)
        // ------------------------------------------------------------------
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
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
        val formatter = DateTimeFormatter.ofPattern("dd.MM.yyyy")
        val vonText = state.statistikVon?.format(formatter) ?: "Anfang"
        val bisText = state.statistikBis?.format(formatter) ?: "Heute"
        Text("Zeitraum: $vonText – $bisText", style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)

        // ------------------------------------------------------------------
        // 2. HAUPT-KENNZAHLEN (Highlights, zwei Grid-Kacheln)
        // ------------------------------------------------------------------
        val stats = vm.statistik()
        val kennzahlen = vm.kennzahlen()
        val gesamtImZeitraum = stats.sumOf { it.geplant + it.historisch }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val top = kennzahlen.sortedByDescending { it.belastungsIndex }.take(3)
            SaniKennzahlKachel(
                "Meiste Einsätze",
                if (top.isEmpty()) "—" else top.first().name.split(" ").first(),
                if (top.isEmpty()) "Keine Daten im Zeitraum"
                else "Top 3: ${top.joinToString { it.name.split(" ").first() }}",
                Modifier.weight(1f)
            )
            SaniKennzahlKachel(
                "Dienste im Zeitraum",
                "$gesamtImZeitraum",
                "${stats.size} Personen aktiv",
                Modifier.weight(1f)
            )
        }

        // ------------------------------------------------------------------
        // 3. PERSONEN-KENNZAHLEN (kompakt: 2 Schlüsselwerte + Vertrauens-Badge)
        // ------------------------------------------------------------------
        SaniSektion("Personen-Kennzahlen") {
            if (kennzahlen.isEmpty()) {
                Text("Keine Personen.", style = MaterialTheme.typography.bodySmall)
            } else {
                var detailPerson by remember { mutableStateOf<com.fabian.sanialarmplaner.logic.PersonKennzahlen?>(null) }
                kennzahlen.forEach { k ->
                    Card(
                        onClick = { detailPerson = k },
                        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                        shape = MaterialTheme.shapes.medium,
                    ) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(k.name, style = MaterialTheme.typography.bodyLarge)
                                Spacer(Modifier.height(2.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text(
                                        "Index %.2f".format(k.belastungsIndex),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                    Text(
                                        "Fairness %+.0f%%".format(k.fairnessAbweichung * 100),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = when {
                                            k.fairnessAbweichung > 0.3 -> ConflictRed
                                            k.fairnessAbweichung > 0.1 -> PendingOrange
                                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                                        }
                                    )
                                }
                            }
                            SaniBadge(
                                "Vertrauen: ${k.datenVertrauen}",
                                vertrauensFarbe(
                                    k.datenVertrauen,
                                    MaterialTheme.colorScheme.primary,
                                    PendingOrange,
                                    ConflictRed
                                )
                            )
                        }
                    }
                }
                // Ebene 2: alle weiteren Werte nur im Dialog
                detailPerson?.let { k ->
                    PersonBerichtDialog(k) { detailPerson = null }
                }
            }
        }

        // ------------------------------------------------------------------
        // 4. VISUELLE DIAGRAMME (Balken statt Textreihen)
        // ------------------------------------------------------------------
        SaniSektion("Verteilung aktueller Plan") {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(selected = zeigeVerlauf, onClick = { zeigeVerlauf = true }, label = { Text("Balken") })
                FilterChip(selected = !zeigeVerlauf, onClick = { zeigeVerlauf = false }, label = { Text("Kuchen") })
            }
            val planStats = state.plan.filter { it.hatDienst }
                .groupingBy { it.mitglieder.joinToString(" & ") }.eachCount()
            if (planStats.isEmpty()) {
                Text("Noch kein Plan generiert.", style = MaterialTheme.typography.bodySmall)
            } else if (zeigeVerlauf) {
                val max = planStats.values.max()
                planStats.entries.sortedByDescending { it.value }.forEach { (team, n) ->
                    SaniBalken(team, "$n×", n.toFloat() / max)
                }
            } else {
                val gesamt = planStats.values.sum().toFloat()
                Row(Modifier.fillMaxWidth().height(24.dp)) {
                    val farben = listOf(ActiveSaniBlue, PendingOrange, ConflictRed,
                        Color(0xFF386A20), BadgeGrauFarbe(), Color(0xFF006A60))
                    planStats.values.sortedDescending().forEachIndexed { i, n ->
                        Box(Modifier.weight(n.toFloat()).fillMaxHeight().background(farben[i % farben.size]))
                    }
                }
                Spacer(Modifier.height(4.dp))
                planStats.entries.sortedByDescending { it.value }.forEachIndexed { i, (team, n) ->
                    val farben = listOf(ActiveSaniBlue, PendingOrange, ConflictRed,
                        Color(0xFF386A20), BadgeGrauFarbe(), Color(0xFF006A60))
                    Row {
                        Box(Modifier.size(10.dp).background(farben[i % farben.size]))
                        Spacer(Modifier.width(4.dp))
                        Text("$team: $n× (${(n / gesamt * 100).toInt()}%)", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }

        // Springer-Einsätze als kompakte Sektion
        SaniSektion("Springer-Einsätze") {
            val springerStats = state.plan.mapNotNull { it.springer }.groupingBy { it }.eachCount()
            if (springerStats.isEmpty()) {
                Text("Keine Springer-Einsätze im Plan.", style = MaterialTheme.typography.bodySmall)
            }
            springerStats.forEach { (s, n) -> Text("• $s: $n×", style = MaterialTheme.typography.bodyMedium) }
        }

        // Schulische Belastung kompakt
        SaniSektion("Schulische Belastung (kommende 2 Monate)") {
            val schulBelastung = vm.schulischeBelastung()
            if (schulBelastung.isEmpty()) {
                Text("Keine Schultermine eingetragen (Kalender-Tab).", style = MaterialTheme.typography.bodySmall)
            } else {
                val max = schulBelastung.values.maxOf { it.first }.coerceAtLeast(1)
                schulBelastung.entries.sortedByDescending { it.value.first }.forEach { (name, pair) ->
                    val (anzahl, termine) = pair
                    SaniBalken(
                        name, "$anzahl×", anzahl.toFloat() / max,
                        when {
                            anzahl >= 3 -> ConflictRed
                            anzahl >= 1 -> PendingOrange
                            else -> MaterialTheme.colorScheme.primary
                        }
                    )
                }
            }
        }

        // ------------------------------------------------------------------
        // 5. VERWALTUNG aufklappbar (Richtlinie: Admin getrennt von Lesen)
        // ------------------------------------------------------------------
        SaniAufklapp("Historische Schichten verwalten (+ Nachtragen)") {
            HistorieEditor(vm)
        }
        SaniAufklapp("Einsatzereignisse erfassen (#43: Alarm, Ort, Teilnahme)") {
            EinsatzErfassung(vm)
        }
        SaniAufklapp("Gespeicherte Pläne") {
            val plaene = vm.gespeichertePlaene()
            if (plaene.isEmpty()) {
                Text("Noch keine Pläne gespeichert.", style = MaterialTheme.typography.bodySmall)
            }
            plaene.forEach { p ->
                Text("• ${p.name} (${p.erstelltAm}): ${p.eintraege.size} Dienste",
                    style = MaterialTheme.typography.bodyMedium)
            }
        }

        Spacer(Modifier.height(60.dp))
    }
}

/** Grau-Farbe fuer Kuchendiagramm (aus Theme). */
@Composable
private fun BadgeGrauFarbe() = MaterialTheme.colorScheme.secondary

// ==============================================================================
// EINSATZERFASSUNG (#43): Alarmereignis mit Ort/Uhrzeit und tatsaechlicher Teilnahme
// ==============================================================================
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun EinsatzErfassung(vm: PlanerViewModel) {
    var datum by remember { mutableStateOf(LocalDate.now().toString()) }
    var uhrzeit by remember { mutableStateOf("") }
    var ort by remember { mutableStateOf("") }
    var auswahl by remember { mutableStateOf(setOf<String>()) }
    val allePersonen: List<String> = vm.state.datei.personen.filter { it.aktiv }.map { it.vollerName() }.sorted()

    Text(
        "Erfasse echte Alarme: Wer war eingeteilt, wer war tatsächlich da? Grundlage für die Einsatzquote.",
        style = MaterialTheme.typography.bodySmall
    )
    Spacer(Modifier.height(4.dp))
    OutlinedTextField(datum, { datum = it }, label = { Text("Datum (JJJJ-MM-TT)") },
        modifier = Modifier.fillMaxWidth(), singleLine = true)
    OutlinedTextField(uhrzeit, { uhrzeit = it }, label = { Text("Uhrzeit (HH:MM, optional)") },
        modifier = Modifier.fillMaxWidth(), singleLine = true)
    OutlinedTextField(ort, { ort = it }, label = { Text("Ort/Raum (optional)") },
        modifier = Modifier.fillMaxWidth(), singleLine = true)
    Spacer(Modifier.height(4.dp))
    Text("Wer war beteiligt (tippen = eingeteilt UND teilgenommen):", style = MaterialTheme.typography.labelSmall)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        allePersonen.forEach { p ->
            FilterChip(
                selected = p in auswahl,
                onClick = { auswahl = if (p in auswahl) auswahl - p else auswahl + p },
                label = { Text(p.split(" ").first()) }
            )
        }
    }
    Spacer(Modifier.height(4.dp))
    Button(
        onClick = {
            vm.fuegeEinsatzereignisHinzu(
                com.fabian.sanialarmplaner.data.Einsatzereignis(
                    datum = datum, uhrzeit = uhrzeit.trim(), ort = ort.trim(),
                    eingeteilt = auswahl.toList(), teilgenommen = auswahl.toList(),
                )
            )
            auswahl = emptySet()
        },
        enabled = auswahl.isNotEmpty(),
        modifier = Modifier.fillMaxWidth()
    ) { Text("Einsatz speichern") }

    val einsaetze = vm.einsatzereignisse()
    if (einsaetze.isNotEmpty()) {
        Spacer(Modifier.height(6.dp))
        Text("${einsaetze.size} Ereignisse:", style = MaterialTheme.typography.labelSmall)
        einsaetze.take(5).forEach { e ->
            Row {
                Text(
                    "${e.datum}${e.uhrzeit.takeIf { it.isNotBlank() }?.let { " $it" } ?: ""}" +
                        e.ort.takeIf { it.isNotBlank() }?.let { " · $it" }?.let { it } ?: "",
                    Modifier.weight(1f), style = MaterialTheme.typography.bodySmall
                )
                TextButton(onClick = { vm.loescheEinsatzereignis(e) }) { Text("×") }
            }
        }
    }
}
