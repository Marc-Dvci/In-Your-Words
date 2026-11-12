package app.inyourwords.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class SealVectorsTest {
    private val fixture = JSONObject(vectorFile("seal.json").readText())

    private val account: SealedAccount = fixture.getJSONObject("account").toSealedAccount()

    @Test
    fun rebuiltAccountMatchesItsVersion() {
        assertEquals(fixture.getJSONObject("account").getInt("v"), account.v)
    }

    @Test
    fun canonicalJsonMatchesTheSharedVector() {
        assertEquals(fixture.getString("canonical"), canonicalJson(account))
    }

    @Test
    fun sha256MatchesTheSharedVector() {
        assertEquals(fixture.getString("sha256"), fingerprint(account))
    }

    @Test
    fun rosetteMatchesTheSharedVector() {
        val expected = fixture.getJSONArray("rosette").objects()
        val actual = rosette(fingerprint(account))
        assertEquals(expected.size, actual.size)
        for ((e, a) in expected.zip(actual)) {
            assertEquals(e.getInt("R"), a.R)
            assertEquals(e.getInt("r"), a.r)
            assertEquals(e.getInt("turns"), a.turns)
            assertEquals(e.getDouble("d"), a.d, 1e-9)
            assertEquals(e.getDouble("extent"), a.extent, 1e-9)
        }
    }

    @Test
    fun sha256OfAbcIsThePublishedVector() {
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", sha256Hex("abc"))
    }

    @Test
    fun canonicalJsonEscapesStringsLikeJavaScript() {
        assertEquals("\"a\\u0001b\\n\\\"\\\\\\t\\b\\f\\r\"", jsonString("a\u0001b\n\"\\\t\b\u000C\r"))
        assertEquals("\"\\ud800\u00E9\u2028\"", jsonString("\uD800\u00E9\u2028"))
        assertEquals("\"😀\"", jsonString("😀"))
    }

    @Test
    fun groupsTheFingerprintInFoursAndFourToALine() {
        val lines = groupHex("0123456789abcdef".repeat(4))
        assertEquals(4, lines.size)
        assertEquals("0123 4567 89ab cdef", lines[0])
    }

    @Test
    fun writesTheMachineReadableLine() {
        val line = mrzLine("77d773b85deb".padEnd(64, '0'), Instant.parse("2026-11-12T18:58:07.412Z"))
        assertEquals(64, line.length)
        assertTrue(line.startsWith("IYW<<SEALED<<20261112T185807Z<<77D773B85DEB"))
    }

    @Test
    fun recognisesOnlyLowerCaseSixtyFourDigitHex() {
        assertTrue(HEX64.containsMatchIn("77d773b85debb99a138ad4a762bb99f34824e067d7099d940e121b936b4fe54f"))
        assertFalse(HEX64.containsMatchIn("77D773B85DEBB99A138AD4A762BB99F34824E067D7099D940E121B936B4FE54F"))
        assertFalse(HEX64.containsMatchIn("77d773b85debb99a138ad4a762bb99f34824e067d7099d940e121b936b4fe54f\n"))
    }

    private fun JSONObject.toSealedAccount(): SealedAccount = SealedAccount(
        startedAt = getString("startedAt"),
        mode = Mode.fromWire(getString("mode")),
        phases = getJSONArray("phases").objects().map { phase ->
            SealedPhase(
                id = PhaseId.fromWire(phase.getString("id")),
                turns = phase.getJSONArray("turns").objects().map { turn ->
                    SealedTurn(
                        question = turn.getString("question"),
                        source = PromptSource.fromWire(turn.getString("source")),
                        answer = turn.getString("answer"),
                    )
                },
            )
        },
    )
}
