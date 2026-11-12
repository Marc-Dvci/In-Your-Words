package app.inyourwords.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import javax.crypto.AEADBadTagException

class HandoverVectorsTest {
    private val fixture = JSONObject(vectorFile("handover.json").readText())

    private val code: String = fixture.getString("code")

    private val box = Sealed(iv = fixture.getString("iv"), ct = fixture.getString("ct"))

    @Test
    fun recordIdMatchesTheSharedVector() {
        assertEquals(fixture.getString("recordId"), recordId(code))
    }

    @Test
    fun decryptsTheSharedVector() {
        assertEquals(fixture.getString("plain"), decrypt(code, box))
    }

    @Test
    fun opensWhatItSealed() {
        val plain = fixture.getString("plain")
        assertEquals(plain, decrypt(code, encrypt(code, plain)))
    }

    @Test
    fun drawsAFreshNonceForEachSeal() {
        assertNotEquals(encrypt(code, "same words").iv, encrypt(code, "same words").iv)
    }

    @Test(expected = AEADBadTagException::class)
    fun refusesTheWrongCode() {
        decrypt("0123456789ABCDEFGHJM", box)
    }

    @Test
    fun keepsTheWordsOutOfTheCiphertext() {
        assertFalse(encrypt(code, fixture.getString("plain")).ct.contains("sticker"))
    }

    @Test
    fun hasTwentyCrockfordCharacters() {
        assertTrue(Regex("[0-9A-HJKMNP-TV-Z]{$CODE_CHARS}").matches(newCode()))
    }

    @Test
    fun mapsRandomBytesThroughTheAlphabet() {
        assertEquals("0123456789ABCDEFGHJK", newCode { n -> ByteArray(n) { (it % 32).toByte() } })
        assertEquals("ZZZZZZZZZZZZZZZZZZZZ", newCode { n -> ByteArray(n) { 0xFF.toByte() } })
    }

    @Test
    fun formatsACodeInGroupsOfFour() {
        assertEquals("0123-4567-89AB-CDEF-GHJK", formatCode("0123456789ABCDEFGHJK"))
    }

    @Test
    fun readsWhatAPersonTypes() {
        val code = "0123456789ABCDEFGHJK"
        assertEquals(code, cleanCode(formatCode(code).lowercase()))
        assertEquals(code, cleanCode("o123 4567 89ab cdef ghjk"))
        assertEquals("1123456789ABCDEFGHJK", cleanCode("I123456789ABCDEFGHJK"))
        assertNull(cleanCode("too short"))
        assertNull(cleanCode("0123456789ABCDEFGHJU"))
    }

    @Test
    fun derivesTheSameRecordIdFromTheSameCode() {
        val id = recordId("0123456789ABCDEFGHJK")
        assertTrue(Regex("[0-9a-f]{32}").matches(id))
        assertEquals(id, recordId("0123456789ABCDEFGHJK"))
        assertNotEquals(id, recordId("0123456789ABCDEFGHJM"))
    }
}
