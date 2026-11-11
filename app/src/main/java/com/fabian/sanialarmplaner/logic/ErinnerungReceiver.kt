package com.fabian.sanialarmplaner.logic

import android.Manifest
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.fabian.sanialarmplaner.MainActivity
import com.fabian.sanialarmplaner.R

/** Empfängt den geplanten Alarm und zeigt die Erinnerung (#25). */
class ErinnerungReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val titel = intent.getStringExtra("titel") ?: "Sani-Dienst"
        val text = intent.getStringExtra("text") ?: ""

        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
            android.content.pm.PackageManager.PERMISSION_GRANTED
        ) return

        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notifikation = NotificationCompat.Builder(context, Benachrichtigungen.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(titel)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(datumHash(titel), notifikation)
    }

    private fun datumHash(titel: String): Int = titel.hashCode()
}
