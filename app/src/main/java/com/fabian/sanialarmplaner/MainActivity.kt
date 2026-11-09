package com.fabian.sanialarmplaner

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.fabian.sanialarmplaner.data.ConfigStore
import com.fabian.sanialarmplaner.data.SaniteamStore
import com.fabian.sanialarmplaner.ui.ImportDialogHost
import com.fabian.sanialarmplaner.ui.PlanerScreen
import com.fabian.sanialarmplaner.viewmodel.PlanerViewModel
import com.fabian.sanialarmplaner.ui.theme.SaniAlarmPlanerTheme

class MainActivity : ComponentActivity() {

    private lateinit var vm: PlanerViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val saniteamStore = SaniteamStore(this)
        vm = PlanerViewModel(ConfigStore(this), saniteamStore)
        vm.setSaniteamStore(saniteamStore)

        // .saniteam-Datei, mit der die App gestartet wurde (z.B. aus Messenger)
        intentAuslesen(intent)

        setContent {
            SaniAlarmPlanerTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    ImportDialogHost(vm)
                    PlanerScreen(vm)
                }
            }
        }

        // Benachrichtigungen (#25): Kanal + Berechtigung anfragen
        com.fabian.sanialarmplaner.logic.Benachrichtigungen.kanalErstellen(this)
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 100)
        }
    }

    /** Plant Erinnerungen fuer alle eigenen Dienste des aktuellen Plans (#25). */
    fun planeErinnerungenFuerPlan(vorlaufStunden: Long = 24) {
        val alarmManager = getSystemService(ALARM_SERVICE) as android.app.AlarmManager
        for (e in vm.state.plan) {
            if (!e.hatDienst) continue
            val datum = vm.datumFuer(e.woche, e.tag) ?: continue
            if (datum.isBefore(java.time.LocalDate.now())) continue
            com.fabian.sanialarmplaner.logic.Benachrichtigungen.planeErinnerung(
                this, alarmManager, datum.toString(),
                "${e.tag}: ${e.mitglieder.joinToString()}", vorlaufStunden
            )
        }
        vm.markiereErinnerungenGeplant()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intentAuslesen(intent)
    }

    private fun intentAuslesen(intent: Intent?) {
        val uri = intent?.data ?: return
        if (intent.action == Intent.ACTION_VIEW) {
            try {
                val text = contentResolver.openInputStream(uri)
                    ?.bufferedReader()?.use { it.readText() } ?: return
                vm.pruefeOeffnungAnfordern(text)
            } catch (_: Exception) {
                // ungueltige Datei: still ignorieren
            }
        }
    }
}
