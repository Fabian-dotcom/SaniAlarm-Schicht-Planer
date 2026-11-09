package com.fabian.sanialarmplaner.ui

import android.content.Intent
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
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
    val tabs = listOf("Start", "Plan", "Ausfälle", "Vorbelegung", "Personen", "Statistik", "Einstellungen")
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
                    0 -> HomeTab(vm, gotoTab = { tab = it })
                    1 -> PlanTab(vm, onWeiter = { tab = 2 }, onPersonen = { tab = 4 })
                    2 -> AusfaelleTab(vm)
                    3 -> VorbelegungTab(vm)
                    4 -> PersonenTab(vm)
                    5 -> StatistikTab(vm)
                    6 -> EinstellungenTab(vm)
                }
            }
            // Generieren-Button immer unten sichtbar
            if (tab in listOf(1, 2, 3)) {
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
// TAB 0: HOME (iOS-inspiriert: grosser Titel, inset-grouped Listen, Icon-Badges)
// ==============================================================================
@Composable
fun HomeTab(vm: PlanerViewModel, gotoTab: (Int) -> Unit) {
    val state = vm.state
    val anzahlPersonen = state.datei.personen.count { it.aktiv }
    val anzahlTeams = state.config.teams.size
    val anzahlKrank = state.kranke.size
    val hatPlan = state.plan.isNotEmpty()

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(vertical = 8.dp, horizontal = 16.dp)
    ) {
        // Grosser iOS-artiger Titel
        Text(
            "Sani Alarm",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
            modifier = Modifier.padding(top = 8.dp)
        )
        Text(
            "Dienstplan · Statistik · Ausfälle",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(Modifier.height(20.dp))

        // iOS-Statstrip: drei Werte in einer grouped Card
        IosSection("Übersicht") {
            Row(Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
                HomeStat("Personen", "$anzahlPersonen", Modifier.weight(1f))
                HomeDivider()
                HomeStat("Teams", "$anzahlTeams", Modifier.weight(1f))
                HomeDivider()
                HomeStat("Krank", "$anzahlKrank", Modifier.weight(1f))
            }
        }

        Spacer(Modifier.height(20.dp))

        // Naechster Dienst prominent
        if (hatPlan) {
            IosSection("Nächster Dienst") {
                val naechster = state.plan.first()
                Column(Modifier.padding(14.dp)) {
                    Text(
                        "Woche ${naechster.woche} · ${naechster.tag}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold
                    )
                    Text(
                        naechster.mitglieder.joinToString() +
                            (naechster.springer?.let { "  +  $it" } ?: ""),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Spacer(Modifier.height(20.dp))
        }

        // Schnellstart als inset-grouped Liste mit runden Icon-Badges
        IosSection("Schnellstart") {
            IosRow(icon = "👤", bg = iosBlue, titel = "Personen",
                text = if (anzahlPersonen == 0) "Noch keine — hier starten" else "$anzahlPersonen aktiv",
                badge = if (anzahlPersonen > 0) "✓" else "", onClick = { gotoTab(4) })
            IosSeparator()
            IosRow(icon = "🤒", bg = iosOrange, titel = "Ausfälle",
                text = if (anzahlKrank == 0) "Niemand krank" else "$anzahlKrank krank gemeldet",
                badge = if (anzahlKrank > 0) "✓" else "", onClick = { gotoTab(2) })
            IosSeparator()
            IosRow(icon = "🗓️", bg = iosGreen, titel = "Plan",
                text = if (hatPlan) "Bereit — ansehen" else "Noch kein Plan diesen Monat",
                badge = if (hatPlan) "✓" else "", onClick = { gotoTab(1) })
        }

        Spacer(Modifier.height(20.dp))

        IosSection("Weitere Bereiche") {
            IosRow(icon = "📊", bg = iosPurple, titel = "Statistik",
                text = "Belastungsindex & Historie", onClick = { gotoTab(5) })
            IosSeparator()
            IosRow(icon = "⚙️", bg = iosGray, titel = "Einstellungen",
                text = "Regeln, Sperrtage, Daten", onClick = { gotoTab(6) })
        }

        Spacer(Modifier.height(40.dp))
    }
}

private val iosBlue = Color(0xFF007AFF)
private val iosGreen = Color(0xFF34C759)
private val iosOrange = Color(0xFFFF9500)
private val iosPurple = Color(0xFFAF52DE)
private val iosGray = Color(0xFF8E8E93)

@Composable
fun IosSection(titel: String, content: @Composable ColumnScope.() -> Unit) {
    Column {
        Text(
            titel.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(start = 16.dp, bottom = 6.dp)
        )
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.large,
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
        ) {
            Column(content = content)
        }
    }
}

@Composable
fun IosRow(icon: String, bg: Color, titel: String, text: String, onClick: () -> Unit, badge: String = "") {
    Row(
        Modifier.fillMaxWidth()
            .clickableNoRipple(onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Runder Icon-Badge (iOS-Stil)
        Box(
            Modifier.size(34.dp).background(bg, androidx.compose.foundation.shape.CircleShape),
            contentAlignment = Alignment.Center
        ) { Text(icon, fontSize = 16.sp) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(titel, style = MaterialTheme.typography.bodyLarge)
            Text(text, style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (badge.isNotEmpty()) {
            Text(badge, color = iosGreen, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
            Spacer(Modifier.width(8.dp))
        }
        Text("›", style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun IosSeparator() {
    HorizontalDivider(
        modifier = Modifier.padding(start = 60.dp),
        thickness = 0.5.dp,
        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
    )
}

@Composable
private fun HomeDivider() {
    Box(Modifier.width(0.5.dp).height(40.dp).background(MaterialTheme.colorScheme.outlineVariant))
}

private fun Modifier.clickableNoRipple(onClick: () -> Unit): Modifier =
    this.composed { clickable(onClick = onClick) }

@Composable
fun HomeStat(label: String, wert: String, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(wert, style = MaterialTheme.typography.headlineSmall,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun HomeSchritt(nummer: Int, titel: String, beschreibung: String, erledigt: Boolean, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (erledigt) "✓" else "$nummer",
                style = MaterialTheme.typography.titleMedium,
                color = if (erledigt) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.width(28.dp)
            )
            Column(Modifier.weight(1f)) {
                Text(titel, style = MaterialTheme.typography.bodyLarge)
                Text(beschreibung, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text("›", style = MaterialTheme.typography.titleLarge)
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
    var zeigeTausch by remember { mutableStateOf(false) }

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
            KalenderAnsicht(state.plan)
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = { zeigeTausch = true },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Schichten tauschen") }
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

    if (zeigeTausch) {
        DiensteTauschenDialog(vm) { zeigeTausch = false }
    }
}

@Composable
private fun DiensteTauschenDialog(vm: PlanerViewModel, onSchliessen: () -> Unit) {
    val plan = vm.state.plan.sortedWith(compareBy({ it.woche }, { Wochentage.dienst.indexOf(it.tag) }))
    val optionen = plan.associateBy {
        "Woche ${it.woche} · ${it.tag} — ${it.mitglieder.joinToString()}"
    }
    var ersterName by remember(plan) { mutableStateOf(optionen.keys.firstOrNull().orEmpty()) }
    var zweiterName by remember(plan) {
        mutableStateOf(optionen.keys.drop(1).firstOrNull().orEmpty())
    }
    var fehler by remember { mutableStateOf<List<String>>(emptyList()) }
    var ersterStimmtZu by remember { mutableStateOf(false) }
    var zweiterStimmtZu by remember { mutableStateOf(false) }
    val ersterDienst = optionen[ersterName]
    val zweiterDienst = optionen[zweiterName]
    val zweiVerschiedeneDienste = ersterDienst != null && zweiterDienst != null &&
        (ersterDienst.woche to ersterDienst.tag) != (zweiterDienst.woche to zweiterDienst.tag)

    AlertDialog(
        onDismissRequest = onSchliessen,
        title = { Text("Schichten tauschen") },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("Wähle die beiden Dienste. Der Tausch wird nur übernommen, wenn der gesamte Plan regelkonform bleibt.")
                LabeledDropdown(
                    "Erster Dienst", optionen.keys.toList(), ersterName, Modifier.fillMaxWidth()
                ) {
                    ersterName = it
                    ersterStimmtZu = false
                    zweiterStimmtZu = false
                }
                LabeledDropdown(
                    "Zweiter Dienst", optionen.keys.toList(), zweiterName, Modifier.fillMaxWidth()
                ) {
                    zweiterName = it
                    ersterStimmtZu = false
                    zweiterStimmtZu = false
                }
                if (ersterDienst?.vorbelegt == true || zweiterDienst?.vorbelegt == true) {
                    Text("Vorbelegte Dienste sind gesperrt.", color = MaterialTheme.colorScheme.error)
                }
                if (zweiVerschiedeneDienste) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = ersterStimmtZu, onCheckedChange = { ersterStimmtZu = it })
                        Text("${ersterDienst!!.mitglieder.joinToString()} stimmen dem Tausch zu.")
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = zweiterStimmtZu, onCheckedChange = { zweiterStimmtZu = it })
                        Text("${zweiterDienst!!.mitglieder.joinToString()} stimmen dem Tausch zu.")
                    }
                    Text(
                        "Die Zustimmung wird lokal auf diesem Gerät bestätigt.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                fehler.forEach { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = zweiVerschiedeneDienste && ersterStimmtZu && zweiterStimmtZu,
                onClick = {
                val erste = optionen[ersterName]
                val zweite = optionen[zweiterName]
                if (erste == null || zweite == null) {
                    fehler = listOf("Bitte zwei Dienste auswählen.")
                } else {
                    val ergebnis = vm.tauscheDienste(
                        erste.woche to erste.tag,
                        zweite.woche to zweite.tag,
                    )
                    if (ergebnis.isEmpty()) onSchliessen() else fehler = ergebnis
                }
            }) { Text("Prüfen und tauschen") }
        },
        dismissButton = {
            TextButton(onClick = onSchliessen) { Text("Abbrechen") }
        },
    )
}

/** PDF-Erzeugung ueber Android-Print-Framework (WebView -> "Als PDF speichern"). */
fun teileAlsPdf(context: android.content.Context, planText: String) {
    val rows = planText.lines().filter { it.contains(":") }.joinToString("") { line ->
        val parts = line.split(":", limit = 2)
        "<tr><td>${android.text.Html.escapeHtml(parts[0].trim())}</td>" +
            "<td>${android.text.Html.escapeHtml(parts.getOrNull(1)?.trim().orEmpty())}</td></tr>"
    }
    val html = """
        <html><head><meta charset='utf-8'><style>
        body{font-family:sans-serif;} h1{font-size:18px;}
        table{border-collapse:collapse;width:100%;} td{border:1px solid #999;padding:6px;}
        </style></head><body>
        <h1>Monatsdienstplan Sani-AG</h1>
        <table>$rows</table>
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

/** Kalender-Grid: 4 Wochen untereinander, je 5 Tagesspalten mit Kopfzeile. */
@Composable
fun KalenderAnsicht(plan: List<PlanEintrag>) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        for (w in Wochen.alle) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(8.dp)) {
                    Text(
                        "Woche $w",
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier.padding(bottom = 6.dp)
                    )
                    // Kopfzeile: Wochentage
                    Row {
                        Wochentage.dienst.forEach { tag ->
                            Text(
                                tag.take(2),
                                style = MaterialTheme.typography.labelSmall,
                                modifier = Modifier.weight(1f),
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                    // Dienst-Zellen
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Wochentage.dienst.forEach { tag ->
                            val e = plan.first { it.woche == w && it.tag == tag }
                            KalenderZelle(e, Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun KalenderZelle(e: PlanEintrag, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = when {
            e.gesperrt -> MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.4f)
            e.vorbelegt -> MaterialTheme.colorScheme.tertiaryContainer
            else -> MaterialTheme.colorScheme.surfaceVariant
        },
        tonalElevation = 1.dp
    ) {
        Column(Modifier.padding(6.dp)) {
            if (e.gesperrt) {
                Text("—", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                return@Column
            }
            // Namen (nur Vornamen, damit es in die schmale Zelle passt)
            e.mitglieder.forEach { name ->
                Text(
                    name.split(" ").first(),
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1
                )
            }
            e.springer?.let {
                Text(
                    "+ ${it.split(" ").first()}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
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
                    e.vertretungHinweis?.let { append(" · Vertretung: $it") }
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
    var vertretungPerson by remember { mutableStateOf<String?>(null) }

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
                Column(Modifier.padding(horizontal = 10.dp, vertical = 4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = krank, onCheckedChange = { vm.toggleKrank(person) })
                        Column(Modifier.weight(1f)) {
                            Text(person)
                            if (abwesendTage > 0) {
                                Text("$abwesendTage Tag(e) tagesgenau abwesend",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = { dialogPerson = person }) { Text("Tage…") }
                        TextButton(
                            enabled = state.plan.any { person in it.mitglieder },
                            onClick = { vertretungPerson = person },
                        ) { Text("Vertretung") }
                    }
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

    vertretungPerson?.let { person ->
        VertretungDialog(vm, person) { vertretungPerson = null }
    }
}

@Composable
private fun VertretungDialog(vm: PlanerViewModel, person: String, onSchliessen: () -> Unit) {
    val dienste = vm.vertretungsDienste(person)
    var ausgewaehlterSchluessel by remember(person) {
        mutableStateOf(dienste.firstOrNull()?.let { it.woche to it.tag })
    }
    var meldung by remember { mutableStateOf<String?>(null) }
    val dienst = dienste.firstOrNull {
        (it.woche to it.tag) == ausgewaehlterSchluessel
    }
    val vorschlaege = dienst?.let { vm.vertretungsVorschlaege(it, person) }.orEmpty()

    AlertDialog(
        onDismissRequest = onSchliessen,
        title = { Text("Vertretung für $person") },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("Wähle den geplanten Dienst und eine verfügbare Vertretung.")
                if (dienste.isEmpty()) {
                    Text("Diese Person ist im aktuellen Plan nicht eingeteilt.")
                } else {
                    dienste.forEach { eintrag ->
                        FilterChip(
                            selected = ausgewaehlterSchluessel == (eintrag.woche to eintrag.tag),
                            onClick = { ausgewaehlterSchluessel = eintrag.woche to eintrag.tag },
                            label = { Text("Woche ${eintrag.woche} · ${eintrag.tag}") },
                        )
                    }
                    Text("Vorschläge (Springer und niedrigere Belastung zuerst):",
                        style = MaterialTheme.typography.titleSmall)
                    if (vorschlaege.isEmpty()) {
                        Text("Keine regelkonforme Vertretung gefunden.")
                    }
                    vorschlaege.forEach { vorschlag ->
                        Card(Modifier.fillMaxWidth()) {
                            Row(
                                Modifier.padding(start = 10.dp, end = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(vorschlag.name, style = MaterialTheme.typography.bodyMedium)
                                    Text(
                                        buildString {
                                            if (vorschlag.ausSpringerReserve) append("Springer-Reserve · ")
                                            append("Index %.2f".format(vorschlag.belastungsIndex))
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                                TextButton(onClick = {
                                    val aktuell = dienst
                                    if (aktuell != null &&
                                        vm.ersetzePersonImPlan(aktuell, person, vorschlag.name)
                                    ) {
                                        onSchliessen()
                                    } else {
                                        meldung = "Der Vorschlag ist nicht mehr verfügbar. Bitte erneut prüfen."
                                    }
                                }) { Text("Einsetzen") }
                            }
                        }
                    }
                }
                Text(
                    "Die Änderung gilt nur für den aktuell angezeigten Plan.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                meldung?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = onSchliessen) { Text("Fertig") }
        },
    )
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

        Spacer(Modifier.height(16.dp))
        // ---------------- Gesperrte Tage (kein Dienst, z.B. schulfrei) ------
        Text("Kein Dienst (z.B. schulfrei)", style = MaterialTheme.typography.titleMedium)
        Text(
            "Markiere Tage, an denen GAR KEIN Dienst stattfindet. Der Plan lässt diese Tage leer.",
            style = MaterialTheme.typography.bodySmall
        )
        Spacer(Modifier.height(6.dp))
        Wochen.alle.forEach { w ->
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("W$w", style = MaterialTheme.typography.labelSmall, modifier = Modifier.width(30.dp))
                Wochentage.dienst.forEach { t ->
                    val gesperrt = tagIndex(w, t) in state.gesperrteTage
                    FilterChip(
                        selected = gesperrt,
                        onClick = { vm.toggleGesperrterTag(w, t) },
                        label = { Text(t.take(2), fontSize = 11.sp) },
                        modifier = Modifier.heightIn(min = 32.dp)
                    )
                }
            }
        }

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
