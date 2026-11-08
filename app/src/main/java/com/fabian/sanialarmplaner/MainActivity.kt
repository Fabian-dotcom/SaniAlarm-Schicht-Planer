package com.fabian.sanialarmplaner

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.fabian.sanialarmplaner.data.ConfigStore
import com.fabian.sanialarmplaner.ui.PlanerScreen
import com.fabian.sanialarmplaner.viewmodel.PlanerViewModel
import com.fabian.sanialarmplaner.ui.theme.SaniAlarmPlanerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val vm = PlanerViewModel(ConfigStore(this))
        setContent {
            SaniAlarmPlanerTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    PlanerScreen(vm)
                }
            }
        }
    }
}
