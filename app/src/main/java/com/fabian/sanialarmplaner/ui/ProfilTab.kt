package com.fabian.sanialarmplaner.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.draw.clip
import kotlinx.coroutines.launch
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.fabian.sanialarmplaner.data.vollerName
import com.fabian.sanialarmplaner.logic.Wochen
import com.fabian.sanialarmplaner.logic.Wochentage
import com.fabian.sanialarmplaner.viewmodel.PlanerViewModel
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

/**
 * Dashboard nach index-v2-Prototyp: dunkle Stat-Karten, dunkle „Nächster
 * Dienst"-Karte mit Eyebrow/Pill/Avatar-Stack, heller Kalender mit Legende,
 * Tages-Detail-Karte, floating CTA unten.
 */
@Composable
fun ProfilTab(vm: PlanerViewModel, goto: (String) -> Unit) {
    val state = vm.state
    val scope = rememberCoroutineScope()
    var profilAuswahl by remember { mutableStateOf(false) }
    var angezeigterMonat by remember { mutableStateOf(YearMonth.now()) }
    var gewaehlterTag by remember { mutableStateOf<LocalDate?>(null) }
    val ich = state.ich
    val heute = LocalDate.now()
    val formatter = DateTimeFormatter.ofPattern("EEEE, dd.MM.", Locale.GERMANY)

    val aktiveSanis = state.datei.personen.count { it.aktiv }
    val diensteImPlan = state.plan.count { it.hatDienst }
    val ausfaelle = (state.kranke + state.abwesenheiten.filter { it.value.isNotEmpty() }.keys).size

    val naechster = if (ich.isBlank()) null else state.plan
        .filter { it.hatDienst && ich in it.mitglieder }
        .mapNotNull { e -> vm.datumFuer(e.woche, e.tag)?.let { it to e } }
        .filter { !it.first.isBefore(heute) }
        .minByOrNull { it.first }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
    ) {
        // ---- Header: "Hallo, Fabian" + Einstellungen + Avatar ----
        Row(
            Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                if (ich.isBlank()) "Hallo!" else "Hallo, ${ich.split(" ").first()}",
                style = MaterialTheme.typography.displayLarge,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = { goto("einstellungen") }) {
                Icon(Icons.Default.Settings, contentDescription = "Einstellungen")
            }
            Box(
                Modifier.size(42.dp).clickable { profilAuswahl = true },
                contentAlignment = Alignment.Center,
            ) {
                V2Avatar(if (ich.isBlank()) "?" else ich, 42.dp)
            }
        }

        // ---- 3 dunkle Stat-Karten (`.stats` / `.stat`) ----
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            V2DunkelKarte(Modifier.weight(1f), radius = 16.dp) {
                V2Eyebrow("Aktive Sanis")
                Text("$aktiveSanis", style = MaterialTheme.typography.headlineMedium,
                    color = Color.White)
            }
            V2DunkelKarte(Modifier.weight(1f), radius = 16.dp) {
                V2Eyebrow("Dienste")
                Text("$diensteImPlan", style = MaterialTheme.typography.headlineMedium,
                    color = Color.White)
            }
            V2DunkelKarte(Modifier.weight(1f), radius = 16.dp) {
                V2Eyebrow("Ausfälle")
                Text("$ausfaelle", style = MaterialTheme.typography.headlineMedium,
                    color = if (ausfaelle > 0) V2.Rot else Color.White)
            }
        }

        // ---- Nächster Dienst (dunkle `.next`-Karte mit Eyebrow, Pill, Meta) ----
        Spacer(Modifier.height(26.dp))
        V2SektionHead("Mein nächster Dienst")
        V2DunkelKarte(Modifier.fillMaxWidth()) {
            if (naechster == null) {
                V2Eyebrow(if (ich.isBlank()) "Profil wählen" else "Kein Dienst")
                Text(
                    when {
                        ich.isBlank() -> "Tippe auf den Avatar, um dein Profil zu wählen."
                        state.plan.isEmpty() -> "Noch kein Plan erstellt."
                        else -> "Kein weiterer Dienst in diesem Plan."
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    color = V2.TextAufDunkel,
                )
            } else {
                val (datum, dienst) = naechster
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                    Column(Modifier.weight(1f)) {
                        V2Eyebrow("Dein nächster Einsatz")
                        Text(
                            datum.format(DateTimeFormatter.ofPattern("EEE, dd.MM.", Locale.GERMANY)),
                            style = MaterialTheme.typography.headlineMedium,
                            color = Color.White,
                        )
                    }
                    V2StatusPill("info", "Woche ${dienst.woche}")
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Team:", style = MaterialTheme.typography.bodyMedium, color = V2.TextAufDunkel)
                    // Avatar-Stack (`.stack .av`)
                    Row {
                        dienst.mitglieder.take(4).forEachIndexed { idx, m ->
                            Box(Modifier.offset(x = (-8 * idx).dp)) {
                                V2Avatar(m, 30.dp, hell = true)
                            }
                        }
                    }
                    Text(dienst.mitglieder.joinToString(" · "),
                        style = MaterialTheme.typography.bodyMedium, color = V2.TextAufDunkel)
                }
            }
        }

        // ---- Dienstplan-Kalender (helle `.cal`-Karte) ----
        Spacer(Modifier.height(26.dp))
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Dienstplan", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
            V2MiniButton("Sperrtag", onClick = { goto("vorbelegung") }, ghost = true)
            Spacer(Modifier.width(8.dp))
            V2MiniButton("Teilen", onClick = { goto("plan") }, ghost = true)
        }
        Spacer(Modifier.height(12.dp))
        V2MonatsKalenderCard(vm, angezeigterMonat, gewaehlterTag,
            onMonat = { angezeigterMonat = it }, onTag = { gewaehlterTag = it })

        // ---- Tages-Detail (`.detail` mit Status-Pill + Personen-Chips) ----
        gewaehlterTag?.let { tag ->
            Spacer(Modifier.height(12.dp))
            V2TagesDetail(vm, tag)
        }

        Spacer(Modifier.height(90.dp))   // Platz für floating CTA
    }

    // ---- Floating CTA (`.cta`) ----
    Box(Modifier.fillMaxSize()) {
        V2CtaButton(
            text = if (state.laeuft) vm.fortlaufend.ifBlank { "Rechnet…" } else "Plan generieren",
            laeuft = state.laeuft,
            onClick = { scope.launch { vm.generiere() } },
            modifier = Modifier.align(Alignment.BottomCenter).padding(horizontal = 20.dp, vertical = 96.dp),
        )
    }

    if (profilAuswahl) {
        ProfilAuswahlDialog(vm) { profilAuswahl = false }
    }
}

@Composable
fun V2SektionHead(titel: String) {
    Text(titel, style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.padding(bottom = 12.dp))
}

/** Heller Monatskalender im v2-Stil: umrandete Karte, Tages-Kacheln mit Status-Tags. */
@Composable
fun V2MonatsKalenderCard(
    vm: PlanerViewModel,
    monat: YearMonth,
    gewaehlterTag: LocalDate?,
    onMonat: (YearMonth) -> Unit,
    onTag: (LocalDate) -> Unit,
) {
    Card(Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline)) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${monat.month.getDisplayName(TextStyle.FULL, Locale.GERMANY)} ${monat.year}",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { onMonat(monat.minusMonths(1)) }, modifier = Modifier.size(32.dp)) {
                    Text("‹")
                }
                IconButton(onClick = { onMonat(monat.plusMonths(1)) }, modifier = Modifier.size(32.dp)) {
                    Text("›")
                }
            }
            Spacer(Modifier.height(8.dp))
            Row {
                listOf("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So").forEach {
                    Text(it, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall,
                        color = V2.Muted)
                }
            }
            Spacer(Modifier.height(4.dp))
            val von = monat.atDay(1)
            val startOffset = (von.dayOfWeek.value + 6) % 7
            var cursor = von
            var firstRow = true
            while (cursor <= monat.atEndOfMonth() || firstRow) {
                Row(Modifier.fillMaxWidth()) {
                    var inZeile = 0
                    if (firstRow) {
                        repeat(startOffset) { Spacer(Modifier.weight(1f)); inZeile++ }
                        firstRow = false
                    }
                    while (inZeile < 7 && cursor <= monat.atEndOfMonth()) {
                        V2KalenderTag(
                            vm, cursor,
                            selected = gewaehlterTag == cursor,
                            heute = LocalDate.now(),
                            modifier = Modifier.weight(1f),
                            onClick = { onTag(cursor) },
                        )
                        cursor = cursor.plusDays(1)
                        inZeile++
                    }
                    repeat(7 - inZeile) { Spacer(Modifier.weight(1f)) }
                }
                if (cursor > monat.atEndOfMonth()) break
            }
            Spacer(Modifier.height(10.dp))
            // Legende (`.legend`)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                LegendPunkt(V2.Gruen, "Besetzt")
                LegendPunkt(V2.Orange, "Warnung")
                LegendPunkt(V2.Rot, "Konflikt")
                LegendPunkt(V2.Lila, "Sperrtag")
            }
        }
    }
}

@Composable
private fun LegendPunkt(farbe: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).background(farbe, CircleShape))
        Spacer(Modifier.width(5.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = V2.Muted)
    }
}

/** Eine Tages-Kachel (`.day`): rundes Quadrat, Status-Tag unten, Auswahl dunkel. */
@Composable
fun V2KalenderTag(
    vm: PlanerViewModel,
    datum: LocalDate,
    selected: Boolean,
    heute: LocalDate,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val eintrag = vm.state.plan.firstOrNull {
        vm.datumFuer(it.woche, it.tag) == datum
    }
    val status: String? = when {
        eintrag == null -> null
        eintrag.gesperrt -> "warn"
        !eintrag.hatDienst -> "bad"
        datum.isBefore(heute) -> "ok"
        else -> "ok"
    }
    val weekend = datum.dayOfWeek.value >= 6
    Box(
        modifier
            .padding(2.dp)
            .aspectRatio(1f / 1.15f)
            .clip(CircleShape)
            .background(
                when {
                    selected -> V2.KarteDunkel
                    else -> Color.Transparent
                }
            )
            .border(
                width = if (datum == heute) 1.5.dp else 0.dp,
                color = V2.Blau,
                shape = CircleShape,
            )
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "${datum.dayOfMonth}",
                style = MaterialTheme.typography.bodyMedium,
                color = when {
                    selected -> Color.White
                    weekend -> Color(0xFFB5B3AA)
                    else -> V2.Ink
                },
            )
            status?.let { typ ->
                Box(Modifier.padding(bottom = 4.dp)) {
                    Box(
                        Modifier.size(7.dp).background(
                            when (typ) {
                                "ok" -> V2.Gruen
                                "warn" -> V2.Orange
                                else -> V2.Rot
                            },
                            CircleShape,
                        )
                    )
                }
            }
        }
    }
}

/** Tages-Detail (`.detail`): Status-Pill + Personal-Chips. */
@Composable
fun V2TagesDetail(vm: PlanerViewModel, tag: LocalDate) {
    val eintrag = vm.state.plan.firstOrNull { vm.datumFuer(it.woche, it.tag) == tag }
    Card(
        Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    tag.format(DateTimeFormatter.ofPattern("EEEE, dd.MM.", Locale.GERMANY)),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                when {
                    eintrag == null -> V2StatusPill("neutral", "Kein Plan")
                    eintrag.gesperrt -> V2StatusPill("warn", "Kein Dienst")
                    !eintrag.hatDienst -> V2StatusPill("bad", "Offen")
                    else -> V2StatusPill("ok", "Besetzt")
                }
            }
            if (eintrag != null && eintrag.hatDienst) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    eintrag.mitglieder.forEach { m ->
                        Row(
                            Modifier
                                .clip(CircleShape)
                                .background(Color(0xFFF4F2EA))
                                .padding(start = 4.dp, end = 12.dp, top = 4.dp, bottom = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            V2Avatar(m, 26.dp)
                            Spacer(Modifier.width(6.dp))
                            Text(m.split(" ").first(), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
                eintrag.springer?.let {
                    Text("Springer: $it", style = MaterialTheme.typography.bodyMedium, color = V2.Muted)
                }
            }
            val sperrGrund = eintrag?.sperrGrund
            if (eintrag?.gesperrt == true && !sperrGrund.isNullOrBlank()) {
                Text("Hinweis: $sperrGrund", style = MaterialTheme.typography.bodySmall,
                    color = V2.Muted)
            }
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
