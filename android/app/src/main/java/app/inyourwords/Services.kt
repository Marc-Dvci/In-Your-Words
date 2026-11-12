package app.inyourwords

import app.inyourwords.core.PromptSource
import app.inyourwords.core.Proposal
import app.inyourwords.core.SYSTEM_PROMPT
import app.inyourwords.core.Session
import app.inyourwords.core.followupPrompt
import app.inyourwords.core.parseProposal
import com.google.firebase.Firebase
import com.google.firebase.Timestamp
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceModelStatus
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.ai
import com.google.firebase.ai.ondevice.FirebaseAIOnDevice
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.Schema
import com.google.firebase.ai.type.content
import com.google.firebase.ai.type.generationConfig
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.firestore
import com.google.firebase.remoteconfig.remoteConfig
import kotlinx.coroutines.tasks.await
import java.time.Instant

/** What the device reports for its on-device model. */
enum class DeviceStatus { AVAILABLE, DOWNLOADABLE, DOWNLOADING, UNAVAILABLE }

data class Proposed(val proposal: Proposal?, val source: PromptSource, val ms: Long)

/** Runtime values the team can change without a release, read from Remote Config. */
data class RuntimeConfig(val cloudModel: String = "gemini-3.5-flash-lite", val maxFollowups: Int = 2)

suspend fun loadConfig(): RuntimeConfig = try {
    val rc = Firebase.remoteConfig
    rc.setDefaultsAsync(mapOf("cloud_model" to "gemini-3.5-flash-lite", "max_followups" to 2L)).await()
    rc.fetchAndActivate().await()
    RuntimeConfig(rc.getString("cloud_model").ifBlank { "gemini-3.5-flash-lite" }, rc.getLong("max_followups").toInt().coerceAtLeast(1))
} catch (e: Exception) {
    RuntimeConfig()
}

@OptIn(PublicPreviewAPI::class)
suspend fun deviceStatus(): DeviceStatus = try {
    when (FirebaseAIOnDevice.checkStatus()) {
        OnDeviceModelStatus.AVAILABLE -> DeviceStatus.AVAILABLE
        OnDeviceModelStatus.DOWNLOADABLE -> DeviceStatus.DOWNLOADABLE
        OnDeviceModelStatus.DOWNLOADING -> DeviceStatus.DOWNLOADING
        else -> DeviceStatus.UNAVAILABLE
    }
} catch (e: Exception) {
    DeviceStatus.UNAVAILABLE
}

/**
 * Writes follow-up questions through Firebase AI Logic. On a device with Gemini Nano, ONLY_ON_DEVICE: the answers
 * never leave the phone. When the witness chooses the cloud, ONLY_IN_CLOUD.
 */
@OptIn(PublicPreviewAPI::class)
class HybridEngine(onDevice: Boolean, config: RuntimeConfig) {
    val kind = if (onDevice) "on_device" else "cloud"
    private val model = Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
        modelName = config.cloudModel,
        systemInstruction = content { text(SYSTEM_PROMPT) },
        generationConfig = generationConfig {
            responseMimeType = "application/json"
            responseSchema = Schema.obj(mapOf("anchor" to Schema.string(), "question" to Schema.string()))
            temperature = 0.3f
        },
        onDeviceConfig = OnDeviceConfig(mode = if (onDevice) InferenceMode.ONLY_ON_DEVICE else InferenceMode.ONLY_IN_CLOUD),
    )

    suspend fun propose(session: Session): Proposed {
        val t0 = System.nanoTime()
        val r = model.generateContent(followupPrompt(session))
        val ms = (System.nanoTime() - t0) / 1_000_000
        val source = if (r.inferenceSource == InferenceSource.ON_DEVICE) PromptSource.ON_DEVICE else PromptSource.IN_CLOUD
        return Proposed(parseProposal(r.text ?: ""), source, ms)
    }
}

/** Seals and handovers in Firestore, under the same write-once rules as the web build. */
object Store {
    private val db get() = Firebase.firestore

    suspend fun seal(fingerprint: String, mode: String): Pair<Instant, Boolean> {
        val ref = db.collection("seals").document(fingerprint)
        try {
            ref.set(mapOf("v" to 1, "createdAt" to FieldValue.serverTimestamp(), "mode" to mode, "client" to "android")).await()
        } catch (e: Exception) {
            val before = ref.get().await()
            if (before.exists()) return before.getTimestamp("createdAt")!!.toDate().toInstant() to true
            throw e
        }
        return ref.get().await().getTimestamp("createdAt")!!.toDate().toInstant() to false
    }

    suspend fun putHandover(id: String, iv: String, ct: String) {
        db.collection("handovers").document(id).set(
            mapOf(
                "iv" to iv,
                "ct" to ct,
                "createdAt" to FieldValue.serverTimestamp(),
                "expiresAt" to Timestamp(java.util.Date(System.currentTimeMillis() + 30 * 60_000)),
            ),
        ).await()
    }
}
