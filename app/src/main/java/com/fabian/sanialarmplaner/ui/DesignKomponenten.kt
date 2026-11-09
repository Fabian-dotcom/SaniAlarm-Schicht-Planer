package com.fabian.sanialarmplaner.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

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