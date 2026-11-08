package com.fabian.sanialarmplaner.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.fabian.sanialarmplaner.viewmodel.PlanerViewModel

/**
 * Globaler Dialog: wird angezeigt, wenn eine .saniteam-Datei ueber das System
 * mit der App geoeffnet wurde. Zeigt Vorschau (neue Personen, Dubletten,
 * Historie) und fragt, ob uebernommen werden soll.
 */
@Composable
fun ImportDialogHost(vm: PlanerViewModel) {
    val vorschau = vm._oeffnungsVorschau
    val meldung = vm._oeffnungsMeldung

    if (meldung != null) {
        AlertDialog(
            onDismissRequest = { vm.schliesseOeffnungsDialog() },
            confirmButton = { TextButton(onClick = { vm.schliesseOeffnungsDialog() }) { Text("OK") } },
            title = { Text("Datei geöffnet") },
            text = { Text(meldung) }
        )
        return
    }

    vorschau?.let { v ->
        AlertDialog(
            onDismissRequest = { vm.schliesseOeffnungsDialog() },
            confirmButton = {
                Button(onClick = { vm.uebernehmeImport(v); vm.schliesseOeffnungsDialog() }) {
                    Text("Übernehmen")
                }
            },
            dismissButton = {
                TextButton(onClick = { vm.schliesseOeffnungsDialog() }) { Text("Verwerfen") }
            },
            title = { Text(".saniteam-Datei öffnen") },
            text = {
                Column(
                    Modifier.verticalScroll(rememberScrollState())
                ) {
                    Text("In der Datei gefunden:", style = MaterialTheme.typography.titleSmall)
                    Text("• ${v.importPersonen} Personen")
                    Text("• ${v.neueHistorie} historische Schichten")
                    Text("• ${v.neueSperrtage} Team-Sperrtage-Gruppen")

                    if (v.neuePersonen.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text("Neue Personen (${v.neuePersonen.size}):", style = MaterialTheme.typography.titleSmall)
                        Text(v.neuePersonen.joinToString(", "), style = MaterialTheme.typography.bodySmall)
                    }
                    if (v.aktualisiertePersonen.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text("Wird aktualisiert (mehr Infos als vorhanden):", style = MaterialTheme.typography.titleSmall)
                        Text(v.aktualisiertePersonen.joinToString(", "), style = MaterialTheme.typography.bodySmall)
                    }
                    if (v.dubletten.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text("Dubletten (ignoriert):", style = MaterialTheme.typography.titleSmall)
                        Text(v.dubletten.joinToString(", "), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Deine vorhandenen Daten bleiben erhalten; nur neue Einträge kommen hinzu.",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        )
    }
}
