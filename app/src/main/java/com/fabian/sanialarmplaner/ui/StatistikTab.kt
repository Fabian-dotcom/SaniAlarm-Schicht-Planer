package com.fabian.sanialarmplaner.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.format.TextStyle
import java.util.Locale
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
        // 1. HEADER (v2: großer Titel) + tf-Chips als Mini-Buttons
        // ------------------------------------------------------------------
        Text("Statistik", style = MaterialTheme.typography.displayLarge,
            modifier = Modifier.padding(top = 14.dp, bottom = 14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            V2MiniButton("Alles", ghost = !(state.statistikVon == null && state.statistikBis == null),
                onClick = { vm.setStatistikZeitraum(null, null) })
            V2MiniButton("Dieses Jahr",
                ghost = !(state.statistikVon == LocalDate.now().withDayOfYear(1)),
                onClick = { vm.setStatistikZeitraum(LocalDate.now().withDayOfYear(1), LocalDate.now()) })
            V2MiniButton("Monat",
                ghost = !(state.statistikVon == LocalDate.now().withDayOfMonth(1)),
                onClick = { vm.setStatistikZeitraum(LocalDate.now().withDayOfMonth(1), LocalDate.now()) })
        }

        // ------------------------------------------------------------------
        // 2. SUMMARY als dunkle v2-Karte (nur 1 Karte, wie `.summary`)
        // ------------------------------------------------------------------
        val stats = vm.statistik()
        val kennzahlen = vm.kennzahlen()
        val gesamtImZeitraum = stats.sumOf { it.geplant + it.historisch }
        Spacer(Modifier.height(14.dp))
        V2DunkelKarte(Modifier.fillMaxWidth()) {
            Row(Modifier.fillMaxWidth()) {
                Column(Modifier.weight(1f)) {
                    V2Eyebrow("Einsätze gesamt")
                    Text("$gesamtImZeitraum", style = MaterialTheme.typography.headlineMedium,
                        color = Color.White)
                }
                Column(Modifier.weight(1f)) {
                    V2Eyebrow("Aktive Sanis")
                    Text("${stats.size}", style = MaterialTheme.typography.headlineMedium,
                        color = Color.White)
                }
                Column(Modifier.weight(1f)) {
                    V2Eyebrow("Ø pro Person")
                    Text(
                        if (stats.isEmpty()) "0" else "%.1f".format(gesamtImZeitraum.toDouble() / stats.size),
                        style = MaterialTheme.typography.headlineMedium,
                        color = Color.White,
                    )
                }
            }
        }

        // ------------------------------------------------------------------
        // 3. BELASTUNGSINDEX als v2-Balkenliste mit Avatar + Ø-Marke
        // ------------------------------------------------------------------
        Spacer(Modifier.height(26.dp))
        Row(verticalAlignment = Alignment.Bottom) {
            Text("Belastungsindex", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.width(8.dp))
            Text("relativ zum Ø", style = MaterialTheme.typography.bodySmall, color = V2.Muted)
        }
        Spacer(Modifier.height(8.dp))
        if (kennzahlen.isEmpty()) {
            Text("Keine Personen.", style = MaterialTheme.typography.bodySmall)
        } else {
            var detailPerson by remember { mutableStateOf<com.fabian.sanialarmplaner.logic.PersonKennzahlen?>(null) }
            val maxIndex = kennzahlen.maxOf { it.belastungsIndex }.coerceAtLeast(0.01)
            val mittel = kennzahlen.map { it.belastungsIndex }.average().takeIf { !it.isNaN() } ?: 0.0
            kennzahlen.forEach { k ->
                V2BalkenRow(
                    k.name,
                    "%.2f".format(k.belastungsIndex),
                    (k.belastungsIndex / maxIndex).toFloat(),
                    istDurchschnitt = kotlin.math.abs(k.belastungsIndex - mittel) < 0.05,
                )
                // Fairness-Badge + Klick für den Bericht
                Row(
                    Modifier.fillMaxWidth().clickableWithoutRippleCompat { detailPerson = k }.padding(start = 32.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SaniBadge(
                        "Fairness %+.0f%%".format(k.fairnessAbweichung * 100),
                        when {
                            k.fairnessAbweichung > 0.3 -> V2.Rot
                            k.fairnessAbweichung > 0.1 -> V2.Orange
                            else -> V2.Gruen
                        }
                    )
                    Spacer(Modifier.width(8.dp))
                    SaniBadge("Vertrauen: ${k.datenVertrauen}", v2VertrauensFarbe(
                        k.datenVertrauen, V2.Blau, V2.Orange, V2.Rot))
                    Spacer(Modifier.weight(1f))
                    Text("Details ›", style = MaterialTheme.typography.labelSmall, color = V2.Blau)
                }
                Spacer(Modifier.height(4.dp))
            }
            detailPerson?.let { k ->
                PersonBerichtDialog(k) { detailPerson = null }
            }
        }

        // ------------------------------------------------------------------
        // 3b. VERTEILUNG + Springer (kompakt)
        // ------------------------------------------------------------------
        Spacer(Modifier.height(16.dp))
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
                    val farben = listOf(V2.Blau, V2.Orange, V2.Rot,
                        Color(0xFF386A20), V2.Lavendel, Color(0xFF006A60))
                    planStats.values.sortedDescending().forEachIndexed { i, n ->
                        Box(Modifier.weight(n.toFloat()).fillMaxHeight().background(farben[i % farben.size]))
                    }
                }
                Spacer(Modifier.height(4.dp))
                planStats.entries.sortedByDescending { it.value }.forEachIndexed { i, (team, n) ->
                    val farben = listOf(V2.Blau, V2.Orange, V2.Rot,
                        Color(0xFF386A20), V2.Lavendel, Color(0xFF006A60))
                    Row {
                        Box(Modifier.size(10.dp).background(farben[i % farben.size]))
                        Spacer(Modifier.width(4.dp))
                        Text("$team: $n× (${(n / gesamt * 100).toInt()}%)", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }

        SaniSektion("Springer-Einsätze") {
            val springerStats = state.plan.mapNotNull { it.springer }.groupingBy { it }.eachCount()
            if (springerStats.isEmpty()) {
                Text("Keine Springer-Einsätze im Plan.", style = MaterialTheme.typography.bodySmall)
            }
            springerStats.forEach { (s, n) -> Text("• $s: $n×", style = MaterialTheme.typography.bodyMedium) }
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

        // Prüfungsphase-Liste im v2-Stil (`.exam`-Zeilen): Datum groß links
        Spacer(Modifier.height(26.dp))
        SaniAufklapp("Prüfungsphase · nächste 2 Monate", startOffen = false) {
            val termine = vm.state.datei.schultermine
                .filter { it.typ == "Klassenarbeit" }
                .mapNotNull { t ->
                    try { LocalDate.parse(t.datum) to t } catch (_: Exception) { null }
                }
                .filter { (d, _) -> !d.isBefore(LocalDate.now()) }
                .sortedBy { it.first }
                .take(10)
            if (termine.isEmpty()) {
                Text("Keine Klassenarbeiten eingetragen (Kalender-Tab).", style = MaterialTheme.typography.bodySmall)
            }
            termine.forEach { (d, t) ->
                V2TerminZeile(
                    d, t.titel,
                    if (t.klassen.isNotEmpty()) "${t.klassen.joinToString()} · ${t.personNamen.size + t.stufen.size} betroffen"
                    else if (t.stufen.isNotEmpty()) "Stufe ${t.stufen.joinToString()}"
                    else "Einzelne Person"
                )
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

// ==============================================================================
// LOKALE v2-BAUSTEINE (Stil aus index-v2/index.html)
// ==============================================================================

private fun v2VertrauensFarbe(wert: String, ok: Color, warn: Color, kritisch: Color): Color =
    when (wert.lowercase()) {
        "hoch" -> ok
        "mittel" -> warn
        else -> kritisch
    }

private fun Modifier.clickableWithoutRippleCompat(onClick: () -> Unit): Modifier = composed {
    clickable(
        interactionSource = remember { MutableInteractionSource() },
        indication = null,
        onClick = onClick,
    )
}
