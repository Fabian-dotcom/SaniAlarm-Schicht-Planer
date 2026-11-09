package com.fabian.sanialarmplaner.ui

import android.content.Intent
import android.net.Uri
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
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
// HAUPT-SCREEN: Bottom-Navigation (5 Kernbereiche) + "Mehr"-Sheet
// ==============================================================================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanerScreen(vm: PlanerViewModel) {
    val state = vm.state
    var seite by remember { mutableStateOf("profil") }   // profil|plan|personen|kalender|mehr
    var mehrSheet by remember { mutableStateOf(false) }
    var unterseite by remember { mutableStateOf("ausfaelle") }   // innerhalb von "Mehr"
    val coroutineScope = rememberCoroutineScope()

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = seite == "profil", onClick = { seite = "profil" },
                    icon = { Text("Mein", style = MaterialTheme.typography.labelMedium) },
                    label = { Text("Profil") }
                )
                NavigationBarItem(
                    selected = seite == "plan", onClick = { seite = "plan" },
                    icon = { Text("Plan", style = MaterialTheme.typography.labelMedium) },
                    label = { Text("Plan") }
                )
                NavigationBarItem(
                    selected = seite == "personen", onClick = { seite = "personen" },
                    icon = { Text("Team", style = MaterialTheme.typography.labelMedium) },
                    label = { Text("Kartei") }
                )
                NavigationBarItem(
                    selected = seite == "kalender", onClick = { seite = "kalender" },
                    icon = { Text("Kal.", style = MaterialTheme.typography.labelMedium) },
                    label = { Text("Kalender") }
                )
                NavigationBarItem(
                    selected = seite == "mehr", onClick = { seite = "mehr" },
                    icon = { Text("â€¦", style = MaterialTheme.typography.labelMedium) },
                    label = { Text("Mehr") }
                )
            }
        }
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (seite) {
                "profil" -> ProfilTab(vm, goto = { ziel ->
                    when (ziel) {
                        "plan" -> seite = "plan"
                        "personen" -> seite = "personen"
                        "kalender" -> seite = "kalender"
                        "ausfaelle", "vorbelegung", "statistik", "einstellungen" -> {
                            unterseite = ziel; seite = "mehr"
                        }
                    }
                })
                "plan" -> PlanTab(vm, onWeiter = { unterseite = "ausfaelle"; seite = "mehr" }, onPersonen = { seite = "personen" })
                "personen" -> PersonenTab(vm)
                "kalender" -> KalenderTab(vm)
                "mehr" -> MehrTab(vm, unterseite, onUnterseite = { unterseite = it })
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
    var zeigeTausch by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(vertical = 8.dp, horizontal = 12.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onWeiter, modifier = Modifier.weight(1f)) {
                Text("AusfÃ¤lle")
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
                        "Lege zuerst Personen in der Kartei an (Tab \"Personen\") oder importiere eine .saniteam-Datei (Einstellungen). Die Teams werden dann automatisch aus den PartnerwÃ¼nschen gebildet.",
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

        // Monatsnavigation (#42)
        Row(
            Modifier.fillMaxWidth().padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            IconButton(onClick = { vm.wechselPlanMonat(-1) }, enabled = !state.laeuft) {
                Text("â€¹", style = MaterialTheme.typography.titleLarge)
            }
            val monatsName = state.planMonat.month
                .getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.GERMANY)
                .replaceFirstChar { it.uppercase() }
            Text(
                "$monatsName ${state.planMonat.year}",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
            IconButton(onClick = { vm.wechselPlanMonat(1) }, enabled = !state.laeuft) {
                Text("â€º", style = MaterialTheme.typography.titleLarge)
            }
        }

        if (state.plan.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            KalenderAnsicht(vm)
            // Erinnerungen (#25): Einmalig nach Generierung planen
            if (vm.erinnerungenInvalidiert) {
                val activity = context as? android.app.Activity
                OutlinedButton(
                    onClick = {
                        (context as? com.fabian.sanialarmplaner.MainActivity)?.planeErinnerungenFuerPlan()
                    },
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
                ) { Text("ðŸ”” Erinnerungen fÃ¼r diesen Plan aktivieren") }
            } else {
                Text(
                    "Erinnerungen sind fÃ¼r diesen Plan aktiv (24 h vorher).",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
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
        "Woche ${it.woche} Â· ${it.tag} â€” ${it.mitglieder.joinToString()}"
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
                Text("WÃ¤hle die beiden Dienste. Der Tausch wird nur Ã¼bernommen, wenn der gesamte Plan regelkonform bleibt.")
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
                        "Die Zustimmung wird lokal auf diesem GerÃ¤t bestÃ¤tigt.",
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
                    fehler = listOf("Bitte zwei Dienste auswÃ¤hlen.")
                } else {
                    val ergebnis = vm.tauscheDienste(
                        erste.woche to erste.tag,
                        zweite.woche to zweite.tag,
                    )
                    if (ergebnis.isEmpty()) onSchliessen() else fehler = ergebnis
                }
            }) { Text("PrÃ¼fen und tauschen") }
        },
        dismissButton = {
            TextButton(onClick = onSchliessen) { Text("Abbrechen") }
        },
    )
}

/** PDF-Erzeugung: PDF wird direkt in den Cache gerendert und im Share-Sheet angeboten (#35). */
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
            // WebView-Inhalt auf Bitmap rendern -> in PDF zeichnen -> Share-Sheet (#35)
            view.postDelayed({
                try {
                    val breite = 794   // A4 bei 96 dpi
                    val hoehe = view.contentHeight.toInt().coerceAtLeast(200) + 40
                    val bitmap = android.graphics.Bitmap.createBitmap(breite, hoehe, android.graphics.Bitmap.Config.ARGB_8888)
                    val canvas = android.graphics.Canvas(bitmap)
                    view.draw(canvas)

                    val pdf = android.graphics.pdf.PdfDocument()
                    val pageInfo = android.graphics.pdf.PdfDocument.PageInfo.Builder(breite, 1123, 1).create()  // A4
                    val page = pdf.startPage(pageInfo)
                    // Bitmap auf A4-Seite skalieren
                    val scale = 1123f / hoehe
                    page.canvas.save()
                    page.canvas.scale(scale.coerceAtMost(1f), scale.coerceAtMost(1f))
                    page.canvas.drawBitmap(bitmap, 0f, 0f, null)
                    page.canvas.restore()
                    pdf.finishPage(page)

                    val outDir = java.io.File(context.cacheDir, "shared").apply { mkdirs() }
                    val outFile = java.io.File(outDir, "dienstplan.pdf")
                    pdf.writeTo(outFile.outputStream())
                    pdf.close()
                    bitmap.recycle()

                    val uri = androidx.core.content.FileProvider.getUriForFile(
                        context, "${context.packageName}.fileprovider", outFile
                    )
                    val share = Intent(Intent.ACTION_SEND).apply {
                        type = "application/pdf"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    context.startActivity(Intent.createChooser(share, "Dienstplan-PDF teilen"))
                } catch (_: Exception) {
                    // Fallback: Print-Dialog
                    val adapter = view.createPrintDocumentAdapter("Dienstplan")
                    val pm = context.getSystemService(android.content.Context.PRINT_SERVICE) as PrintManager
                    pm.print("Dienstplan", adapter, PrintAttributes.Builder().build())
                }
            }, 400)
        }
    }
    webView.loadData(html, "text/html; charset=utf-8", "UTF-8")
}

/** Kalender-Grid: 4 Wochen untereinander, je 5 Tagesspalten mit Kopfzeile und echten Daten. */
@Composable
fun KalenderAnsicht(vm: PlanerViewModel) {
    val plan = vm.state.plan
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        for (w in Wochen.alle) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(8.dp)) {
                    val ersterTag = vm.datumFuer(w, "Montag")
                    Text(
                        if (ersterTag != null) {
                            "Woche $w (${ersterTag.dayOfMonth}.${ersterTag.monthValue}.)"
                        } else "Woche $w",
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
                Text("â€”", style = MaterialTheme.typography.bodySmall,
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
                    append("${e.mitglieder.size}er-Team Â· ${e.paar}")
                    e.springer?.let { append(" + Springer $it") }
                    if (e.vorbelegt) append(" Â· VORBELEGT")
                    e.vertretungHinweis?.let { append(" Â· Vertretung: $it") }
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
    val context = LocalContext.current
    val allePersonen = (state.config.teams.values.flatten() + state.config.springer).sorted()
    var dialogPerson by remember { mutableStateOf<String?>(null) }
    var vertretungPerson by remember { mutableStateOf<String?>(null) }
    var tauschPerson by remember { mutableStateOf<String?>(null) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp, horizontal = 12.dp)
    ) {
        Text("Wer fÃ¤llt aus?", style = MaterialTheme.typography.titleMedium)
        Text(
            "Person abhaken = krank/ganz weg. Ãœber das Calendar-Symbol kannst du pro Person einzelne Tage markieren (tagesgenau, z.B. Urlaub).",
            style = MaterialTheme.typography.bodySmall
        )
        Spacer(Modifier.height(8.dp))

        if (allePersonen.isEmpty()) {
            Text("Keine Personen vorhanden â€“ zuerst Kartei fÃ¼llen.", style = MaterialTheme.typography.bodySmall)
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
                        // Notfall-Kontakte (#41): Telefon/E-Mail direkt anrufen/mailen
                        val personObj = state.datei.personen.firstOrNull { it.vollerName() == person }
                        if (!personObj?.telefon.isNullOrBlank()) {
                            TextButton(onClick = {
                                context.startActivity(Intent(Intent.ACTION_DIAL,
                                    Uri.parse("tel:${personObj!!.telefon}")))
                            }) { Text("Anrufen") }
                        }
                        if (!personObj?.email.isNullOrBlank()) {
                            TextButton(onClick = {
                                context.startActivity(Intent(Intent.ACTION_SENDTO,
                                    Uri.parse("mailto:${personObj!!.email}")))
                            }) { Text("Mail") }
                        }
                        TextButton(onClick = { dialogPerson = person }) { Text("Tageâ€¦") }
                        TextButton(
                            enabled = state.plan.any { person in it.mitglieder },
                            onClick = { tauschPerson = person },
                        ) { Text("Tausch") }
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
            Text("Auswahl zurÃ¼cksetzen")
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

    tauschPerson?.let { person ->
        TauschDialog(vm, person) { tauschPerson = null }
    }
}

@Composable
private fun TauschDialog(vm: PlanerViewModel, person: String, onSchliessen: () -> Unit) {
    val dienste = vm.vertretungsDienste(person)
    var meinDienst by remember(person) {
        mutableStateOf(dienste.firstOrNull()?.let { it.woche to it.tag })
    }
    var partnerDienst by remember(person) { mutableStateOf<Pair<Int, String>?>(null) }
    var meldung by remember { mutableStateOf<String?>(null) }

    val dienstA = dienste.firstOrNull { (it.woche to it.tag) == meinDienst }
    val dienstB = partnerDienst?.let { (w, t) -> vm.state.plan.firstOrNull { it.woche == w && it.tag == t } }
    val partner = dienstB?.mitglieder?.firstOrNull { it != person }

    AlertDialog(
        onDismissRequest = onSchliessen,
        title = { Text("Schicht tauschen: $person") },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (dienste.isEmpty()) {
                    Text("Diese Person ist im aktuellen Plan nicht eingeteilt.")
                } else {
                    Text("1. Meine Schicht:", style = MaterialTheme.typography.bodySmall)
                    dienste.forEach { e ->
                        FilterChip(
                            selected = meinDienst == (e.woche to e.tag),
                            onClick = { meinDienst = e.woche to e.tag },
                            label = { Text("W${e.woche} Â· ${e.tag}") },
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Text("2. Schicht des Tauschpartners:", style = MaterialTheme.typography.bodySmall)
                    vm.state.plan.filter { it.hatDienst && person !in it.mitglieder }.forEach { e ->
                        FilterChip(
                            selected = partnerDienst == (e.woche to e.tag),
                            onClick = { partnerDienst = e.woche to e.tag },
                            label = { Text("W${e.woche} Â· ${e.tag} (${e.mitglieder.joinToString()})") },
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    if (partner != null && dienstA != null && dienstB != null) {
                        val probleme = vm.pruefeTausch(dienstA, dienstB, person, partner)
                        if (probleme.isEmpty()) {
                            Text("âœ“ Tausch mit $partner ist regelkonform.",
                                color = MaterialTheme.colorScheme.primary)
                        } else {
                            Text("Konflikte:", color = MaterialTheme.colorScheme.error)
                            probleme.forEach { Text("â€¢ $it", color = MaterialTheme.colorScheme.error) }
                        }
                    }
                    meldung?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                }
            }
        },
        confirmButton = {
            if (dienstA != null && dienstB != null && partner != null) {
                Button(onClick = {
                    meldung = if (vm.fuehreTauschAus(dienstA, dienstB, person, partner)) {
                        onSchliessen()
                        "Tausch durchgefÃ¼hrt."
                    } else "Tausch verletzt Regeln."
                }) { Text("Tauschen") }
            }
        },
        dismissButton = { TextButton(onClick = onSchliessen) { Text("Abbrechen") } },
    )
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
        title = { Text("Vertretung fÃ¼r $person") },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("WÃ¤hle den geplanten Dienst und eine verfÃ¼gbare Vertretung.")
                if (dienste.isEmpty()) {
                    Text("Diese Person ist im aktuellen Plan nicht eingeteilt.")
                } else {
                    dienste.forEach { eintrag ->
                        FilterChip(
                            selected = ausgewaehlterSchluessel == (eintrag.woche to eintrag.tag),
                            onClick = { ausgewaehlterSchluessel = eintrag.woche to eintrag.tag },
                            label = { Text("Woche ${eintrag.woche} Â· ${eintrag.tag}") },
                        )
                    }
                    Text("VorschlÃ¤ge (Springer und niedrigere Belastung zuerst):",
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
                                            if (vorschlag.ausSpringerReserve) append("Springer-Reserve Â· ")
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
                                        meldung = "Der Vorschlag ist nicht mehr verfÃ¼gbar. Bitte erneut prÃ¼fen."
                                    }
                                }) { Text("Einsetzen") }
                            }
                        }
                    }
                }
                Text(
                    "Die Ã„nderung gilt nur fÃ¼r den aktuell angezeigten Plan.",
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
            "WÃ¤hle feste Schichten aus (z.B. wenn Montag & Dienstag schon gesetzt sind).",
            style = MaterialTheme.typography.bodySmall
        )
        Spacer(Modifier.height(8.dp))

        if (state.config.teams.isEmpty()) {
            Text("Keine Teams â€“ zuerst Personen anlegen.", color = MaterialTheme.colorScheme.error)
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
        ) { Text("HinzufÃ¼gen") }

        Spacer(Modifier.height(16.dp))
        // ---------------- Wiederkehrende Muster (#36) -----------------------
        WiederkehrendEditor(vm)

        Spacer(Modifier.height(16.dp))
        // ---------------- Gesperrte Tage (kein Dienst, z.B. schulfrei) ------
        Text("Kein Dienst (z.B. schulfrei)", style = MaterialTheme.typography.titleMedium)
        Text(
            "Markiere Tage, an denen GAR KEIN Dienst stattfindet. Der Plan lÃ¤sst diese Tage leer.",
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
                        TextButton(onClick = { vm.loescheVorbelegung(key) }) { Text("LÃ¶schen") }
                    }
                }
            }
        }
        Spacer(Modifier.height(80.dp))
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun WiederkehrendEditor(vm: PlanerViewModel) {
    val state = vm.state
    var tag by remember { mutableStateOf(Wochentage.dienst.first()) }
    var paar by remember { mutableStateOf(state.config.teams.keys.firstOrNull() ?: "") }
    var rhythmus by remember { mutableStateOf(1) }
    var startWoche by remember { mutableStateOf(1) }

    Text("Wiederkehrende Muster", style = MaterialTheme.typography.titleMedium)
    Text(
        "z.B. 'Jede 2. Woche Freitag Team X' â€” wird bei jeder Planung automatisch als Vorbelegung gesetzt.",
        style = MaterialTheme.typography.bodySmall
    )
    Spacer(Modifier.height(6.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        LabeledDropdown("Tag", Wochentage.dienst, tag, Modifier.weight(1f)) { tag = it }
        LabeledDropdown("Rhythmus", listOf("jede Woche", "jede 2. Woche"),
            if (rhythmus == 1) "jede Woche" else "jede 2. Woche", Modifier.weight(1f)) {
            rhythmus = if (it == "jede Woche") 1 else 2
        }
    }
    Spacer(Modifier.height(6.dp))
    LabeledDropdown("Team", state.config.teams.keys.toList(), paar, Modifier.fillMaxWidth()) { paar = it }
    if (rhythmus == 2) {
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Startet in Woche:", style = MaterialTheme.typography.bodySmall)
            FilterChip(selected = startWoche == 1, onClick = { startWoche = 1 }, label = { Text("1") })
            FilterChip(selected = startWoche == 2, onClick = { startWoche = 2 }, label = { Text("2") })
        }
    }
    Spacer(Modifier.height(6.dp))
    Button(
        onClick = {
            vm.fuegeWiederkehrendesMusterHinzu(
                com.fabian.sanialarmplaner.data.WiederkehrendeVorbelegung(
                    tag, paar, null, rhythmus, startWoche
                )
            )
        },
        enabled = paar.isNotEmpty(), modifier = Modifier.fillMaxWidth()
    ) { Text("Muster hinzufÃ¼gen") }

    if (state.datei.wiederkehrend.isNotEmpty()) {
        Spacer(Modifier.height(6.dp))
        state.datei.wiederkehrend.forEach { m ->
            Card(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "${if (m.alleXWochen == 1) "Jede Woche" else "Jede 2. Woche (ab W${m.startWoche})"}, ${m.tag}: ${m.paar}",
                        Modifier.weight(1f)
                    )
                    TextButton(onClick = { vm.loescheWiederkehrendesMuster(m) }) { Text("Ã—") }
                }
            }
        }
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
