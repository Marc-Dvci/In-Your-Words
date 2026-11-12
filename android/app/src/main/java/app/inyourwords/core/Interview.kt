package app.inyourwords.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * The interview script and its state. Openings are fixed text in the order of the Self-Administered Interview.
 * Follow-ups are proposed by a model, checked by the guard, and replaced by a template when refused.
 */

/** The identifier of one phase of the interview. */
enum class PhaseId(val wire: String) {
    EVENT("event"),
    PEOPLE("people"),
    VEHICLES("vehicles"),
    SEQUENCE("sequence"),
    SURROUNDINGS("surroundings");

    companion object {
        /** Returns the phase whose wire name is [wire]. */
        fun fromWire(wire: String): PhaseId = entries.first { it.wire == wire }
    }
}

/** One phase of the interview: its identifier, its heading, and its fixed opening question. */
data class Phase(val id: PhaseId, val title: String, val opening: String)

/** The five phases, in the order of the Self-Administered Interview. */
val PHASES: List<Phase> = listOf(
    Phase(
        id = PhaseId.EVENT,
        title = "What happened",
        opening = "In your own words, tell me everything you remember about what happened. Include every detail, even ones that seem small or unimportant.",
    ),
    Phase(
        id = PhaseId.PEOPLE,
        title = "People",
        opening = "Tell me about each person you saw. Describe them in as much detail as you can.",
    ),
    Phase(
        id = PhaseId.VEHICLES,
        title = "Vehicles",
        opening = "Tell me about any vehicle you saw. Describe it in as much detail as you can.",
    ),
    Phase(
        id = PhaseId.SEQUENCE,
        title = "Order of events",
        opening = "Now go through what happened in a different order: start from the end, and work back to the beginning.",
    ),
    Phase(
        id = PhaseId.SURROUNDINGS,
        title = "Surroundings",
        opening = "Picture the place again. Tell me where you were, what you could see and hear around you, and anyone else who was there.",
    ),
)

/** Where a prompt's text came from. */
enum class PromptSource(val wire: String) {
    SCRIPT("script"),
    ON_DEVICE("on_device"),
    IN_CLOUD("in_cloud"),
    TEMPLATE("template");

    companion object {
        /** Returns the source whose wire name is [wire]. */
        fun fromWire(wire: String): PromptSource = entries.first { it.wire == wire }
    }
}

/** Whether a prompt opens a phase or follows up an answer. */
enum class PromptKind(val wire: String) {
    OPENING("opening"),
    FOLLOWUP("followup"),
}

/** A candidate question the guard refused, with the reasons and the words it used that the witness never said. */
data class Rejected(val question: String, val reasons: List<Reason>, val foreign: List<String>)

/** A question shown to the witness, with the links that tie its words to the witness's account. */
data class Prompt(
    val text: String,
    val kind: PromptKind,
    val source: PromptSource,
    val links: List<Link>,
    val rejected: List<Rejected>,
)

/** One question and the answer the witness gave to it. */
data class Turn(val prompt: Prompt, val answer: String)

/** The questions and answers of one phase, in order. */
data class PhaseState(val id: PhaseId, val turns: List<Turn>)

/** How questions are written for this interview, chosen with the witness before it starts. */
enum class Mode(val wire: String) {
    ON_DEVICE("on_device"),
    CLOUD("cloud"),
    TEMPLATES("templates");

    companion object {
        /** Returns the mode whose wire name is [wire]. */
        fun fromWire(wire: String): Mode = entries.first { it.wire == wire }
    }
}

/** One interview in progress. Every change returns a new session. */
data class Session(val startedAt: String, val mode: Mode, val phases: List<PhaseState>) {
    /** The version of the session format. */
    val v: Int = 1
}

/** The most follow-up questions the interview asks in one phase. */
const val MAX_FOLLOWUPS = 2

/** Starts an interview in the first phase, showing its fixed opening question and no answer yet. */
fun newSession(mode: Mode, startedAt: String): Session = Session(
    startedAt = startedAt,
    mode = mode,
    phases = listOf(PhaseState(PhaseId.EVENT, listOf(Turn(opening(PhaseId.EVENT), "")))),
)

/** The fixed opening question of the phase [id], written by the script and never by a model. */
fun opening(id: PhaseId): Prompt {
    val phase = PHASES.first { it.id == id }
    return Prompt(text = phase.opening, kind = PromptKind.OPENING, source = PromptSource.SCRIPT, links = emptyList(), rejected = emptyList())
}

/** Every answer the witness has given, in order. Questions are never part of the witness's words. */
fun witnessSegments(session: Session): List<String> =
    session.phases.flatMap { p -> p.turns.map { it.answer } }.filter { jsTrim(it).isNotEmpty() }

/** The phase the interview is in now. */
fun currentPhase(session: Session): PhaseState = session.phases.last()

/** The question the witness is answering now. */
fun currentTurn(session: Session): Turn = currentPhase(session).turns.last()

/** The position of the current phase in [PHASES]. */
fun phaseIndex(session: Session): Int = PHASES.indexOfFirst { it.id == currentPhase(session).id }

/**
 * Whether the current phase may still ask a follow-up about the last answer: the answer has at least four words,
 * and the phase has asked fewer than [max] follow-ups.
 */
fun wantsFollowup(session: Session, max: Int = MAX_FOLLOWUPS): Boolean {
    val phase = currentPhase(session)
    val last = phase.turns.last()
    val followups = phase.turns.count { it.prompt.kind == PromptKind.FOLLOWUP }
    return jsTrim(last.answer).isNotEmpty() && followups < max && tokenize(last.answer).size >= 4
}

private fun Session.withCurrentPhase(phase: PhaseState): Session = copy(phases = phases.dropLast(1) + phase)

/** Records the witness's answer to the current question, with surrounding white space removed. */
fun answer(session: Session, text: String): Session {
    val phase = currentPhase(session)
    val turn = currentTurn(session).copy(answer = jsTrim(text))
    return session.withCurrentPhase(phase.copy(turns = phase.turns.dropLast(1) + turn))
}

/** Adds [prompt] to the current phase as a new question with no answer yet. */
fun ask(session: Session, prompt: Prompt): Session {
    val phase = currentPhase(session)
    return session.withCurrentPhase(phase.copy(turns = phase.turns + Turn(prompt, "")))
}

/**
 * Moves to the next phase, dropping any follow-up the witness left unanswered. Returns null after the last phase.
 */
fun nextPhase(session: Session): Session? {
    val next = PHASES.getOrNull(phaseIndex(session) + 1) ?: return null
    val kept = session.phases.map { p ->
        p.copy(turns = p.turns.filter { jsTrim(it.answer).isNotEmpty() || it.prompt.kind == PromptKind.OPENING })
    }
    return session.copy(phases = kept + PhaseState(next.id, listOf(Turn(opening(next.id), ""))))
}

// ---------- follow-up generation ----------

/** The JSON a model returns for one follow-up. */
data class Proposal(val anchor: String, val question: String)

/** The response schema the model is asked to follow for one follow-up. */
val PROPOSAL_SCHEMA: JsonObject = buildJsonObject {
    put("type", "object")
    putJsonObject("properties") {
        putJsonObject("anchor") {
            put("type", "string")
            put("description", "A phrase of 1 to 6 words copied exactly from the witness's words.")
        }
        putJsonObject("question") {
            put("type", "string")
            put("description", "One open question about the anchor, using only the witness's words.")
        }
    }
    putJsonArray("required") {
        add(JsonPrimitive("anchor"))
        add(JsonPrimitive("question"))
    }
}

/** The instructions a model follows when it proposes a follow-up question. */
val SYSTEM_PROMPT: String = """
    You help a witness recall an event, following the cognitive interview.
    Write ONE open follow-up question about something the witness said.
    Rules:
    - Choose an "anchor": a phrase of 1 to 6 words copied exactly from the witness's words.
    - The question may use only words the witness already used, plus words like: you, said, tell, me, everything, remember, describe, about, more, else, what.
    - Never add a new detail, colour, object, number, name or place.
    - Never ask a yes-or-no question. Never offer options joined by "or".
    - Prefer the form: You said <anchor>. Tell me everything you remember about it.
    Return JSON: {"anchor": "...", "question": "..."}.
    """.trimIndent()

/** The message that asks a model for the next follow-up, with the witness's words and the questions already asked. */
fun followupPrompt(session: Session): String {
    val phase = PHASES.first { it.id == currentPhase(session).id }
    val all = witnessSegments(session)
    val last = currentTurn(session).answer
    val asked = session.phases.flatMap { p -> p.turns.map { it.prompt.text } }
    return listOf(
        "Topic of this part of the interview: ${phase.title}.",
        "Everything the witness has said so far:\n\"\"\"\n${all.joinToString("\n")}\n\"\"\"",
        "The witness's last answer:\n\"\"\"\n$last\n\"\"\"",
        "Questions already asked (do not repeat them):\n${asked.joinToString("\n") { "- $it" }}",
        "Write the follow-up question about the last answer.",
    ).joinToString("\n\n")
}

private val JSON_OBJECT = Regex("\\{[\\s\\S]*\\}")

private fun JsonObject.stringField(name: String): String? =
    (this[name] as? JsonPrimitive)?.takeIf { it.isString }?.content

/**
 * Whether [json] holds a character that JSON.parse refuses: a control character inside a string, or one outside a
 * string that is not JSON white space (space, tab, line feed, carriage return).
 */
private fun hasRawControlCharacter(json: String): Boolean {
    var inString = false
    var i = 0
    while (i < json.length) {
        val c = json[i]
        if (inString) {
            when {
                c == '\\' -> {
                    if (i + 1 < json.length && json[i + 1] < ' ') return true
                    i++
                }
                c == '"' -> inString = false
                c < ' ' -> return true
            }
        } else if (c == '"') {
            inString = true
        } else if (c < ' ' && c != '\t' && c != '\n' && c != '\r') {
            return true
        }
        i++
    }
    return false
}

/**
 * Reads the first JSON object in a model's reply. Returns null when the reply has no object, when the object is not
 * valid JSON, or when its anchor or question is missing or not a string. Both fields come back trimmed.
 */
fun parseProposal(raw: String): Proposal? {
    val match = JSON_OBJECT.find(raw) ?: return null
    if (hasRawControlCharacter(match.value)) return null
    val parsed = try {
        Json.parseToJsonElement(match.value)
    } catch (e: IllegalArgumentException) {
        return null
    }
    val obj = parsed as? JsonObject ?: return null
    val anchor = obj.stringField("anchor") ?: return null
    val question = obj.stringField("question") ?: return null
    return Proposal(anchor = jsTrim(anchor), question = jsTrim(question))
}

/** The fixed question that reuses an anchor the witness said word for word. */
fun anchorTemplate(anchor: String): String = "You said “$anchor”. Tell me everything you remember about that."

/** The fixed question used when no proposal can be shown. */
const val GENERIC_TEMPLATE = "What else do you remember about this part?"

/** The prompt a witness sees, and the guard result that accepted it, if any. */
data class Decision(val prompt: Prompt, val guard: GuardResult?)

private val ANCHOR_QUOTES = Regex("^[\"“]|[\"”]\\z")

/**
 * Turns a model proposal into the prompt the witness sees. The proposal is shown only if the guard accepts it.
 * Otherwise its anchor is reused in a fixed template when the anchor is the witness's exact words, and the generic
 * template is used when it is not. Every refused candidate is kept, so the screen can show what was checked.
 */
fun decide(session: Session, proposal: Proposal?, source: PromptSource): Decision {
    require(source == PromptSource.ON_DEVICE || source == PromptSource.IN_CLOUD) {
        "a proposal comes from on_device or in_cloud, not ${source.wire}"
    }
    val witness = indexWitness(witnessSegments(session))
    val rejected = mutableListOf<Rejected>()
    if (proposal != null) {
        val g = checkQuestion(proposal.question, witness)
        if (g.ok) {
            return Decision(Prompt(g.question, PromptKind.FOLLOWUP, source, g.links, rejected.toList()), g)
        }
        rejected.add(Rejected(g.question, g.reasons, g.foreign.map { it.text }))
        val anchor = jsTrim(ANCHOR_QUOTES.replace(proposal.anchor, ""))
        val words = tokenize(anchor).size
        if (words in 1..6 && witness.normalized.contains(normalize(anchor))) {
            val t = checkQuestion(anchorTemplate(anchor), witness)
            if (t.ok) {
                return Decision(Prompt(t.question, PromptKind.FOLLOWUP, PromptSource.TEMPLATE, t.links, rejected.toList()), t)
            }
        }
    }
    return Decision(Prompt(GENERIC_TEMPLATE, PromptKind.FOLLOWUP, PromptSource.TEMPLATE, emptyList(), rejected.toList()), null)
}
