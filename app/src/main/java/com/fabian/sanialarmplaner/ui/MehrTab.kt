package com.fabian.sanialarmplaner.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.fabian.sanialarmplaner.viewmodel.PlanerViewModel
import kotlinx.coroutines.launch

/**
 * "Mehr"-Bereich: Ausfälle, Vorbelegung, Statistik, Einstellungen als Unterseiten.
 * Stil wie ProfilTab: Sektions-Karten, klare Chip-Navigation.
 * Plan-generieren nur auf Plan- und Vorbelegungs-Seite (nicht mehr global).
 */
@Composable
fun MehrTab(vm: PlanerViewModel, unterseite: String, onUnterseite: (String) -> Unit) {
    val coroutineScope = rememberCoroutineScope()
    val state = vm.state

    Column(Modifier.fillMaxSize()) {
        // Unterseiten-Umschaltung (Chips statt Scroll-Tabs)
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            FilterChip(
                selected = unterseite == "ausfaelle",
                onClick = { onUnterseite("ausfaelle") },
                label = { Text("Ausfälle") }
            )
            FilterChip(
                selected = unterseite == "vorbelegung",
                onClick = { onUnterseite("vorbelegung") },
                label = { Text("Vorbelegung") }
            )
            FilterChip(
                selected = unterseite == "statistik",
                onClick = { onUnterseite("statistik") },
                label = { Text("Statistik") }
            )
            FilterChip(
                selected = unterseite == "einstellungen",
                onClick = { onUnterseite("einstellungen") },
                label = { Text("Einst.") }
            )
        }

        Box(Modifier.weight(1f)) {
            when (unterseite) {
                "ausfaelle" -> AusfaelleTab(vm)
                "vorbelegung" -> VorbelegungTab(vm)
                "statistik" -> StatistikTab(vm)
                "einstellungen" -> EinstellungenTab(vm)
            }
        }

        // Plan generieren NUR auf Vorbelegung (Plan-Tab hat seinen eigenen Button);
        // mit aktuellem Schritt statt "Rechnet..."
        if (unterseite == "vorbelegung") {
            Button(
                onClick = { coroutineScope.launch { vm.generiere() } },
                enabled = !state.laeuft,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp)
            ) {
                Text(
                    if (state.laeuft) vm.fortlaufend.ifBlank { "Rechnet…" }
                    else "Plan generieren"
                )
            }
        }
    }
}
