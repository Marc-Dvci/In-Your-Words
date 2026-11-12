package app.inyourwords.core

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import java.io.File

/**
 * Finds a file in the shared spec/vectors folder. Gradle runs unit tests in android/app, so the folder is normally two
 * levels up; the search walks further up if the layout differs.
 */
internal fun vectorFile(name: String): File {
    val direct = File("../../spec/vectors/$name")
    if (direct.isFile) return direct
    var dir: File? = File("").absoluteFile
    while (dir != null) {
        val candidate = File(dir, "spec/vectors/$name")
        if (candidate.isFile) return candidate
        dir = dir.parentFile
    }
    error("spec/vectors/$name not found above ${File("").absoluteFile}")
}

internal fun JSONArray.strings(): List<String> = (0 until length()).map { getString(it) }

internal fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }

/** One shared guard case: a question and the decision the TypeScript guard reached for it. */
data class GuardCase(
    val question: String,
    val ok: Boolean,
    val reasons: List<String>,
    val foreign: List<String>,
    val links: List<Pair<String, String>>,
)

@RunWith(Parameterized::class)
class GuardVectorsTest(
    @Suppress("unused") private val question: String,
    private val case: GuardCase,
) {
    @Test
    fun matchesTheSharedVector() {
        val g = checkQuestion(case.question, witness)
        assertEquals("ok", case.ok, g.ok)
        assertEquals("reasons", case.reasons, g.reasons.map { it.wire })
        assertEquals("foreign", case.foreign, g.foreign.map { it.text })
        assertEquals(
            "links",
            case.links,
            g.links.map { it.question.text to witness.segments[it.segment].substring(it.start, it.end) },
        )
    }

    companion object {
        private val fixture: JSONObject = JSONObject(vectorFile("guard.json").readText())

        private val witness: WitnessIndex = indexWitness(fixture.getJSONArray("witness").strings())

        private fun JSONObject.toGuardCase(): GuardCase = GuardCase(
            question = getString("question"),
            ok = getBoolean("ok"),
            reasons = getJSONArray("reasons").strings(),
            foreign = getJSONArray("foreign").strings(),
            links = optJSONArray("links")?.let { arr ->
                (0 until arr.length()).map { i ->
                    val pair = arr.getJSONArray(i)
                    pair.getString(0) to pair.getString(1)
                }
            } ?: emptyList(),
        )

        @JvmStatic
        @Parameterized.Parameters(name = "{index}: {0}")
        fun cases(): List<Array<Any>> = fixture.getJSONArray("cases").objects().map { c ->
            val case = c.toGuardCase()
            arrayOf(case.question, case)
        }
    }
}
