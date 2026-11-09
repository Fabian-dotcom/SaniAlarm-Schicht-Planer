package com.fabian.sanialarmplaner.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import kotlinx.coroutines.launch
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
import androidx.compose.ui.unit.dp
import com.fabian.sanialarmplaner.data.vollerName
import com.fabian.sanialarmplaner.ui.theme.ActiveSaniBlue
import com.fabian.sanialarmplaner.ui.theme.BadgeGrau
import com.fabian.sanialarmplaner.ui.theme.ConflictRed
import com.fabian.sanialarmplaner.viewmodel.PlanerViewModel
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
fun ProfilTab(vm: PlanerViewModel, goto: (String) -> Unit) {
    val state = vm.state
    val scope = rememberCoroutineScope()
    var profilAuswahl by remember { mutableStateOf(false) }
    val ich = state.ich
    val heute = LocalDate.now()
    val formatter = DateTimeFormatter.ofPattern("EEEE, dd.MM.", java.util.Locale.GERMANY)

    val aktiveSanis = state.datei.personen.count { it.aktiv }
    val diensteImPlan = state.plan.count { it.hatDienst }
    val ausfaelle = (state.kranke + state.abwesenheiten.filter { it.value.isNotEmpty() }.keys).size

    val naechster = if (ich.isBlank()) null else state.plan
        .filter { it.hatDienst && ich in it.mitglieder }
        .mapNotNull { e -> vm.datumFuer(e.woche, e.tag)?.let { it to e } }
        .filter { !it.first.isBefore(heute) }
        .minByOrNull { it.first }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Kopfzeile im Stil des Dashboards
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    if (ich.isBlank()) "Willkommen" else "Hallo, ${ich.split(" ").first()}",
                    style = MaterialTheme.typography.headlineMedium
                )
                Text(
                    "Dienstplan Dashboard",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            IconButton(onClick = { goto("einstellungen") }) {
                Icon(Icons.Default.Settings, contentDescription = "Einstellungen")
            }
            Box(
                Modifier
                    .size(40.dp)
                    .background(if (ich.isBlank()) BadgeGrau else ActiveSaniBlue, CircleShape)
                    .clickable { profilAuswahl = true },
                contentAlignment = Alignment.Center
            ) {
                Text(
                    if (ich.isBlank()) "?" else ich.take(1).uppercase(),
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White
                )
            }
        }

        // Kennzahlen-Kacheln (exakt wie im Mockup oben angeordnet)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatKachel("Gesamtübersicht", "$aktiveSanis", ActiveSaniBlue, Modifier.weight(1f))
            StatKachel("Aktive Sanis", "$aktiveSanis", MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
            StatKachel(
                "Offene Dienste", "$ausfaelle",
                if (ausfaelle > 0) ConflictRed else MaterialTheme.colorScheme.onSurface,
                Modifier.weight(1f)
            )
        }

        // Nächster Dienst Karte
        SectionCard("Mein nächster Dienst") {
            if (naechster == null) {
                Text(
                    when {
                        ich.isBlank() -> "Tippe oben auf den Kreis, um dein Profil zu wählen."
                        state.plan.isEmpty() -> "Noch kein Plan erstellt."
                        else -> "Kein weiterer Dienst in diesem Plan."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                val (datum, dienst) = naechster
                Text(
                    datum.format(formatter),
                    style = MaterialTheme.typography.titleLarge,
                    color = ActiveSaniBlue
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    (dienst.mitglieder + listOfNotNull(dienst.springer).filter { it !in dienst.mitglieder })
                        .joinToString(" · "),
                    style = MaterialTheme.typography.bodyLarge
                )
            }
        }

        // Aktionen / Generieren Button
        if (state.config.teams.isNotEmpty()) {
            Button(
                onClick = { scope.launch { vm.generiere() } },
                enabled = !state.laeuft,
                modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                shape = MaterialTheme.shapes.extraLarge
            ) { Text(if (state.laeuft) "Rechnet…" else "Plan generieren") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick = { goto("plan") }, modifier = Modifier.weight(1f)) { Text("Plan") }
            OutlinedButton(onClick = { goto("ausfaelle") }, modifier = Modifier.weight(1f)) { Text("Ausfälle") }
            OutlinedButton(onClick = { goto("statistik") }, modifier = Modifier.weight(1f)) { Text("Statistik") }
        }
    }

    if (profilAuswahl) {
        ProfilAuswahlDialog(vm) { profilAuswahl = false }
    }
}

@Composable
private fun SectionCard(titel: String, content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium) {
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
private fun StatKachel(label: String, wert: String, farbe: Color, modifier: Modifier = Modifier) {
    Card(
        modifier,
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(
                label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1
            )
            Spacer(Modifier.height(4.dp))
            Text(wert, style = MaterialTheme.typography.headlineMedium, color = farbe)
        }
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