package com.fabian.sanialarmplaner.ui

import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.fabian.sanialarmplaner.data.Person
import com.fabian.sanialarmplaner.data.BeitrittQrDaten
import com.fabian.sanialarmplaner.data.dekodiereBeitritt
import com.fabian.sanialarmplaner.data.kodiereBeitritt
import com.fabian.sanialarmplaner.data.vollerName
import com.fabian.sanialarmplaner.viewmodel.PlanerViewModel
import com.google.zxing.BarcodeFormat
import com.google.zxing.WriterException
import com.journeyapps.barcodescanner.BarcodeEncoder
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.serialization.SerializationException

private enum class BeitrittAnsicht { START, EINLADUNG, FORMULAR, ANFRAGE, BESTAETIGUNG }

@Composable
fun BeitrittQrDialog(vm: PlanerViewModel, onSchliessen: () -> Unit) {
    var ansicht by remember { mutableStateOf(BeitrittAnsicht.START) }
    var code by remember { mutableStateOf<String?>(null) }
    var person by remember { mutableStateOf<BeitrittQrDaten?>(null) }
    var vorname by remember { mutableStateOf("") }
    var nachname by remember { mutableStateOf("") }
    var klasse by remember { mutableStateOf("") }
    var telefon by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var meldung by remember { mutableStateOf<String?>(null) }

    val scanner = rememberLauncherForActivityResult(ScanContract()) { result ->
        val contents = result.contents
        if (contents != null) {
            try {
                when (val daten = dekodiereBeitritt(contents)) {
                    null -> meldung = "Der QR-Code ist kein gültiger SaniAlarm-Beitrittscode."
                    else -> when (daten.typ) {
                        "einladung" -> {
                            vorname = ""
                            nachname = ""
                            klasse = ""
                            telefon = ""
                            email = ""
                            ansicht = BeitrittAnsicht.FORMULAR
                            meldung = null
                        }
                        "person" -> {
                            person = daten
                            ansicht = BeitrittAnsicht.BESTAETIGUNG
                            meldung = null
                        }
                    }
                }
            } catch (_: IllegalArgumentException) {
                meldung = "Der QR-Code enthält ungültige Daten."
            } catch (_: SerializationException) {
                meldung = "Der QR-Code enthält ein ungültiges Beitrittsformular."
            }
        }
    }

    AlertDialog(
        onDismissRequest = onSchliessen,
        title = { Text("Beitritt ohne Server") },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                when (ansicht) {
                    BeitrittAnsicht.START -> {
                        Text("Die Anmeldung funktioniert vollständig offline mit QR-Codes.")
                        Button(
                            onClick = {
                                code = kodiereBeitritt(BeitrittQrDaten(typ = "einladung"))
                                ansicht = BeitrittAnsicht.EINLADUNG
                                meldung = null
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Einladungscode anzeigen") }
                        OutlinedButton(
                            onClick = { scanner.launch(scanOptionen()) },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("QR-Code scannen") }
                    }
                    BeitrittAnsicht.EINLADUNG -> {
                        Text("Die neue Person scannt diesen Code in der SaniAlarm-App und füllt dort das Offline-Formular aus.")
                        code?.let { QrBild(it, "Beitrittseinladung") }
                        OutlinedButton(
                            onClick = { scanner.launch(scanOptionen()) },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Antwortcode scannen") }
                    }
                    BeitrittAnsicht.FORMULAR -> {
                        Text("Kontaktdaten werden nur in den QR-Code geschrieben und nicht übertragen.")
                        OutlinedTextField(vorname, { vorname = it.take(80) }, label = { Text("Vorname *") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(nachname, { nachname = it.take(100) }, label = { Text("Nachname") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(klasse, { klasse = it.take(80) }, label = { Text("Klasse / Gruppe") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(telefon, { telefon = it.take(40) }, label = { Text("Telefon (optional)") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(email, { email = it.take(120) }, label = { Text("E-Mail (optional)") }, modifier = Modifier.fillMaxWidth())
                    }
                    BeitrittAnsicht.ANFRAGE -> {
                        Text("Antwortcode nur der AG-Leitung zeigen. Name und Kontaktdaten sind im Code lesbar.")
                        code?.let { QrBild(it, "Beitrittsanfrage") }
                    }
                    BeitrittAnsicht.BESTAETIGUNG -> {
                        val daten = person
                        if (daten != null) {
                            Text("Neue Person übernehmen?", fontWeight = FontWeight.SemiBold)
                            Text(listOf(daten.vorname, daten.nachname).filter { it.isNotBlank() }.joinToString(" "))
                            if (daten.klasse.isNotBlank()) Text("Klasse / Gruppe: ${daten.klasse}")
                            if (daten.telefon.isNotBlank()) Text("Telefon: ${daten.telefon}")
                            if (daten.email.isNotBlank()) Text("E-Mail: ${daten.email}")
                        }
                    }
                }
                meldung?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            when (ansicht) {
                BeitrittAnsicht.FORMULAR -> TextButton(
                    enabled = vorname.isNotBlank(),
                    onClick = {
                        val daten = BeitrittQrDaten(
                            typ = "person",
                            vorname = vorname.trim(),
                            nachname = nachname.trim(),
                            klasse = klasse.trim(),
                            telefon = telefon.trim(),
                            email = email.trim(),
                        )
                        code = kodiereBeitritt(daten)
                        ansicht = BeitrittAnsicht.ANFRAGE
                    },
                ) { Text("Antwortcode erstellen") }
                BeitrittAnsicht.BESTAETIGUNG -> TextButton(onClick = {
                    val daten = person
                    if (daten != null) {
                        val neu = Person(
                            vorname = daten.vorname.trim(),
                            nachname = daten.nachname.trim(),
                            klasse = daten.klasse.trim(),
                            telefon = daten.telefon.trim(),
                            email = daten.email.trim(),
                        )
                        val bereitsVorhanden = vm.state.datei.personen.any {
                            it.vollerName().equals(neu.vollerName(), ignoreCase = true)
                        }
                        if (bereitsVorhanden) {
                            meldung = "Diese Person ist bereits in der Kartei."
                        } else {
                            vm.updateDatei { datei -> datei.copy(personen = datei.personen + neu) }
                            onSchliessen()
                        }
                    }
                }) { Text("In Kartei übernehmen") }
                else -> Unit
            }
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (ansicht != BeitrittAnsicht.START) {
                    TextButton(onClick = {
                        ansicht = BeitrittAnsicht.START
                        code = null
                        person = null
                        meldung = null
                    }) { Text("Zurück") }
                }
                TextButton(onClick = onSchliessen) { Text("Schließen") }
            }
        },
    )
}

@Composable
private fun QrBild(code: String, beschreibung: String) {
    val bitmapResult = remember(code) {
        try {
            Result.success(BarcodeEncoder().encodeBitmap(code, BarcodeFormat.QR_CODE, 700, 700))
        } catch (e: WriterException) {
            Result.failure(e)
        }
    }
    bitmapResult.fold(
        onSuccess = { bitmap: Bitmap ->
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = beschreibung,
                modifier = Modifier.size(240.dp),
            )
        },
        onFailure = { error ->
            Text("QR-Code konnte nicht erstellt werden: ${error.message}", color = MaterialTheme.colorScheme.error)
        },
    )
}

private fun scanOptionen() = ScanOptions().apply {
    setDesiredBarcodeFormats(ScanOptions.QR_CODE)
    setPrompt("SaniAlarm-Beitrittscode scannen")
    setBeepEnabled(false)
    setOrientationLocked(true)
}
