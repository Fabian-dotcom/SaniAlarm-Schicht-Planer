package com.fabian.sanialarmplaner

import android.content.Intent
import android.net.Uri
import android.os.Bundle
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
