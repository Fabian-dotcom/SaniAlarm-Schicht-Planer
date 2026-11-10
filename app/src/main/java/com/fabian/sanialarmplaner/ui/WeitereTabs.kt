package com.fabian.sanialarmplaner.ui

import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import com.fabian.sanialarmplaner.ui.theme.ActiveSaniBlue
import com.fabian.sanialarmplaner.ui.theme.BadgeGrau
import com.fabian.sanialarmplaner.ui.theme.ConflictRed
import com.fabian.sanialarmplaner.ui.theme.PendingOrange
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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
    // (terminFuerPerson oben bereits deklariert)
    var suche by remember { mutableStateOf("") }
    var terminFuerPerson by remember { mutableStateOf<Person?>(null) }

    val gefilterte = state.datei.personen.filter { p ->
        suche.isBlank() ||
            p.vollerName().contains(suche, ignoreCase = true) ||
            p.klasse.contains(suche, ignoreCase = true) ||
            p.stufe.contains(suche, ignoreCase = true)
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp, horizontal = 12.dp)
    ) {
        // Kopf: Titel + Aktionen in zwei Zeilen (kein Abschneiden mehr)
        Text(
            if (suche.isBlank()) "Personen-Kartei (${state.datei.personen.size})"
            else "Treffer: ${gefilterte.size} von ${state.datei.personen.size}",
            style = MaterialTheme.typography.headlineMedium
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            FilterChip(
                selected = !gridAnsicht, onClick = { gridAnsicht = false }, label = { Text("Liste") },
                modifier = Modifier.weight(1f)
            )
            FilterChip(
                selected = gridAnsicht, onClick = { gridAnsicht = true }, label = { Text("Kacheln") },
                modifier = Modifier.weight(1f)
            )
            Button(onClick = { neu = true }, modifier = Modifier.weight(1f)) { Text("+ Neu") }
        }
        // Aktionen als Sektions-Karte (ProfilStil statt verstreuter Buttons)
        Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Column(Modifier.padding(vertical = 4.dp)) {
            Row(
                Modifier.fillMaxWidth().clickable { zeigeQrBeitritt = true }.padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Beitritt per QR-Code", Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                Text("â€º", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            HorizontalDivider(modifier = Modifier.padding(start = 16.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)
            ) {
                Text(
                    "Jedes Team braucht mind. 1 ausgebildete Person. Angaben bleiben lokal (.saniteam).",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            }
        }
        Spacer(Modifier.height(4.dp))

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

        // Sortierung + Gruppierung: aufklappbar (Progressive Disclosure)
        var sortierung by remember { mutableStateOf(state.karteiSortierung) }
        var gruppierung by remember { mutableStateOf("keine") }   // keine|stufe|ausbildung
        val springer = state.config.springer.toSet()

        fun istSpringer(p: Person) = p.vollerName() in springer
        fun vergleichsWert(p: Person, key: String): String = when (key) {
            "vorname" -> p.vorname
            "stufe" -> p.stufe.ifBlank { "zz" }
            "ausbildung" -> if (p.ausbildungAbgeschlossen) "A" else "B"
            else -> p.nachname.ifBlank { p.vorname }
        }

        // sortierte Liste: inaktive ganz unten, dann nach Kriterium
        val sortierte = gefilterte.sortedWith(
            compareBy({ !it.aktiv }, { vergleichsWert(it, sortierung) }, { it.nachname }, { it.vorname })
        )
        SaniAufklapp("Anzeige anpassen (Sortierung, Gruppierung)") {
            Text("Sortierung:", style = MaterialTheme.typography.labelSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf("nachname" to "Name", "vorname" to "Vorname", "stufe" to "Stufe", "ausbildung" to "Ausbildung")
                    .forEach { (key, label) ->
                        FilterChip(
                            selected = sortierung == key,
                            onClick = { sortierung = key },
                            label = { Text(label) },
                            modifier = Modifier.heightIn(min = 28.dp)
                        )
                    }
            }
            if (!gridAnsicht) {
                Text("Gruppierung:", style = MaterialTheme.typography.labelSmall)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf("keine" to "Keine", "stufe" to "Stufe", "ausbildung" to "Ausbildung")
                        .forEach { (key, label) ->
                            FilterChip(
                                selected = gruppierung == key,
                                onClick = { gruppierung = key },
                                label = { Text(label) },
                                modifier = Modifier.heightIn(min = 28.dp)
                            )
                        }
                }
            }
        }
        if (sortierte.isEmpty() && state.datei.personen.isNotEmpty()) {
            Text("Keine Treffer für '$suche'.", style = MaterialTheme.typography.bodySmall)
        }

        if (gridAnsicht) {
            // Team-Zuordnung für Kacheln (Name -> Teamnamen)
            val personZuTeams = state.config.teams.entries
                .flatMap { (team, mitglieder) -> mitglieder.map { it to team } }
                .groupBy({ it.first }, { it.second })

            // Wunsch: 2er-Teams nebeneinander; ALLEINIGE ans ENDE
            val (mitPartner, alleinige) = sortierte.partition { p ->
                p.bevorzugterPartner.isNotBlank() &&
                    sortierte.any { q -> q.vollerName() == p.bevorzugterPartner && q.vollerName() != p.vollerName() }
            }
            val zeilen = mutableListOf<List<Person>>()
            val bereitsGezeigt = mutableSetOf<String>()
            for (p in mitPartner) {
                if (p.vollerName() in bereitsGezeigt) continue
                val partner = mitPartner.firstOrNull { it.vollerName() == p.bevorzugterPartner }
                if (partner != null) {
                    zeilen.add(listOf(p, partner))
                    bereitsGezeigt += p.vollerName(); bereitsGezeigt += partner.vollerName()
                }
            }
            // alle übrig gebliebenen ans Ende
            zeilen.addAll(alleinige.filter { it.vollerName() !in bereitsGezeigt }.map { listOf(it) })

            zeilen.forEach { paarzeile ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    paarzeile.forEach { p ->
                        PersonKachel(
                            p, Modifier.weight(1f),
                            personZuTeams[p.vollerName()].orEmpty(),
                            istSpringer = istSpringer(p),
                        ) { bearbeite = p }
                    }
                    if (paarzeile.size == 1) Spacer(Modifier.weight(1f))
                }
                Spacer(Modifier.height(8.dp))
            }
        } else if (gruppierung == "keine") {
            sortierte.forEach { p -> KarteiZeile(p, istSpringer(p), { terminFuerPerson = p }) { bearbeite = p } }
        } else {
            // Gruppierte Listenansicht: Abschnitte mit Ãœberschrift
            val gruppen = when (gruppierung) {
                "stufe" -> sortierte.groupBy { p ->
                    if (p.stufe.isBlank()) "(ohne Stufe)"
                    else if (p.klasse.isNotBlank()) "${p.stufe}${p.klasse}"
                    else p.stufe
                }.toSortedMap()
                else -> sortierte.groupBy { p ->
                    if (p.ausbildungAbgeschlossen) "Ausgebildete" else "In Ausbildung"
                }.toSortedMap()
            }
            gruppen.forEach { (titel, liste) ->
                Text(
                    "$titel (${liste.size})",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(top = 10.dp, bottom = 2.dp)
                )
                liste.forEach { p -> KarteiZeile(p, istSpringer(p), { terminFuerPerson = p }) { bearbeite = p } }
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
    // Klassenarbeit direkt in der Kartei anlegen (#52): nur Person / ganze Klasse /
    // ganze Stufe, mit Anzeige der betroffenen Anzahl
    terminFuerPerson?.let { p ->
        SchulterminFuerPersonDialog(vm, p) { terminFuerPerson = null }
    }
    if (zeigeQrBeitritt) {
        BeitrittQrDialog(vm) { zeigeQrBeitritt = false }
    }
}

/** Eine Zeile in der Karten-Liste (mit Springer-Badge). */
@Composable
fun KarteiZeile(p: Person, istSpringer: Boolean, onTermin: () -> Unit, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(40.dp).background(
                    (if (p.aktiv) ActiveSaniBlue else BadgeGrau).copy(alpha = 0.15f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(p.vorname.take(1).uppercase(), style = MaterialTheme.typography.titleMedium,
                    color = if (p.aktiv) ActiveSaniBlue else BadgeGrau)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(p.vollerName(), style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val info = buildList {
                    if (p.klasse.isNotBlank()) add("${p.stufe}${p.klasse}") else if (p.stufe.isNotBlank()) add(p.stufe)
                    if (p.ausbildungAbgeschlossen) add("ausgebildet")
                    if (istSpringer) add("Springer")
                    if (!p.aktiv) add("inaktiv")
                }.joinToString(" Â· ")
                if (info.isNotBlank()) Text(info, style = MaterialTheme.typography.bodySmall,
                    color = if (p.aktiv) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error)
            }
            IconButton(onClick = onTermin) { Icon(Icons.Default.DateRange, "Schultermin eintragen") }
        }
    }
}

@Composable
fun PersonKachel(
    p: Person,
    modifier: Modifier = Modifier,
    teams: List<String> = emptyList(),
    istSpringer: Boolean = false,
    onClick: () -> Unit,
) {
    Card(modifier = modifier, onClick = onClick) {
        Column(Modifier.padding(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Ausbildungs-Badge (Chip statt Emoji, barrierefrei beschriftet)
                if (p.ausbildungAbgeschlossen) {
                    Surface(
                        shape = MaterialTheme.shapes.small,
                        color = MaterialTheme.colorScheme.primaryContainer
                    ) {
                        Text(
                            "AUSB",
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier
                                .padding(horizontal = 5.dp, vertical = 1.dp)
                                .semantics { contentDescription = "Ausbildung abgeschlossen" },
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                    Spacer(Modifier.width(6.dp))
                }
                Text(
                    p.vollerName(),
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
            }
            if (p.stufe.isNotBlank() || p.klasse.isNotBlank() || !p.aktiv || istSpringer) {
                Text(
                    buildList {
                        if (p.klasse.isNotBlank()) add("${p.stufe}${p.klasse}")
                        else if (p.stufe.isNotBlank()) add(p.stufe)
                        if (istSpringer) add("Springer")
                        if (!p.aktiv) add("INAKTIV")
                    }.joinToString(" Â· "),
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    color = if (p.aktiv) MaterialTheme.colorScheme.onSurfaceVariant
                            else MaterialTheme.colorScheme.error
                )
            }
            // Team-Zugehoerigkeit kompakt darunter
            if (teams.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    teams.joinToString(" Â· "),
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.primary
                )
            }
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
    var stufe by remember { mutableStateOf(bestaehend?.stufe ?: "") }
    var klasse by remember { mutableStateOf(bestaehend?.klasse ?: "") }
    var geschlecht by remember { mutableStateOf(bestaehend?.geschlecht ?: "") }
    var partner by remember { mutableStateOf(bestaehend?.bevorzugterPartner ?: "") }
    var ausbildung by remember { mutableStateOf(bestaehend?.ausbildungAbgeschlossen ?: false) }
    var ausbildungSeit by remember { mutableStateOf(bestaehend?.ausbildungSeit ?: "") }
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
                        stufe = stufe, klasse = klasse.trim(), geschlecht = geschlecht,
                        bevorzugterPartner = partner.trim(),
                        ausbildungAbgeschlossen = ausbildung,
                        ausbildungSeit = ausbildungSeit.trim(), seit = seit.trim(),
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
                // Stufe: Dropdown 7-10, Q1-Q4 (#Wunsch: Klassen gibt es nur bis 10)
                Text("Stufe:", style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    com.fabian.sanialarmplaner.logic.KennzahlenEngine.STUFEN.forEach { s ->
                        FilterChip(
                            selected = stufe == s,
                            onClick = {
                                stufe = s
                                if (s.startsWith("Q")) klasse = ""   // ab Q1 keine Klassen
                            },
                            label = { Text(s) }
                        )
                    }
                }
                if (stufe.isNotBlank() && !stufe.startsWith("Q")) {
                    Text("Klasse:", style = MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        listOf("1", "2", "3", "4").forEach { k ->
                            FilterChip(
                                selected = klasse == k,
                                onClick = { klasse = k },
                                label = { Text(k) }
                            )
                        }
                    }
                    if (klasse.isNotBlank()) {
                        Text("Anzeige: ${stufe}$klasse", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary)
                    }
                }
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
                if (ausbildung) {
                    OutlinedTextField(
                        ausbildungSeit, { ausbildungSeit = it },
                        label = { Text("Ausbildung seit (JJJJ-MM)") },
                        modifier = Modifier.fillMaxWidth()
                    )
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


@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
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
                            Text("Ã—", color = MaterialTheme.colorScheme.error)
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
        // ---------------- Regeln (Progressive Disclosure: Infos hinter Info-Icon) --
        SaniAufklapp("Regeln (ein-/ausschaltbar)", startOffen = false) {
        data class RegelRow(val name: String, val aktiv: Boolean, val untertitel: String?, val setter: (Boolean) -> Unit)
        val regelListe = listOf(
            RegelRow("Team-Sperrtage", cfg.regeln.teamSperrtageAktiv, "Team kann an bestimmten Wochentagen nie") { v ->
                vm.updateConfig { c -> c.copy(regeln = c.regeln.copy(teamSperrtageAktiv = v)) }
            },
            RegelRow("Max. 1 Schicht pro Woche", cfg.regeln.maxEineSchichtProWoche, "Ein Team nur einmal pro Woche") { v ->
                vm.updateConfig { c -> c.copy(regeln = c.regeln.copy(maxEineSchichtProWoche = v)) }
            },
            RegelRow("Kein Wochentag doppelt im Monat", cfg.regeln.wochentagNurEinmal, "Verteilt Teams gleichmaessig über Wochentage") { v ->
                vm.updateConfig { c -> c.copy(regeln = c.regeln.copy(wochentagNurEinmal = v)) }
            },
            RegelRow("Kein Freitag→Montag-Doppeldienst", cfg.regeln.keinBackToBack, "Kein Direktwechsel ueber das Wochenende") { v ->
                vm.updateConfig { c -> c.copy(regeln = c.regeln.copy(keinBackToBack = v)) }
            },
            RegelRow("Springer-Präferenzen", cfg.regeln.springerPraeferenzen, "Springer nur bei bevorzugten Teams") { v ->
                vm.updateConfig { c -> c.copy(regeln = c.regeln.copy(springerPraeferenzen = v)) }
            },
            RegelRow("Fairness (1–2× pro 2-Wochen-Block)", cfg.regeln.blockFairness, "Jeder kommt mindestens 1x pro Block dran") { v ->
                vm.updateConfig { c -> c.copy(regeln = c.regeln.copy(blockFairness = v)) }
            },
            RegelRow("Klassenarbeit beeinträchtigt Planung", cfg.regeln.klassenarbeitModus != "aus", "Person mit Pruefung wird nicht eingeteilt") { v ->
                vm.updateConfig { c -> c.copy(regeln = c.regeln.copy(
                    klassenarbeitModus = if (v) "streng" else "aus"
                )) }
            },
        )
        regelListe.forEach { r ->
            SaniSchalter(r.name, r.aktiv, r.untertitel, r.setter)
        }
        Text(
            "Alle Regeln können hier abgeschaltet werden — bei Unlösbarkeit entspannt der Planer automatisch und erklärt dies im Plan.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(Modifier.height(10.dp))
        Text("Klassenarbeits-Modus:", style = MaterialTheme.typography.bodySmall)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("streng" to "Streng", "gewichtet" to "Gewichtet", "aus" to "Deaktiviert").forEach { (key, label) ->
                FilterChip(
                    selected = cfg.regeln.klassenarbeitModus == key,
                    onClick = { vm.updateConfig { c -> c.copy(regeln = c.regeln.copy(klassenarbeitModus = key)) } },
                    label = { Text(label) }
                )
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = cfg.regeln.klassenarbeitVortag,
                onCheckedChange = { v -> vm.updateConfig { c -> c.copy(regeln = c.regeln.copy(klassenarbeitVortag = v)) } }
            )
            Text("Vortagsfaktor: Lernen am Vortag als weicher Hinweis", style = MaterialTheme.typography.bodySmall)
        }
        } // Ende SaniAufklapp(Regeln)

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
            "â€žStreng\" versucht nur die Stufe mit allen aktiven Regeln; â€žlockerer\" erlaubt dem Algorithmus im Notfall, Fairness-/Wochentags-Regeln zu entspannen (wird als Hinweis markiert).",
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
        Text("Präferenzen (Springer â†’ bevorzugte Teams)", style = MaterialTheme.typography.titleMedium)
        if (cfg.praeferenzen.isEmpty()) Text("Keine hinterlegt.", style = MaterialTheme.typography.bodySmall)
        cfg.praeferenzen.forEach { (springer, teams) ->
            Text("â€¢ $springer: ${teams.joinToString()}")
        }

        Spacer(Modifier.height(16.dp))
        Text("Einsatz-Limits pro Person", style = MaterialTheme.typography.titleMedium)
        EinsatzLimitEditor(vm)

        Spacer(Modifier.height(16.dp))
        Text("Jahrgangsaufstieg", style = MaterialTheme.typography.titleMedium)
        var aufstiegMeldung by remember { mutableStateOf<String?>(null) }
        Text(
            "Alle Personen steigen einmal auf: Stufe 10 wird Q1 (Klassen fallen in der Oberstufe weg), Q1â†’Q2, Q2â†’Q3, Q3â†’Q4. Klassen innerhalb 7â€“10 bleiben erhalten.",
            style = MaterialTheme.typography.bodySmall
        )
        var bestaetigeAufstieg by remember { mutableStateOf(false) }
        Button(onClick = { bestaetigeAufstieg = true }) { Text("Alle Personen aufsteigen lassen") }
        aufstiegMeldung?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        }
        if (bestaetigeAufstieg) {
            AlertDialog(
                onDismissRequest = { bestaetigeAufstieg = false },
                title = { Text("Aufstieg bestätigen") },
                text = { Text("Alle ${vm.state.datei.personen.size} Personen steigen eine Stufe auf? Dies kann nicht rückgängig gemacht werden.") },
                confirmButton = {
                    TextButton(onClick = {
                        vm.alleAufsteigen()
                        aufstiegMeldung = "Alle Personen sind aufgestiegen."
                        bestaetigeAufstieg = false
                    }) { Text("Ja, aufsteigen") }
                },
                dismissButton = { TextButton(onClick = { bestaetigeAufstieg = false }) { Text("Abbrechen") } }
            )
        }

        Spacer(Modifier.height(16.dp))
        Text("Gruppen", style = MaterialTheme.typography.titleMedium)
        GruppenEditor(vm)

        Spacer(Modifier.height(16.dp))
        Text("Standardsortierung der Kartei", style = MaterialTheme.typography.titleMedium)
        val aktuelleSortierung = vm.state.karteiSortierung
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("nachname" to "Nachname", "vorname" to "Vorname", "klasse" to "Klasse", "ausbildung" to "Ausbildung")
                .forEach { (key, label) ->
                    FilterChip(
                        selected = aktuelleSortierung == key,
                        onClick = { vm.setzeKarteiSortierung(key) },
                        label = { Text(label) }
                    )
                }
        }

        Spacer(Modifier.height(16.dp))
        Text("Backups", style = MaterialTheme.typography.titleMedium)
        BackupEditor(vm)

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
                Text("Datei speichernâ€¦")
            }
            OutlinedButton(onClick = { oeffnenLauncher.launch(arrayOf("*/*")) }) {
                Text("Datei öffnenâ€¦")
            }
        }
        meldung?.let {
            Text(it, style = MaterialTheme.typography.bodySmall,
                color = if (it.startsWith("Datei gespeichert")) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(4.dp))
        Text(
            "Alternativ: Eine .saniteam-Datei aus dem Messenger direkt mit dieser App öffnen â€“ der Vorschau-Dialog erscheint automatisch.",
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
        Text("â€¢ $t: ${tage.joinToString()}", style = MaterialTheme.typography.bodySmall)
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
            Text("â€¢ $p: max. $m", Modifier.weight(1f))
            TextButton(onClick = {
                vm.updateConfig { c -> c.copy(personMaxEinsaetze = c.personMaxEinsaetze - p) }
                vm.updateDatei { d ->
                    d.copy(einstellung = d.einstellung.copy(personMaxEinsaetze = d.einstellung.personMaxEinsaetze - p))
                }
            }) { Text("Entfernen") }
        }
    }
}

/** Ausfuehrlicher Bericht pro Person: jede Kennzahl erklaert. */
@Composable
fun PersonBerichtDialog(k: com.fabian.sanialarmplaner.logic.PersonKennzahlen, onSchliessen: () -> Unit) {
    AlertDialog(
        onDismissRequest = onSchliessen,
        confirmButton = { TextButton(onClick = onSchliessen) { Text("SchlieÃŸen") } },
        title = { Text(k.name) },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()).heightIn(max = 480.dp)
            ) {
                BerichtZeile("Belastungsindex", "%.2f".format(k.belastungsIndex),
                    "Deine Dienste im Verhältnis zum Durchschnitt der Gruppe. 1,0 = genau durchschnittlich, 1,2 = 20 % mehr als der Durchschnitt. Hilft, Ãœber-/Unterbelastung fair zu erkennen.")
                BerichtZeile("Kurzzeitbelastung", "%.2f".format(k.kurzzeitBelastung),
                    "Wie viele deiner Dienste in jüngerer Zeit lagen. Dienste der letzten Wochen zählen voll, ältere verlieren an Gewicht (Halbwertszeit 28 Tage). Zeigt ungünstige Häufungen, ohne die Vergangenheit zu vergessen.")
                BerichtZeile("Fairness-Abweichung", "%+.0f%%".format(k.fairnessAbweichung * 100),
                    "Vergleicht deine tatsächlichen Dienste damit, wie viele angesichts deiner Verfügbarkeit zu erwarten wären. +20 % heiÃŸt: Du hattest mehr Dienste als bei deiner Situation üblich. Die Folgeplanung entlastet dich dann stärker.")
                BerichtZeile("Wochentags-Balance", "%.2f".format(k.wochentagBalance),
                    "Wie gleichmäÃŸig deine Dienste über Montags bis Freitage verteilt sind. 0 = sehr gleichmäÃŸig; höhere Werte bedeuten Häufung an bestimmten Tagen.")
                BerichtZeile("Springer-Zusatzbelastung", "${k.springerZusatzbelastung}Ã—",
                    "Wie oft du bei Teams aushalfst, die nicht zu deinen bevorzugten Teams gehören. Zeigt, wie oft du auÃŸerhalb deiner Vorlieben eingesprungen bist.")
                if (k.einsatzquote != null) {
                    BerichtZeile("Einsatzquote", "%.0f%%".format(k.einsatzquote * 100),
                        "Wie oft du bei deinen eingeteilten Diensten tatsächlich anwesend warst. Erfordert dokumentierte Teilnahmen (noch nicht erfasst).")
                }
                BerichtZeile("Team-Flexibilität", "${k.teamFlexibilitaet}",
                    "In wie vielen Teams du regelkonform sitzen könntest (eigenes Team + Teams, in denen die Ausbildungs-Regel intact bliebe). Hoher Wert = du bist als Vertretung vielseitig nutzbar.")
                BerichtZeile("Qualifikationsbeitrag", "${k.qualifikationsBeitrag}",
                    "Wie viele Teams ohne dich keine ausgebildete Person mehr hätten. Ein MaÃŸ für Planungssicherheit â€” nicht dafür, dass du öfter drankommst.")
                BerichtZeile("Planungsoptionen", "${k.planungsOptionen}",
                    "Anzahl der Tage, an denen du theoretisch dienen könntest (nach Abzug von Krank-, Sperr- und Abwesenheitstagen). Wenige Optionen = du bist seltener verfügbar.")
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                Text("Entwicklung (4 / 12 / 26 Wochen)", style = MaterialTheme.typography.titleSmall)
                listOf(4, 12, 26).forEach { w ->
                    val index = k.verlaufWerte[w]
                    if (index != null) {
                        Text(
                            "$w Wochen: Index %.2f".format(index),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                Text("Datenqualität", style = MaterialTheme.typography.titleSmall)
                Text(k.datenHinweis, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    "Alle Werte beschreiben Verteilung und Planbarkeit â€” keine Bewertung von Leistung oder Engagement.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 6.dp)
                )
            }
        }
    )
}

@Composable
fun BerichtZeile(titel: String, wert: String, erklaerung: String) {
    Column(Modifier.padding(vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(titel, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            Text(wert, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        }
        Text(erklaerung, style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun Kennzahl(label: String, wert: String) {
    Column {
        Text(wert, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ==============================================================================
// GRUPPEN-EDITOR: mehrere .saniteam-Gruppen verwalten (#29)
// ==============================================================================
@Composable
fun GruppenEditor(vm: PlanerViewModel) {
    var aktualisieren by remember { mutableStateOf(0) }
    var neueName by remember { mutableStateOf("") }
    var meldung by remember { mutableStateOf<String?>(null) }
    val gruppen = remember(aktualisieren) { vm.gruppen() }
    val aktiv = remember(aktualisieren) { vm.aktiveGruppe() }

    Text(
        "Falls die AG in mehrere unabhängige Gruppen zerfällt (z.B. nach Wochentag), kann jede Gruppe ihre eigene .saniteam-Datei haben.",
        style = MaterialTheme.typography.bodySmall
    )
    Spacer(Modifier.height(6.dp))
    gruppen.forEach { g ->
        Row(verticalAlignment = Alignment.CenterVertically) {
            RadioButton(selected = g == aktiv, onClick = { vm.gruppeWechseln(g); aktualisieren++ })
            Text(g, Modifier.weight(1f))
            if (g != "Standard") {
                TextButton(onClick = {
                    meldung = if (vm.loescheGruppe(g)) "Gruppe '$g' gelöscht." else "Löschen fehlgeschlagen."
                    aktualisieren++
                }) { Text("Ã—", color = MaterialTheme.colorScheme.error) }
            }
        }
    }
    Spacer(Modifier.height(4.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = neueName,
            onValueChange = { neueName = it },
            label = { Text("Neue Gruppe") },
            modifier = Modifier.weight(1f),
            singleLine = true
        )
        Button(onClick = {
            meldung = if (vm.neueGruppe(neueName)) "Gruppe '${neueName.trim()}' angelegt." else "Name ungültig oder bereits vorhanden."
            if (meldung!!.startsWith("Gruppe")) neueName = ""
            aktualisieren++
        }, enabled = neueName.isNotBlank()) { Text("Anlegen") }
    }
    meldung?.let {
        Text(it, style = MaterialTheme.typography.bodySmall,
            color = if (it.startsWith("Gruppe") && it.contains("angelegt")) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.error)
    }
}

// ==============================================================================
// BACKUP-EDITOR: taegliche automatische Backups anzeigen + wiederherstellen (#50)
// ==============================================================================
@Composable
fun BackupEditor(vm: PlanerViewModel) {
    var meldung by remember { mutableStateOf<String?>(null) }
    var aktualisieren by remember { mutableStateOf(0) }
    val backups = remember(aktualisieren) { vm.backupListe() }

    Text(
        "Es wird automatisch 1Ã— täglich ein Backup im App-Speicher angelegt (max. 10). " +
            "Falls die Daten mal beschädigt sind, kannst du hier wiederherstellen.",
        style = MaterialTheme.typography.bodySmall
    )
    if (backups.isEmpty()) {
        Text("Noch keine Backups vorhanden.", style = MaterialTheme.typography.bodySmall)
    } else {
        backups.take(5).forEach { name ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(name, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = {
                    meldung = if (vm.backupWiederherstellen(name))
                        "Backup '$name' wiederhergestellt."
                    else "Wiederherstellen fehlgeschlagen."
                    aktualisieren++
                }) { Text("Wiederherstellen") }
            }
        }
    }
    meldung?.let {
        Text(it, style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.primary)
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

// ==============================================================================
// KLASSENARBEIT AUS DER KARTEI (#52): Person / ganze Klasse / ganze Stufe
// ==============================================================================
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun SchulterminFuerPersonDialog(vm: PlanerViewModel, person: Person, onSchliessen: () -> Unit) {
    var datum by remember { mutableStateOf(LocalDate.now()) }
    var zeigeDatePicker by remember { mutableStateOf(false) }
    var geltung by remember { mutableStateOf("person") }   // person|klasse|stufe
    var titel by remember { mutableStateOf("Klassenarbeit") }

    val betroffene = when (geltung) {
        "klasse" -> vm.state.datei.personen.filter {
            it.aktiv && it.stufe == person.stufe && it.klasse == person.klasse
        }
        "stufe" -> vm.state.datei.personen.filter { it.aktiv && it.stufe == person.stufe }
        else -> listOf(person)
    }

    if (zeigeDatePicker) {
        val datePickerState = androidx.compose.material3.rememberDatePickerState(
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
        ) { DatePicker(state = datePickerState) }
    }

    AlertDialog(
        onDismissRequest = onSchliessen,
        title = { Text("Schultermin für ${person.vollerName()}") },
        text = {
            Column {
                OutlinedButton(onClick = { zeigeDatePicker = true }, modifier = Modifier.fillMaxWidth()) {
                    Text("Datum: ${datum.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"))}")
                }
                Spacer(Modifier.height(8.dp))
                Text("Gilt für:", style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    FilterChip(
                        selected = geltung == "person",
                        onClick = { geltung = "person" },
                        label = { Text("Nur ${person.vorname}") }
                    )
                    if (person.klasse.isNotBlank()) {
                        FilterChip(
                            selected = geltung == "klasse",
                            onClick = { geltung = "klasse" },
                            label = { Text("Klasse ${person.stufe}${person.klasse}") }
                        )
                    }
                    if (person.stufe.isNotBlank()) {
                        FilterChip(
                            selected = geltung == "stufe",
                            onClick = { geltung = "stufe" },
                            label = { Text("Stufe ${person.stufe}") }
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                // Betroffene-Anzahl vor dem Speichern (#52-Anforderung)
                Card(colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)
                )) {
                    Text(
                        "Betroffen: ${betroffene.size} Person(en)",
                        modifier = Modifier.padding(10.dp),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val termin = com.fabian.sanialarmplaner.data.Schultermin(
                    datum = datum.toString(),
                    titel = titel,
                    klassen = if (geltung == "klasse") listOf("${person.stufe}${person.klasse}") else emptyList(),
                    stufen = if (geltung == "stufe") listOf(person.stufe) else emptyList(),
                    personNamen = if (geltung == "person") listOf(person.vollerName()) else emptyList(),
                    typ = "Klassenarbeit",
                )
                vm.fuegeSchulterminHinzu(termin)
                onSchliessen()
            }) { Text("Speichern") }
        },
        dismissButton = { TextButton(onClick = onSchliessen) { Text("Abbrechen") } },
    )
}

