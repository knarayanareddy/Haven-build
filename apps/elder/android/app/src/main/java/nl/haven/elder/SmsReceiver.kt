// ─── Phase 4.4: Android SMS Receiver ───
// Intercepts incoming SMS messages and screens them for scam patterns.
// Does NOT block SMS — only screens and shows notification if suspicious.
// Privacy-preserving: messages are hashed before storage (same pattern as fn-scam-pipeline).
//
// Requires: RECEIVE_SMS permission, BroadcastReceiver in AndroidManifest.xml

package nl.haven.elder

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class HavenSmsReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "HavenSmsReceiver"
        private const val SCAM_CHANNEL_ID = "haven_scam_sms"
        private const val SCAM_THRESHOLD = 70
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) return

        val sms = messages.first()
        val body = sms.messageBody ?: return
        val sender = sms.originatingAddress ?: "unknown"

        // Skip if body is too short to be a scam
        if (body.length < 15) return

        // Create notification channel (once)
        createNotificationChannel(context)

        // Screen the SMS in background
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val score = screenSms(context, sender, body)
                if (score >= SCAM_THRESHOLD) {
                    showScamNotification(context, sender, body, score)
                }
            } catch (e: Exception) {
                Log.w(TAG, "SMS screening failed: ${e.message}")
            }
        }
    }

    private suspend fun screenSms(context: Context, sender: String, body: String): Int {
        val prefs = context.getSharedPreferences("haven", Context.MODE_PRIVATE)
        val supabaseUrl = prefs.getString("supabase_url", null) ?: return 0
        val accessToken = prefs.getString("access_token", null) ?: return 0
        val elderId = prefs.getString("elder_id", null) ?: return 0

        val url = URL("${supabaseUrl}/functions/v1/fn-scam-pipeline")

        return withContext(Dispatchers.IO) {
            try {
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Authorization", "Bearer $accessToken")
                connection.setRequestProperty("Content-Type", "application/json")
                connection.connectTimeout = 5000
                connection.readTimeout = 5000

                val body = JSONObject().apply {
                    put("elder_id", elderId)
                    put("channel", "sms")
                    put("signal_reference", hashString(sender))
                    put("raw_content", body)
                }

                connection.outputStream.use { os ->
                    os.write(body.toString().toByteArray())
                }

                if (connection.responseCode == 200) {
                    val responseText = connection.inputStream.bufferedReader().readText()
                    val json = JSONObject(responseText)
                    json.optInt("composite_score", 0)
                } else {
                    0
                }
            } catch (e: Exception) {
                Log.w(TAG, "SMS screening network error: ${e.message}")
                0
            }
        }
    }

    private fun showScamNotification(context: Context, sender: String, body: String, score: Int) {
        val contentText = "Verdacht bericht van $sender. Risicoscore $score%. Tik open Schild voor uitleg."
        val summaryText = body.take(80) + if (body.length > 80) "…" else ""

        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, SCAM_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("⚠️ HAVEN Schild — Verdacht bericht")
            .setContentText(contentText)
            .setStyle(NotificationCompat.BigTextStyle().bigText("$contentText\n\nBericht: $summaryText"))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(
                "scam_sms_${hashString(sender)}".hashCode() and Int.MAX_VALUE,
                notification
            )
        } catch (e: SecurityException) {
            Log.w(TAG, "Notification permission denied: ${e.message}")
        }
    }

    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                SCAM_CHANNEL_ID,
                "HAVEN Scam SMS",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Waarschuwingen voor verdachte SMS-berichten"
            }
            val manager = context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun hashString(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(input.toByteArray())
            .joinToString("") { "%02x".format(it) }
            .take(16)
    }
}
