package com.fabian.sanialarmplaner.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.fabian.sanialarmplaner.data.vollerName
import com.fabian.sanialarmplaner.ui.theme.ActiveSaniBlue
import com.fabian.sanialarmplaner.ui.theme.BadgeGrau
import com.fabian.sanialarmplaner.ui.theme.ConflictRed
import com.fabian.sanialarmplaner.viewmodel.PlanerViewModel
import java.time.LocalDate
import java.time.format.DateTimeFormatter

// ==============================================================================
// PROFIL-TAB (Startseite): "Wer bin ich", mein naechster Dienst, Meinungen (#25)
// Design: groesste Karte mit Avatar-Initialen, Status-Zeile, Sektionen
// ==============================================================================
@Composable
fun ProfilTab(vm: PlanerViewModel, goto: (String) -> Unit) {
    val state = vm.state
    var profilAuswahl by remember { mutableStateOf(false) }
    val ich = state.ich
    val ichPerson = state.datei.personen.firstOrNull { it.vollerName() == ich }
    val meineDienste = if (ich.isBlank()) emptyList() else state.plan.filter { ich in it.mitglieder }
    val naechsterDienst = meineDienste.firstOrNull()
    val formatter = DateTimeFormatter.ofPattern("dd.MM.")

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // ---- Header: Avatar + Name + Status ----
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(56.dp)
                    .background(if (ich.isBlank()) BadgeGrau else ActiveSaniBlue, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    if (ich.isBlank()) "?" else ich.split(" ").first().take(1).uppercase(),
                    style = MaterialTheme.typography.headlineMedium,
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    if (ich.isBlank()) "Profil einrichten" else ich,
                    style = MaterialTheme.typography.headlineMedium
                )
                Text(
                    if (ichPerson?.ausbildungAbgeschlossen == true) "Ausgebildete:r Sanis"
                    else if (ichPerson != null) "Sanis in Ausbildung"
                    else "Noch kein Profil verknüpft",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            TextButton(onClick = { profilAuswahl = true }) { Text(if (ich.isBlank()) "Einrichten" else "Wechseln") }
        }

        // ---- Mein naechster Dienst ----
        SectionCard("Mein nächster Dienst") {
            if (naechsterDienst == null) {
                Text(
                    if (ich.isBlank()) "Richte zuerst dein Profil ein."
                    else if (state.plan.isEmpty()) "Noch kein Plan generiert — öffne den Plan-Tab."
                    else "Du bist im aktuellen Plan nicht eingeteilt.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                val datum = vm.datumFuer(naechsterDienst.woche, naechsterDienst.tag)
                Text(
                    buildString {
                        append("${naechsterDienst.tag}")
                        datum?.let { append(", ${it.format(formatter)}") }
                        append(" · Woche ${naechsterDienst.woche}")
                    },
                    style = MaterialTheme.typography.titleLarge,
                    color = ActiveSaniBlue
                )
                Spacer(Modifier.height(4.dp))
                Text(naechsterDienst.mitglieder.joinToString(" · "), style = MaterialTheme.typography.bodyLarge)
                naechsterDienst.springer?.let {
                    Text("Springer: $it", style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        // ---- Meine Einsatzbilanz ----
        SectionCard("Meine Einsatzbilanz") {
            if (ich.isBlank()) {
                Text("Profil einrichten, um deine Statistik zu sehen.", style = MaterialTheme.typography.bodyMedium)
            } else {
                val stats = vm.statistik().firstOrNull { it.name.startsWith(ich.split(" ").first()) }
                if (stats == null) {
                    Text("Noch keine Einsätze erfasst.", style = MaterialTheme.typography.bodyMedium)
                } else {
                    Row(Modifier.fillMaxWidth()) {
                        StatBox("Geplant", "${stats.geplant}", Modifier.weight(1f))
                        StatBox("Gesamt", "${stats.geplant + stats.historisch}", Modifier.weight(1f))
                        StatBox("Index", "%.2f".format(stats.belastungsIndex), Modifier.weight(1f))
                    }
                }
            }
        }

        // ---- Alle meine Dienste ----
        if (meineDienste.size > 1) {
            SectionCard("Alle meine Dienste (${meineDienste.size})") {
                meineDienste.forEachIndexed { i, e ->
                    if (i > 0) HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
                    val datum = vm.datumFuer(e.woche, e.tag)
                    Text(
                        "${e.tag}${datum?.let { ", ${it.format(formatter)}" } ?: ""} (W${e.woche}): ${e.mitglieder.joinToString()}",
                        style = MaterialTheme.typography.bodyLarge
                    )
                }
            }
        }

        // ---- Schnellzugriff ----
        SectionCard("Schnellzugriff") {
            QuickRow("Plan ansehen") { goto("plan") }
            SectionDivider()
            QuickRow("Ausfälle melden") { goto("ausfaelle") }
            SectionDivider()
            QuickRow("Vorbelegungen") { goto("vorbelegung") }
            SectionDivider()
            QuickRow("Kalender & Schultermine") { goto("kalender") }
            SectionDivider()
            QuickRow("Statistik") { goto("statistik") }
            SectionDivider()
            QuickRow("Einstellungen") { goto("einstellungen") }
        }

        Spacer(Modifier.height(16.dp))
    }

    if (profilAuswahl) {
        ProfilAuswahlDialog(vm) { profilAuswahl = false }
    }
}

@Composable
private fun SectionCard(titel: String, content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(
                titel.uppercase(),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
private fun SectionDivider() {
    HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp),
        color = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))
}

@Composable
private fun QuickRow(titel: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onClick() }.padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(titel, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Text("›", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun StatBox(label: String, wert: String, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(wert, style = MaterialTheme.typography.headlineMedium,
            color = ActiveSaniBlue, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun ProfilAuswahlDialog(vm: PlanerViewModel, onSchliessen: () -> Unit) {
    val personen = vm.state.datei.personen.filter { it.aktiv }.map { it.vollerName() }.sorted()
    var suche by remember { mutableStateOf("") }
    val gefiltert = personen.filter { it.contains(suche, ignoreCase = true) }

    AlertDialog(
        onDismissRequest = onSchliessen,
        title = { Text("Wer bist du?") },
        text = {
            Column {
                OutlinedTextField(
                    value = suche, onValueChange = { suche = it },
                    label = { Text("Suchen") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                Column(
                    Modifier.heightIn(max = 320.dp).verticalScroll(rememberScrollState())
                ) {
                    gefiltert.forEach { name ->
                        TextButton(
                            onClick = { vm.setzeIch(name); onSchliessen() },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(name, modifier = Modifier.fillMaxWidth())
                        }
                    }
                    if (gefiltert.isEmpty()) Text("Keine Treffer.", style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = { TextButton(onClick = onSchliessen) { Text("Abbrechen") } },
    )
}
