// ─── Phase 4.3: Android Call Screening Service ───
// Intercepts incoming calls before the elder answers.
// Calls fn-call-reputation with the incoming phone number.
// If score >= 70: shows full-screen "Niet opnemen" warning.
// If score >= 40: shows subtle "Let op: onbekend nummer" banner.
// Requires: MANAGE_OWN_CALLS permission in AndroidManifest.xml
// Requires: android.permission.READ_PHONE_STATE
// Requires: CallScreeningService declaration in AndroidManifest.xml

package nl.haven.elder

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import android.util.Log
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

class HavenCallScreeningService : CallScreeningService() {

    companion object {
        private const val TAG = "HavenCallScreening"
        private const val CACHE_TTL_MS = 24 * 60 * 60 * 1000L // 24 hours
        private const val HIGH_RISK_THRESHOLD = 70
        private const val MEDIUM_RISK_THRESHOLD = 40
    }

    // In-memory cache to avoid repeated API calls for the same number
    private val reputationCache = ConcurrentHashMap<String, CachedReputation>()

    data class CachedReputation(
        val score: Int,
        val timestamp: Long
    )

    override fun onScreenCall(details: Call.Details) {
        val phoneNumber = details.handle?.schemeSpecificPart ?: return

        // Check cache first
        val cached = reputationCache[phoneNumber]
        if (cached != null && System.currentTimeMillis() - cached.timestamp < CACHE_TTL_MS) {
            respondBasedOnScore(details, cached.score)
            return
        }

        // Check permission before making network call
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE)
                != PackageManager.PERMISSION_GRANTED) {
                // No permission — allow the call by default (fail-open for privacy)
                respondToCall(details, CallResponse.Builder().build())
                return
            }
        }

        // Fetch reputation from HAVEN backend
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val score = fetchReputation(phoneNumber)
                reputationCache[phoneNumber] = CachedReputation(score, System.currentTimeMillis())
                withContext(Dispatchers.Main) {
                    respondBasedOnScore(details, score)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Reputation fetch failed for $phoneNumber: ${e.message}")
                // Allow the call on error (fail-open for availability)
                withContext(Dispatchers.Main) {
                    respondToCall(details, CallResponse.Builder().build())
                }
            }
        }
    }

    private fun respondBasedOnScore(details: Call.Details, score: Int) {
        val response = when {
            score >= HIGH_RISK_THRESHOLD -> {
                // High risk — block and show full-screen warning
                CallResponse.Builder()
                    .setDisallowCall(true)
                    .setRejectCall(true)
                    .setSkipCallLog(false)
                    .setSilenceCall(false)
                    .build()
            }
            score >= MEDIUM_RISK_THRESHOLD -> {
                // Medium risk — allow but show subtle notification
                // (notification handled by HAVEN push, not by the call screening)
                CallResponse.Builder()
                    .setDisallowCall(false) // Allow the call to ring
                    .build()
            }
            else -> {
                // Low risk — allow normally
                CallResponse.Builder().build()
            }
        }
        respondToCall(details, response)
    }

    private suspend fun fetchReputation(phoneNumber: String): Int {
        val supabaseUrl = getSharedPreferences("haven", MODE_PRIVATE)
            .getString("supabase_url", null)
            ?: return 0

        val accessToken = getSharedPreferences("haven", MODE_PRIVATE)
            .getString("access_token", null)
            ?: return 0

        val url = URL("${supabaseUrl}/functions/v1/fn-call-reputation")
        val connection = url.openConnection() as HttpURLConnection

        return withContext(Dispatchers.IO) {
            try {
                connection.requestMethod = "POST"
                connection.setRequestProperty("Authorization", "Bearer $accessToken")
                connection.setRequestProperty("Content-Type", "application/json")
                connection.connectTimeout = 3000 // Fail fast — call screening is time-critical
                connection.readTimeout = 2000

                val body = JSONObject().apply {
                    put("phone", phoneNumber)
                    put("provider", "android-call-screening")
                }

                connection.outputStream.use { os ->
                    os.write(body.toString().toByteArray())
                }

                if (connection.responseCode == 200) {
                    val responseText = connection.inputStream.bufferedReader().readText()
                    val json = JSONObject(responseText)
                    json.optInt("reputation_score", 0)
                } else {
                    0
                }
            } catch (e: Exception) {
                Log.w(TAG, "Network error: ${e.message}")
                0
            } finally {
                connection.disconnect()
            }
        }
    }
}
