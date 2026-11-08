package com.fabian.sanialarmplaner.ui

import android.content.Intent
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fabian.sanialarmplaner.data.Person
import com.fabian.sanialarmplaner.data.RegelKonfig
import com.fabian.sanialarmplaner.data.vollerName
import com.fabian.sanialarmplaner.logic.Schluessel
import com.fabian.sanialarmplaner.logic.Wochen
import com.fabian.sanialarmplaner.logic.Wochentage
import com.fabian.sanialarmplaner.logic.tagIndex
import com.fabian.sanialarmplaner.viewmodel.PlanEintrag
import com.fabian.sanialarmplaner.viewmodel.PlanerViewModel
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

// ==============================================================================
// HAUPT-SCREEN MIT SCROLLBARER TAB-LEISTE (Fix fuer abgeschnittene Woerter)
// ==============================================================================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanerScreen(vm: PlanerViewModel) {
    val state = vm.state
    var tab by remember { mutableStateOf(0) }
    val tabs = listOf("Plan", "Ausfälle", "Vorbelegung", "Personen", "Statistik", "Einstellungen")
    val coroutineScope = rememberCoroutineScope()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Sani Alarm Planer") }) }
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // ScrollableTabRow: lange Tab-Namen werden nicht mehr abgeschnitten
            ScrollableTabRow(selectedTabIndex = tab, edgePadding = 8.dp) {
                tabs.forEachIndexed { i, t ->
                    Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t) })
                }
            }
            Box(Modifier.weight(1f)) {
                when (tab) {
                    0 -> PlanTab(vm, onWeiter = { tab = 1 }, onPersonen = { tab = 3 })
                    1 -> AusfaelleTab(vm)
                    2 -> VorbelegungTab(vm)
                    3 -> PersonenTab(vm)
                    4 -> StatistikTab(vm)
                    5 -> EinstellungenTab(vm)
                }
            }
            // Generieren-Button immer unten sichtbar
            if (tab == 0 || tab == 1 || tab == 2) {
                Button(
                    onClick = { coroutineScope.launch { vm.generiere() } },
                    enabled = !state.laeuft,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp)
                ) { Text(if (state.laeuft) "Rechnet…" else "Plan generieren") }
            }
        }
    }
}

// ==============================================================================
// TAB 1: PLAN
// ==============================================================================
@Composable
fun PlanTab(vm: PlanerViewModel, onWeiter: () -> Unit, onPersonen: () -> Unit) {
    val state = vm.state
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(vertical = 8.dp, horizontal = 12.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onWeiter, modifier = Modifier.weight(1f)) {
                Text("Ausfälle")
            }
            OutlinedButton(onClick = onPersonen, modifier = Modifier.weight(1f)) {
                Text("Kartei")
            }
        }

        if (state.config.teams.isEmpty()) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text("Noch keine Daten", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "Lege zuerst Personen in der Kartei an (Tab \"Personen\") oder importiere eine .saniteam-Datei (Einstellungen). Die Teams werden dann automatisch aus den Partnerwünschen gebildet.",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }

        state.fehler?.let {
            Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
        }
        state.hinweise.forEach {
            AssistChip(onClick = {}, label = { Text(it) }, modifier = Modifier.padding(top = 4.dp))
        }

        if (state.plan.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            for (w in Wochen.alle) {
                Text("Woche $w", style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 8.dp))
                Wochentage.dienst.forEach { tag ->
                    PlanZeile(state.plan.first { it.woche == w && it.tag == tag })
                }
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = {
                    clipboard.setText(AnnotatedString(vm.planAlsText()))
                }, modifier = Modifier.weight(1f)) { Text("Text kopieren") }
                OutlinedButton(onClick = {
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, vm.planAlsText())
                    }
                    context.startActivity(Intent.createChooser(intent, "Plan teilen"))
                }, modifier = Modifier.weight(1f)) { Text("Text teilen") }
            }
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = { teileAlsPdf(context, vm.planAlsText()) },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Als PDF teilen") }
        }
        Spacer(Modifier.height(24.dp))
    }
}

/** PDF-Erzeugung ueber Android-Print-Framework (WebView -> "Als PDF speichern"). */
fun teileAlsPdf(context: android.content.Context, planText: String) {
    val rows = planText.lines().filter { it.contains(":") }.joinToString("") { line ->
        val parts = line.split(":", limit = 2)
        "<tr><td>${parts[0].trim()}</td><td>${parts.getOrNull(1)?.trim() ?: ""}</td></tr>"
    }
    val html = """
        <html><head><meta charset='utf-8'><style>
        body{font-family:sans-serif;} h1{font-size:18px;}
        table{border-collapse:collapse;width:100%;} td{border:1px solid #999;padding:6px;}
        </style></head><body>
        <h1>Monatsdienstplan Sani-AG</h1>
        <table>${'$'}rows</table>
        </body></html>
    """.trimIndent()

    val webView = WebView(context)
    webView.webViewClient = object : android.webkit.WebViewClient() {
        override fun onPageFinished(view: WebView, url: String?) {
            val printAdapter = view.createPrintDocumentAdapter("Dienstplan")
            val printManager = context.getSystemService(android.content.Context.PRINT_SERVICE) as PrintManager
            printManager.print("Dienstplan", printAdapter, PrintAttributes.Builder().build())
            // Nutzer waehlt im Dialog "Als PDF speichern" und kann die Datei dann teilen
        }
    }
    webView.loadData(html, "text/html; charset=utf-8", "UTF-8")
}

@Composable
fun PlanZeile(e: PlanEintrag) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
        colors = if (e.vorbelegt)
            CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)
        else CardDefaults.cardColors()
    ) {
        Column(Modifier.padding(10.dp)) {
            Text("${e.tag}: ${e.mitglieder.joinToString()}", style = MaterialTheme.typography.bodyLarge)
            Text(
                buildString {
                    append("${e.mitglieder.size}er-Team · ${e.paar}")
                    e.springer?.let { append(" + Springer $it") }
                    if (e.vorbelegt) append(" · VORBELEGT")
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

// ==============================================================================
// TAB 2: AUSFAELLE (krank + optional tagesgenau via Dialog, NICHT Riesen-Grid)
// ==============================================================================
@Composable
fun AusfaelleTab(vm: PlanerViewModel) {
    val state = vm.state
    val allePersonen = (state.config.teams.values.flatten() + state.config.springer).sorted()
    var dialogPerson by remember { mutableStateOf<String?>(null) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp, horizontal = 12.dp)
    ) {
        Text("Wer fällt aus?", style = MaterialTheme.typography.titleMedium)
        Text(
            "Person abhaken = krank/ganz weg. Über das Calendar-Symbol kannst du pro Person einzelne Tage markieren (tagesgenau, z.B. Urlaub).",
            style = MaterialTheme.typography.bodySmall
        )
        Spacer(Modifier.height(8.dp))

        if (allePersonen.isEmpty()) {
            Text("Keine Personen vorhanden – zuerst Kartei füllen.", style = MaterialTheme.typography.bodySmall)
        }

        allePersonen.forEach { person ->
            val krank = person in state.kranke
            val abwesendTage = state.abwesenheiten[person]?.size ?: 0
            Card(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                Row(Modifier.padding(horizontal = 10.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = krank, onCheckedChange = { vm.toggleKrank(person) })
                    Column(Modifier.weight(1f)) {
                        Text(person)
                        if (abwesendTage > 0) {
                            Text("$abwesendTage Tag(e) tagesgenau abwesend",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary)
                        }
                    }
                    TextButton(onClick = { dialogPerson = person }) { Text("Tage…") }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        OutlinedButton(onClick = { vm.allesZuruecksetzen() }, modifier = Modifier.fillMaxWidth()) {
            Text("Auswahl zurücksetzen")
        }
        Spacer(Modifier.height(80.dp))
    }

    // Tagesgenau-Dialog: nur fuer DIESE Person, 4 Wochen kompakt
    dialogPerson?.let { person ->
        AlertDialog(
            onDismissRequest = { dialogPerson = null },
            confirmButton = {
                TextButton(onClick = { dialogPerson = null }) { Text("Fertig") }
            },
            title = { Text("Abwesend: $person") },
            text = {
                Column {
                    Text("Tippe auf die Tage, an denen die Person nicht kann:", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    Wochen.alle.forEach { w ->
                        Row(Modifier.padding(vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("W$w", style = MaterialTheme.typography.labelSmall, modifier = Modifier.width(28.dp))
                            Wochentage.dienst.forEach { tag ->
                                val idx = tagIndex(w, tag)
                                val abwesend = idx in state.abwesenheiten[person].orEmpty()
                                FilterChip(
                                    selected = abwesend,
                                    onClick = { vm.toggleAbwesenheit(person, idx) },
                                    label = { Text(tag.take(2), fontSize = 11.sp) },
                                    modifier = Modifier.heightIn(min = 32.dp)
                                )
                            }
                        }
                    }
                }
            }
        )
    }
}

// ==============================================================================
// TAB 3: VORBELEGUNG
// ==============================================================================
@Composable
fun VorbelegungTab(vm: PlanerViewModel) {
    val state = vm.state
    var woche by remember { mutableStateOf(1) }
    var tag by remember { mutableStateOf(Wochentage.dienst.first()) }
    var paar by remember { mutableStateOf(state.config.teams.keys.firstOrNull() ?: "") }
    var springer by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp, horizontal = 12.dp)) {
        Text("Bereits besetzte Schichten", style = MaterialTheme.typography.titleMedium)
        Text(
            "Wähle feste Schichten aus (z.B. wenn Montag & Dienstag schon gesetzt sind).",
            style = MaterialTheme.typography.bodySmall
        )
        Spacer(Modifier.height(8.dp))

        if (state.config.teams.isEmpty()) {
            Text("Keine Teams – zuerst Personen anlegen.", color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(80.dp))
            return
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            LabeledDropdown("Woche", Wochen.alle.map { it.toString() }, woche.toString(), Modifier.weight(1f)) { woche = it.toInt() }
            LabeledDropdown("Tag", Wochentage.dienst, tag, Modifier.weight(1f)) { tag = it }
        }
        Spacer(Modifier.height(8.dp))
        LabeledDropdown("Team", state.config.teams.keys.toList(), paar, Modifier.fillMaxWidth()) { paar = it }

        Spacer(Modifier.height(8.dp))
        Text("Springer (optional):", style = MaterialTheme.typography.bodySmall)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = springer == null, onClick = { springer = null }, label = { Text("Kein") })
            state.config.springer.forEach { s ->
                FilterChip(selected = springer == s, onClick = { springer = s }, label = { Text(s) })
            }
        }
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = { vm.fuegeVorbelegungHinzu(woche, tag, paar, springer) },
            enabled = paar.isNotEmpty(), modifier = Modifier.fillMaxWidth()
        ) { Text("Hinzufügen") }

        Spacer(Modifier.height(12.dp))
        if (state.vorbelegungen.isEmpty()) {
            Text("Noch keine Vorbelegungen.", style = MaterialTheme.typography.bodySmall)
        } else {
            state.vorbelegungen.entries.sortedWith(
                compareBy({ it.key.first }, { Wochentage.dienst.indexOf(it.key.second) })
            ).forEach { (key: Schluessel, d) ->
                Card(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "W${key.first}, ${key.second}: ${d.paar}" + (d.springer?.let { " + $it" } ?: ""),
                            Modifier.weight(1f)
                        )
                        TextButton(onClick = { vm.loescheVorbelegung(key) }) { Text("Löschen") }
                    }
                }
            }
        }
        Spacer(Modifier.height(80.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LabeledDropdown(label: String, options: List<String>, selected: String, modifier: Modifier = Modifier, onSelected: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }, modifier = modifier) {
        OutlinedTextField(
            value = selected, onValueChange = {}, readOnly = true,
            label = { Text(label) },
            modifier = Modifier.menuAnchor()
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { opt ->
                DropdownMenuItem(text = { Text(opt) }, onClick = { onSelected(opt); expanded = false })
            }
        }
    }
}
