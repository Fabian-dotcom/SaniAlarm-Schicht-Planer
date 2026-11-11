package com.fabian.sanialarmplaner.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.CornerSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate

/**
 * Sektionstitel mit Info-Icon: Erlaertexte (Formeln etc.) leben hinter dem
 * Icon statt als Dauer-Fließtext unter der Überschrift (Richtlinie 3).
 */
@Composable
fun SaniSektionTitel(titel: String, info: String? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            titel.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.weight(1f)
        )
        info?.let { text ->
            var zeige by remember { mutableStateOf(false) }
            IconButton(onClick = { zeige = !zeige }, modifier = Modifier.size(24.dp)) {
                Icon(
                    Icons.Default.Info, contentDescription = "Erklärung zu $titel",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp)
                )
            }
            if (zeige) {
                Text(
                    text,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
        }
    }
}

/** Zwei Werte nebeneinander als Highlight-Kachel (Richtlinie 2: große Zahlen, kleine Beschriftung). */
@Composable
fun SaniKennzahlKachel(titel: String, wert: String, untertitel: String, modifier: Modifier = Modifier, info: String? = null) {
    Card(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(Modifier.padding(14.dp)) {
            SaniSektionTitel(titel, info)
            Spacer(Modifier.height(6.dp))
            Text(wert, style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.primary)
            Text(untertitel, style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Vergleichender Fortschrittsbalken (Richtlinie 3: Balken statt Textreihen). */
@Composable
fun SaniBalken(label: String, wertText: String, anteil: Float, farbe: Color = MaterialTheme.colorScheme.primary) {
    Column(Modifier.padding(vertical = 3.dp)) {
        Row {
            Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, maxLines = 1)
            Text(wertText, style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        LinearProgressIndicator(
            progress = { anteil.coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth(),
            color = farbe,
        )
    }
}

/** Farbsignal fuer Datenvertrauen (Richtlinie 3: Farben als Signale). */
fun vertrauensFarbe(stufe: String, primary: Color, warnung: Color, fehler: Color): Color = when (stufe) {
    "hoch" -> primary
    "mittel" -> warnung
    else -> fehler
}

@Composable
fun SaniSektion(titel: String, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium, // 16.dp abgerundet laut Design System
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                titel.uppercase(), 
                style = MaterialTheme.typography.labelMedium, 
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(Modifier.height(2.dp))
            content()
        }
    }
}

@Composable
fun SaniAufklapp(titel: String, startOffen: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    var offen by remember { mutableStateOf(startOffen) }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { offen = !offen }
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(titel, modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                Icon(
                    imageVector = if (offen) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = if (offen) "Zuklappen" else "Aufklappen",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (offen) {
                Column(
                    modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) { 
                    content() 
                }
            }
        }
    }
}

@Composable
fun SaniSchalter(titel: String, aktiv: Boolean, untertitel: String? = null, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), 
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(titel, style = MaterialTheme.typography.bodyLarge)
            untertitel?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Switch(checked = aktiv, onCheckedChange = onChange)
    }
}

@Composable
fun SaniBadge(text: String, farbe: Color) {
    Surface(
        shape = MaterialTheme.shapes.small, 
        color = farbe.copy(alpha = 0.18f)
    ) {
        Text(
            text = text, 
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            style = MaterialTheme.typography.labelSmall, 
            color = MaterialTheme.colorScheme.onSurface, 
            maxLines = 1
        )
    }
}
// ==============================================================================
// INDEX-V2 DESIGN-VOKABULAR (aus index-v2/index.html übernommen)
// Warmes Creme als App-Hintergrund, dunkle Karten (#272727) als Akzentflächen,
// Outfit-Typografie, Pill-Buttons, Segmented Control, Status-Pills.
// ==============================================================================

/** v2-Farbtoken (aus :root des Prototyps). */
object V2 {
    val Hintergrund = Color(0xFFF9F8F2)   // --bg (warmes Creme)
    val KarteDunkel = Color(0xFF272727)   // --card (dunkle Akzent-Karte)
    val Ink = Color(0xFF151515)           // --ink
    val Muted = Color(0xFF6F6E68)         // --muted
    val Linie = Color(0xFFE5E3D8)         // --line
    val Surface = Color(0xFFFFFFFF)       // --surface
    val Blau = Color(0xFF007BFF)
    val Rot = Color(0xFFDC3545)
    val Orange = Color(0xFFFFC107)
    val Gruen = Color(0xFF34C759)
    val Pink = Color(0xFFF3A6CF)
    val Lavendel = Color(0xFFC8A8F6)
    val Lila = Color(0xFF6B4FBB)
    val WeißAufDunkel = Color(0xFFFFFFFF)
    val GrauAufDunkel = Color(0xFFA9A9A3)
    val TextAufDunkel = Color(0xFFD8D8D2)
    val KarteHell = Color(0xFFECEAE0)      // Segmented-Control-Hintergrund
    val Tinte = Ink
}

/**
 * Dunkle Akzent-Karte (`.stat`, `.next`): #272727-Hintergrund, weiße Schrift,
 * 16-20dp Radius — das charakteristische Element des v2-Designs.
 */
@Composable
fun V2DunkelKarte(
    modifier: Modifier = Modifier,
    radius: androidx.compose.ui.unit.Dp = 20.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = modifier,
        shape = MaterialTheme.shapes.extraLarge.copy(all = androidx.compose.foundation.shape.CornerSize(radius)),
        colors = CardDefaults.cardColors(containerColor = V2.KarteDunkel),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(
            Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            content = content,
        )
    }
}

/** Eyebrow-Label (`.eyebrow`): versal, gesperrt, gedämpft auf dunkler Karte. */
@Composable
fun V2Eyebrow(text: String) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        letterSpacing = 1.2.sp,
        color = V2.GrauAufDunkel,
    )
}

/** Status-Pill (`.status-pill.ok/warn/bad`, `.tag`). */
@Composable
fun V2StatusPill(typ: String, text: String) {
    val (bg, fg) = when (typ) {
        "ok" -> V2.Gruen.copy(alpha = 0.16f) to Color(0xFF1E8E3E)
        "warn" -> V2.Orange.copy(alpha = 0.2f) to Color(0xFF9A6B00)
        "bad" -> V2.Rot.copy(alpha = 0.14f) to V2.Rot
        "info" -> V2.Blau.copy(alpha = 0.18f) to Color(0xFF6FB2FF)
        else -> V2.Muted.copy(alpha = 0.14f) to V2.Muted
    }
    Surface(shape = MaterialTheme.shapes.small, color = bg) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = fg,
            maxLines = 1,
        )
    }
}

/** Runder Avatar mit Initialen (`.av`, `.avatar-lg`), Farbwahl stabil nach Name. */
@Composable
fun V2Avatar(name: String, groesse: androidx.compose.ui.unit.Dp = 32.dp, hell: Boolean = false) {
    val farben = listOf(V2.Lila, V2.Blau, V2.Gruen, V2.Pink, V2.Lavendel, V2.Orange)
    val farbe = farben[kotlin.math.abs(name.hashCode()) % farben.size]
    Box(
        Modifier.size(groesse).background(if (hell) V2.KarteDunkel else farbe, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            name.split(" ").firstOrNull()?.take(1)?.uppercase() ?: "?",
            color = Color.White,
            fontSize = (groesse.value / 2.4f).sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

/** Pill-Button (`.mini`, `.cta`): voller Radius, dunkel oder ghost. */
@Composable
fun V2MiniButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    ghost: Boolean = false,
    enabled: Boolean = true,
) {
    Box(
        modifier
            .height(34.dp)
            .clip(CircleShape)
            .background(
                if (ghost) Color.Transparent else V2.KarteDunkel,
                CircleShape,
            )
            .then(
                if (ghost) Modifier.border(1.dp, Color(0xFFD8D6CB), CircleShape) else Modifier
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            style = MaterialTheme.typography.labelLarge,
            color = if (ghost) V2.Ink else Color.White,
        )
    }
}

/** Floating CTA (`.cta`): voller Blau-Pill-Button mit Schatten. */
@Composable
fun V2CtaButton(
    text: String,
    laeuft: Boolean,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !laeuft,
        shape = CircleShape,
        colors = ButtonDefaults.buttonColors(containerColor = V2.Blau, contentColor = Color.White),
        modifier = modifier.fillMaxWidth().height(56.dp),
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 8.dp),
    ) {
        Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
    }
}

/** Segmented Control (`.seg`): Liste/Kacheln-Umschaltung im v2-Stil. */
@Composable
fun V2Segmented(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    Row(
        Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFFECEAE0))
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        options.forEach { (key, label) ->
            val aktiv = key == selected
            Box(
                Modifier
                    .clip(RoundedCornerShape(9.dp))
                    .background(if (aktiv) V2.Surface else Color.Transparent)
                    .clickable { onSelect(key) }
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text(
                    label,
                    style = MaterialTheme.typography.labelLarge,
                    color = if (aktiv) V2.Ink else V2.Muted,
                )
            }
        }
    }
}

/** Vergleichender Balken mit Mittelwert-Markierung (`.bar-row`, `.track`, `.avgmark`). */
@Composable
fun V2BalkenRow(name: String, indexText: String, anteil: Float, istDurchschnitt: Boolean) {
    Column(Modifier.padding(vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            V2Avatar(name, 24.dp)
            Spacer(Modifier.width(8.dp))
            Text(name, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, maxLines = 1)
            Text(
                indexText,
                style = MaterialTheme.typography.labelSmall,
                color = V2.Muted,
                fontWeight = if (istDurchschnitt) FontWeight.SemiBold else FontWeight.Normal,
            )
        }
        Spacer(Modifier.height(6.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(CircleShape)
                .background(Color(0xFFEFEDE4)),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(anteil.coerceIn(0.02f, 1f))
                    .fillMaxHeight()
                    .clip(CircleShape)
                    .background(if (istDurchschnitt) V2.Lila else V2.Blau),
            )
        }
    }
}

/** Termino-Zeile (`.exam`): großes Datum links, Info rechts, Trennlinie oben. */
@Composable
fun V2TerminZeile(datum: LocalDate, titel: String, untertitel: String) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(46.dp)) {
            Text("${datum.dayOfMonth}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Medium)
            Text(
                datum.month.getDisplayName(java.time.format.TextStyle.NARROW, java.util.Locale.GERMANY),
                style = MaterialTheme.typography.labelSmall,
                color = V2.Muted,
            )
        }
        Spacer(Modifier.width(12.dp))
        Column {
            Text(titel, style = MaterialTheme.typography.bodyLarge)
            Text(untertitel, style = MaterialTheme.typography.bodySmall, color = V2.Muted)
        }
    }
}

/** v2 Segmented Control: breite Pillen-Leiste auf hellem Grund (variiert vom dunklen Prototyp-Kontext). */
@Composable
fun V2Segmented(
    optionen: List<Pair<String, String>>,
    ausgewaehlt: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(shape = MaterialTheme.shapes.extraLarge, color = V2.KarteHell) {
        Row(modifier.padding(3.dp)) {
            optionen.forEach { (id, label) ->
                val aktiv = id == ausgewaehlt
                Surface(
                    shape = MaterialTheme.shapes.extraLarge,
                    color = if (aktiv) V2.Tinte else Color.Transparent,
                    modifier = Modifier
                        .clickableWithoutRipple { onSelect(id) }
                        .padding(horizontal = 2.dp),
                ) {
                    Text(
                        label,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                        style = MaterialTheme.typography.labelMedium,
                        color = if (aktiv) Color.White else V2.Muted,
                    )
                }
            }
        }
    }
}

private fun Modifier.clickableWithoutRipple(onClick: () -> Unit): Modifier = composed {
    clickable(
        interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
        indication = null,
        onClick = onClick,
    )
}
