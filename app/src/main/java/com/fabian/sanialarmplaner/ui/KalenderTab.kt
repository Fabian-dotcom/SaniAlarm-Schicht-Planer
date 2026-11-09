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
import com.fabian.sanialarmplaner.data.Schultermin
import com.fabian.sanialarmplaner.logic.KalenderAnalyse
import com.fabian.sanialarmplaner.ui.theme.ConflictRed
import com.fabian.sanialarmplaner.ui.theme.PendingOrange
import com.fabian.sanialarmplaner.viewmodel.PlanerViewModel
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun KalenderTab(vm: PlanerViewModel) {
    var monat by remember { mutableStateOf(YearMonth.now()) }
    var modus by remember { mutableStateOf(0) }   // 0=Termine, 1=Heatmap
    var klassenFilter by remember { mutableStateOf(setOf<String>()) }
    var neuerTermin by remember { mutableStateOf(false) }
    val alleKlassen = vm.klassenListe()

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp, horizontal = 12.dp)
    ) {
        // Monatsnavigation
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            IconButton(onClick = { monat = monat.minusMonths(1) }) { Text("‹") }
            Text(
                "${monat.month.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.GERMANY)} ${monat.year}",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 8.dp)
            )
            IconButton(onClick = { monat = monat.plusMonths(1) }) { Text("›") }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = modus == 0, onClick = { modus = 0 }, label = { Text("Termine") })
            FilterChip(selected = modus == 1, onClick = { modus = 1 }, label = { Text("Heatmap") })
        }
        if (alleKlassen.isNotEmpty()) {
            Text("Klassen-Filter (leer = alle):", style = MaterialTheme.typography.bodySmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                alleKlassen.forEach { k ->
                    FilterChip(
                        selected = k in klassenFilter,
                        onClick = {
                            klassenFilter = if (k in klassenFilter) klassenFilter - k else klassenFilter + k
                        },
                        label = { Text(k) }
                    )
                }
            }
        }

        Spacer(Modifier.height(8.dp))
        val von = monat.atDay(1)
        val bis = monat.atEndOfMonth()
        val analyse = vm.tagesAnalyse(von, bis, klassenFilter)

        // Monatsraster mit abgerundeten Ecken
        Card(Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium) {
            Column(Modifier.padding(8.dp)) {
                Row {
                    listOf("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So").forEach {
                        Text(it, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall)
                    }
                }
                var cursor = von
                val startOffset = (von.dayOfWeek.value + 6) % 7
                var firstRow = true
                while (cursor <= bis || (firstRow && cursor.dayOfWeek.value != 1)) {
                    Row {
                        var inZeile = 0
                        if (firstRow) {
                            repeat(startOffset) { Box(Modifier.weight(1f).heightIn(min = 44.dp)); inZeile++ }
                            firstRow = false
                        }
                        while (inZeile < 7 && cursor <= bis) {
                            TagesZelle(cursor, analyse[cursor], modus, Modifier.weight(1f))
                            cursor = cursor.plusDays(1)
                            inZeile++
                        }
                        repeat(7 - inZeile) { Box(Modifier.weight(1f).heightIn(min = 44.dp)) }
                    }
                    if (cursor > bis && !firstRow) break
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        // Engpässe & Konflikt-Banner (angelehnt an das Design-Mockup mit Badges)
        val probleme = KalenderAnalyse.problemTage(vm.state.datei, analyse)
        if (probleme.isNotEmpty()) {
            Text("Planungs-Engpässe", style = MaterialTheme.typography.titleMedium)
            Text(
                "An diesen Tagen fehlen Personen wegen Klassenarbeiten:",
                style = MaterialTheme.typography.bodySmall
            )
            Spacer(Modifier.height(4.dp))
            probleme.forEach { d ->
                val a = analyse[d] ?: return@forEach
                Card(
                    Modifier.fillMaxWidth().padding(vertical = 2.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Column(Modifier.padding(8.dp)) {
                        Text(d.format(fmt), style = MaterialTheme.typography.titleSmall)
                        Text(
                            "Nicht vollständig besetzt (1 von 2 Plätzen)",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(4.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            SaniBadge("${a.betroffenePersonen.size} KLASSENARBEITEN", ConflictRed)
                            SaniBadge("1 WARNING", PendingOrange)
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        // Termin-Liste des Monats
        Text("Termine im Monat", style = MaterialTheme.typography.titleMedium)
        val monatTermine = vm.state.datei.schultermine
            .filter { it.datum.startsWith(monat.toString().substring(0, 7)) }
            .sortedBy { it.datum }
        if (monatTermine.isEmpty()) {
            Text("Keine Termine eingetragen.", style = MaterialTheme.typography.bodySmall)
        }
        monatTermine.forEach { t ->
            Card(Modifier.fillMaxWidth().padding(vertical = 2.dp), shape = MaterialTheme.shapes.small) {
                Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("${t.datum}: ${t.titel}" + (if (t.klassen.isNotEmpty()) " (${t.klassen.joinToString()})" else ""))
                        if (t.typ != "Klassenarbeit") Text(t.typ, style = MaterialTheme.typography.labelSmall)
                    }
                    TextButton(onClick = { vm.loescheSchultermin(t) }) { Text("×") }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = { neuerTermin = true },
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.extraLarge
        ) {
            Text("+ Termin hinzufügen")
        }
        Spacer(Modifier.height(60.dp))
    }

    if (neuerTermin) {
        SchulterminDialog(vm) { neuerTermin = false }
    }
}

private val fmt = DateTimeFormatter.ofPattern("dd.MM.")

@Composable
fun TagesZelle(
    datum: LocalDate,
    analyse: com.fabian.sanialarmplaner.logic.TagesAnalyse?,
    modus: Int,
    modifier: Modifier = Modifier,
) {
    val bg = when {
        analyse == null -> Color.Transparent
        modus == 1 -> when (analyse.engpassStufe) {
            2 -> ConflictRed.copy(alpha = 0.35f)
            1 -> PendingOrange.copy(alpha = 0.35f)
            else -> Color(0xFF34C759).copy(alpha = 0.25f)
        }
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    Column(
        modifier
            .heightIn(min = 44.dp)
            .background(bg, MaterialTheme.shapes.small)
            .padding(2.dp)
    ) {
        Text(
            "${datum.dayOfMonth}",
            style = MaterialTheme.typography.labelSmall
        )
        if (analyse != null && analyse.termine.isNotEmpty()) {
            Text(
                if (analyse.termine.size == 1) analyse.termine.first().titel.take(8)
                else "${analyse.termine.size} Term.",
                style = MaterialTheme.typography.labelSmall,
                maxLines = 1
            )
        }
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class,
    androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun SchulterminDialog(vm: PlanerViewModel, onSchliessen: () -> Unit) {
    var datum by remember { mutableStateOf(LocalDate.now()) }
    var zeigeDatePicker by remember { mutableStateOf(false) }
    var titel by remember { mutableStateOf("Klassenarbeit") }
    var klassenText by remember { mutableStateOf("") }
    var stufenText by remember { mutableStateOf("") }
    var typ by remember { mutableStateOf("Klassenarbeit") }
    val klassen = vm.klassenListe()

    if (zeigeDatePicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = datum.toEpochDay() * 24 * 60 * 60 * 1000
        )
        DatePickerDialog(
            onDismissRequest = { zeigeDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { ms ->
                        datum = java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.of("UTC")).toLocalDate()
                    }
                    zeigeDatePicker = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { zeigeDatePicker = false }) { Text("Abbrechen") } }
        ) {
            DatePicker(state = datePickerState)
        }
    }

    AlertDialog(
        onDismissRequest = onSchliessen,
        confirmButton = {
            TextButton(onClick = {
                val d = datum
                vm.fuegeSchulterminHinzu(
                    Schultermin(
                        datum = d.toString(),
                        titel = titel.ifBlank { "Termin" },
                        klassen = klassenText.split(",").map { it.trim() }.filter { it.isNotBlank() },
                        stufen = stufenText.split(",").map { it.trim() }.filter { it.isNotBlank() },
                        typ = typ,
                    )
                )
                onSchliessen()
            }) { Text("Speichern") }
        },
        dismissButton = { TextButton(onClick = onSchliessen) { Text("Abbrechen") } },
        title = { Text("Neuer Schultermin") },
        text = {
            Column {
                OutlinedButton(
                    onClick = { zeigeDatePicker = true },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Datum: ${datum.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"))}")
                }
                OutlinedTextField(titel, { titel = it }, label = { Text("Titel") })
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("Klassenarbeit", "Ferien", "Feiertag", "Sonstiges").forEach { t ->
                        FilterChip(selected = typ == t, onClick = { typ = t }, label = { Text(t.take(4)) })
                    }
                }
                if (klassen.isNotEmpty()) {
                    Text("Klassen antippen:", style = MaterialTheme.typography.bodySmall)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        klassen.forEach { k ->
                            FilterChip(
                                selected = k in klassenText.split(",").map { it.trim() },
                                onClick = {
                                    val liste = klassenText.split(",").map { it.trim() }.filter { it.isNotBlank() }.toMutableList()
                                    if (k in liste) liste.remove(k) else liste.add(k)
                                    klassenText = liste.joinToString(",")
                                },
                                label = { Text(k) }
                            )
                        }
                    }
                }
                OutlinedTextField(klassenText, { klassenText = it }, label = { Text("Klassen (Komma-getrennt)") })
                OutlinedTextField(stufenText, { stufenText = it }, label = { Text("Stufen (z.B. 10,11)") })
            }
        }
    )
}