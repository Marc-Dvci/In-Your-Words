package app.inyourwords.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.security.MessageDigest
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The seal: a SHA-256 fingerprint of the whole interview (every question asked and every answer given), in a
 * canonical form both platforms compute byte for byte. Only this fingerprint leaves the device.
 */

/** One question and the answer the witness gave to it, as it is sealed. */
data class SealedTurn(val question: String, val source: PromptSource, val answer: String)

/** One phase of a sealed interview, with only the turns the witness answered. */
data class SealedPhase(val id: PhaseId, val turns: List<SealedTurn>)

/** The whole interview as it is sealed. Its version is always 1. */
data class SealedAccount(val startedAt: String, val mode: Mode, val phases: List<SealedPhase>) {
    /** The version of the sealed format. */
    val v: Int = 1
}

/** Builds the account that is sealed from [session]. Phases keep their order; unanswered turns are left out. */
fun sealable(session: Session): SealedAccount = SealedAccount(
    startedAt = session.startedAt,
    mode = session.mode,
    phases = session.phases.map { p ->
        SealedPhase(
            id = p.id,
            turns = p.turns
                .filter { jsTrim(it.answer).isNotEmpty() }
                .map { SealedTurn(question = it.prompt.text, source = it.prompt.source, answer = it.answer) },
        )
    },
)

private fun SealedAccount.toJsonElement(): JsonObject = buildJsonObject {
    put("v", v)
    put("startedAt", startedAt)
    put("mode", mode.wire)
    put(
        "phases",
        buildJsonArray {
            for (phase in phases) {
                add(
                    buildJsonObject {
                        put("id", phase.id.wire)
                        put(
                            "turns",
                            buildJsonArray {
                                for (turn in phase.turns) {
                                    add(
                                        buildJsonObject {
                                            put("question", turn.question)
                                            put("source", turn.source.wire)
                                            put("answer", turn.answer)
                                        },
                                    )
                                }
                            },
                        )
                    },
                )
            }
        },
    )
}

/**
 * The canonical JSON text of [account]: object keys sorted at every level, no insignificant white space, and strings
 * escaped as JavaScript's `JSON.stringify` escapes them. The web build seals the same text.
 */
fun canonicalJson(account: SealedAccount): String = canonicalJson(account.toJsonElement())

internal fun canonicalJson(value: JsonElement): String = when (value) {
    JsonNull -> "null"
    is JsonPrimitive -> if (value.isString) jsonString(value.content) else value.content
    is JsonArray -> value.joinToString(separator = ",", prefix = "[", postfix = "]") { canonicalJson(it) }
    is JsonObject -> value.keys.sorted().joinToString(separator = ",", prefix = "{", postfix = "}") { key ->
        jsonString(key) + ":" + canonicalJson(value.getValue(key))
    }
}

/** A JSON string literal for [text], escaped the way `JSON.stringify` escapes it. */
internal fun jsonString(text: String): String {
    val out = StringBuilder(text.length + 2).append('"')
    var i = 0
    while (i < text.length) {
        val c = text[i]
        when {
            c == '"' -> out.append("\\\"")
            c == '\\' -> out.append("\\\\")
            c == '\b' -> out.append("\\b")
            c == '\u000C' -> out.append("\\f")
            c == '\n' -> out.append("\\n")
            c == '\r' -> out.append("\\r")
            c == '\t' -> out.append("\\t")
            c < ' ' -> out.appendUnicodeEscape(c)
            c.isHighSurrogate() && i + 1 < text.length && text[i + 1].isLowSurrogate() -> {
                out.append(c).append(text[i + 1])
                i++
            }
            c.isSurrogate() -> out.appendUnicodeEscape(c)
            else -> out.append(c)
        }
        i++
    }
    return out.append('"').toString()
}

private fun StringBuilder.appendUnicodeEscape(c: Char): StringBuilder =
    append("\\u").append(c.code.toString(16).padStart(4, '0'))

internal fun ByteArray.toHex(): String = joinToString("") { (it.toInt() and 0xFF).toString(16).padStart(2, '0') }

/** The SHA-256 digest of the UTF-8 bytes of [text], as 64 lower-case hex digits. */
fun sha256Hex(text: String): String = MessageDigest.getInstance("SHA-256").digest(utf8Bytes(text)).toHex()

/** The fingerprint of [account]: the SHA-256 of its canonical JSON. */
fun fingerprint(account: SealedAccount): String = sha256Hex(canonicalJson(account))

/** The fingerprint in groups of four, four groups to a line, as printed under the seal. */
fun groupHex(hex: String): List<String> = chunksOfFour(hex).chunked(4).map { line -> line.joinToString(" ") }

private val MRZ_TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'", Locale.ROOT).withZone(ZoneOffset.UTC)

/**
 * A passport-style machine-readable line for the seal: `IYW<<SEALED<<`, the UTC time to the second, and the first 24
 * hex digits of [hex] in upper case, padded with `<` to 64 characters.
 */
fun mrzLine(hex: String, sealedAt: Instant): String =
    "IYW<<SEALED<<${MRZ_TIME.format(sealedAt)}<<${hex.take(24).uppercase()}".padEnd(64, '<')

/** Matches a 64-digit lower-case hex fingerprint. The anchors cover the whole input, as in the web build. */
val HEX64 = Regex("^[0-9a-f]{64}\\z")
