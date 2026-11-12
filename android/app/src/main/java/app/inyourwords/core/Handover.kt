package app.inyourwords.core

import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Continue on another device. The account travels encrypted: the first device draws a 100-bit code, derives a
 * record id and an AES-GCM key from it with HKDF-SHA-256, and stores only ciphertext. The witness types the code on
 * the second device, which derives the same id and key. The server never sees the code or the words.
 */

/** Crockford base32: digits and letters with I, L, O and U left out. */
const val ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

/** The number of characters in a handover code. */
const val CODE_CHARS = 20

private val secureRandom = SecureRandom()
private val HANDOVER_SALT = utf8Bytes("in-your-words/handover/v1")
private const val IV_BYTES = 12
private const val TAG_BITS = 128
private val SEPARATORS = Regex("[$JS_WHITESPACE-]")

/**
 * Draws a new handover code of [CODE_CHARS] characters. [random] supplies the bytes; the default uses [SecureRandom].
 */
fun newCode(random: (Int) -> ByteArray = { n -> ByteArray(n).also(secureRandom::nextBytes) }): String =
    random(CODE_CHARS).joinToString("") { ALPHABET[(it.toInt() and 0xFF) % 32].toString() }

/**
 * Normalizes what a person typed: case, spaces, dashes, and the letters Crockford reads as digits. Returns null when
 * the result is not a complete code.
 */
fun cleanCode(typed: String): String? {
    val c = typed
        .uppercase()
        .replace(SEPARATORS, "")
        .replace('I', '1')
        .replace('L', '1')
        .replace('O', '0')
    if (c.length != CODE_CHARS || c.any { it !in ALPHABET }) return null
    return c
}

/** Groups a code in fours, separated by dashes, for display. */
fun formatCode(code: String): String {
    require(code.isNotEmpty()) { "a code must not be empty" }
    return chunksOfFour(code).joinToString("-")
}

private fun hmacSha256(key: ByteArray, data: ByteArray): ByteArray =
    Mac.getInstance("HmacSHA256").run {
        init(SecretKeySpec(key, "HmacSHA256"))
        doFinal(data)
    }

/** HKDF with SHA-256 (RFC 5869), as WebCrypto's `deriveBits` computes it. */
private fun hkdfSha256(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int): ByteArray {
    val prk = hmacSha256(salt, ikm)
    val out = ByteArray(length)
    var block = ByteArray(0)
    var offset = 0
    var counter = 1
    while (offset < length) {
        block = hmacSha256(prk, block + info + byteArrayOf(counter.toByte()))
        val n = minOf(block.size, length - offset)
        block.copyInto(out, offset, 0, n)
        offset += n
        counter++
    }
    return out
}

private fun derive(code: String, info: String, length: Int): ByteArray =
    hkdfSha256(utf8Bytes(code), HANDOVER_SALT, utf8Bytes(info), length)

/** The record id of [code]: 16 bytes derived with HKDF, as 32 lower-case hex digits. */
fun recordId(code: String): String = derive(code, "record-id", 16).toHex()

private fun aesKey(code: String): SecretKeySpec = SecretKeySpec(derive(code, "aes-gcm-key", 32), "AES")

private fun base64(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)

/** A ciphertext and its nonce, both in standard Base64. The authentication tag is the last 16 bytes of [ct]. */
data class Sealed(val iv: String, val ct: String)

/** Encrypts [plain] under the key of [code], with a fresh 12-byte nonce. */
fun encrypt(code: String, plain: String): Sealed {
    val iv = ByteArray(IV_BYTES).also(secureRandom::nextBytes)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, aesKey(code), GCMParameterSpec(TAG_BITS, iv))
    return Sealed(iv = base64(iv), ct = base64(cipher.doFinal(utf8Bytes(plain))))
}

/** Decrypts [box] under the key of [code]. Throws when the code is wrong or the ciphertext was changed. */
fun decrypt(code: String, box: Sealed): String {
    val decoder = Base64.getDecoder()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, aesKey(code), GCMParameterSpec(TAG_BITS, decoder.decode(box.iv)))
    return String(cipher.doFinal(decoder.decode(box.ct)), Charsets.UTF_8)
}
