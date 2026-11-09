package com.fabian.sanialarmplaner.logic

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.fabian.sanialarmplaner.MainActivity
import com.fabian.sanialarmplaner.R

/**
 * Lokale Benachrichtigungen vor dem eigenen Dienst (#25).
 * Kein Server noetig - AlarmManager + NotificationManager reichen.
 */
object Benachrichtigungen {

    const val CHANNEL_ID = "dienst_erinnerung"

    fun kanalErstellen(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val kanal = NotificationChannel(
                CHANNEL_ID,
                "Dienst-Erinnerung",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Erinnert 1-2 Tage vor dem eigenen Sani-Dienst"
            }
            context.getSystemService(NotificationManager::class.java)
                .createNotificationChannel(kanal)
        }
    }

    fun berechtigungVorhanden(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    /**
     * Plant eine Erinnerung fuer einen Dienst. [datumIso] = "2026-11-10",
     * Vorlauf in Stunden (z.B. 24 oder 48).
     */
    fun planeErinnerung(
        context: Context,
        alarmManager: android.app.AlarmManager,
        datumIso: String,
        dienstBeschreibung: String,
        vorlaufStunden: Long,
    ) {
        val datum = try { java.time.LocalDate.parse(datumIso) } catch (_: Exception) { return }
        val zeitpunkt = datum.minusDays(if (vorlaufStunden >= 24) 1 else 0)
            .atTime(17, 0)   // 17:00 Uhr am Vorabend
            .atZone(java.time.ZoneId.systemDefault())
            .toInstant().toEpochMilli()
        if (zeitpunkt <= System.currentTimeMillis()) return   // Vergangenheit

        val intent = Intent(context, ErinnerungReceiver::class.java).apply {
            putExtra("titel", "Sani-Dienst morgen!")
            putExtra("text", dienstBeschreibung)
        }
        val pending = PendingIntent.getBroadcast(
            context, datumIso.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.setExactAndAllowWhileIdle(
            android.app.AlarmManager.RTC_WAKEUP, zeitpunkt, pending
        )
    }

    fun loescheErinnerung(context: Context, datumIso: String) {
        val intent = Intent(context, ErinnerungReceiver::class.java)
        val pending = PendingIntent.getBroadcast(
            context, datumIso.hashCode(), intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        pending?.cancel()
    }
}
