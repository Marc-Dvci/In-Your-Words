package app.inyourwords.core

/**
 * The non-leading guard. A follow-up question reaches the witness only if every content word in it is a word the
 * witness already used, and it is an open question. Everything here is deterministic: the model proposes, this
 * module decides.
 */

/** A token of the witness's words and the answer it came from. */
data class WitnessToken(val token: Token, val segment: Int)

/** The witness's own words: one entry per answer, in the order given. */
data class WitnessIndex(
    val segments: List<String>,
    val tokens: List<WitnessToken>,
    val stems: Set<String>,
    val numbers: Set<String>,
    val normalized: String,
)

/** Builds the lookup tables the guard checks a question against. */
fun indexWitness(segments: List<String>): WitnessIndex {
    val tokens = segments.flatMapIndexed { segment, s -> tokenize(s).map { WitnessToken(it, segment) } }
    return WitnessIndex(
        segments = segments,
        tokens = tokens,
        stems = tokens.mapTo(mutableSetOf()) { it.token.stem },
        numbers = tokens.map { it.token.lower }.filter { NUMBER.matches(it) }.toSet(),
        normalized = segments.joinToString(" \u0000 ") { normalize(it) },
    )
}

/** Why a question was refused. Declared in the order the guard reports them. */
enum class Reason(val wire: String) {
    EMPTY("empty"),
    TOO_LONG("too_long"),
    NOT_A_QUESTION("not_a_question"),
    MORE_THAN_ONE_QUESTION("more_than_one_question"),
    CLOSED_FORM("closed_form"),
    EITHER_OR("either_or"),
    FOREIGN_WORDS("foreign_words"),
    QUOTE_NOT_VERBATIM("quote_not_verbatim"),
}

/** A piece of text with its UTF-16 span in the string it came from. */
data class Span(val text: String, val start: Int, val end: Int)

/** Ties a word of the question to the place the witness said it. */
data class Link(val question: Span, val segment: Int, val start: Int, val end: Int)

/** The guard's decision on one question. */
data class GuardResult(
    val ok: Boolean,
    val question: String,
    val reasons: List<Reason>,
    /** Content words of the question the witness never used. */
    val foreign: List<Span>,
    val links: List<Link>,
)

/** The most words a follow-up question may contain. */
const val MAX_WORDS = 32

private val SENTENCE_BREAK = Regex("(?<=[.?!])[$JS_WHITESPACE]+")
private val WHITESPACE_RUN = Regex("[$JS_WHITESPACE]+")
private val QUOTED = Regex("[\"“]([^\"”]+)[\"”]")

/** Where a new clause can start inside a sentence: a comma, semicolon, colon, or dash. */
private val CLAUSE_BREAK = Regex("[,;:–—]|[$JS_WHITESPACE]-[$JS_WHITESPACE]")

private fun sentences(text: String): List<String> =
    SENTENCE_BREAK.split(text).map { jsTrim(it) }.filter { it.isNotEmpty() }

/**
 * Decides whether [question] may reach the witness. Returns every reason it fails, in the order of [Reason], the
 * content words the witness never used, and the links that tie its words to the witness's account.
 */
fun checkQuestion(question: String, witness: WitnessIndex): GuardResult {
    val q = jsTrim(WHITESPACE_RUN.replace(question, " "))
    val tokens = tokenize(q)
    if (tokens.isEmpty()) {
        return GuardResult(ok = false, question = q, reasons = listOf(Reason.EMPTY), foreign = emptyList(), links = emptyList())
    }

    val reasons = mutableSetOf<Reason>()
    if (tokens.size > MAX_WORDS) reasons.add(Reason.TOO_LONG)

    val parts = sentences(q)
    val asks = parts.filter { it.endsWith("?") }
    val last = parts.lastOrNull() ?: ""
    val lastFirst = tokenize(last).firstOrNull()?.lower ?: ""
    if (asks.size > 1 || q.count { it == '?' } > 1) reasons.add(Reason.MORE_THAN_ONE_QUESTION)
    val endsAsk = last.endsWith("?")
    val endsImperative = last.endsWith(".") && lastFirst in IMPERATIVE_OPENERS
    if (!endsAsk && !endsImperative) reasons.add(Reason.NOT_A_QUESTION)
    // A yes-or-no question can open a sentence, a clause after a comma or dash ("You said the car, was it fast?"), or
    // follow a joining word ("And was it fast?").
    for (s in parts.filter { it.endsWith("?") }) {
        for (clause in CLAUSE_BREAK.split(s)) {
            val first = tokenize(clause).firstOrNull { it.lower !in JOINERS }?.lower ?: ""
            if (first in CLOSED_OPENERS) reasons.add(Reason.CLOSED_FORM)
        }
    }
    if (tokens.any { it.lower == "or" }) reasons.add(Reason.EITHER_OR)

    for (m in QUOTED.findAll(q)) {
        if (!witness.normalized.contains(normalize(m.groupValues[1]))) reasons.add(Reason.QUOTE_NOT_VERBATIM)
    }

    val foreign = mutableListOf<Span>()
    for (t in tokens) {
        if (isFreeWord(t.lower)) continue
        val known = if (NUMBER.matches(t.lower)) t.lower in witness.numbers else t.stem in witness.stems
        if (!known) foreign.add(Span(t.text, t.start, t.end))
    }
    if (foreign.isNotEmpty()) reasons.add(Reason.FOREIGN_WORDS)

    val list = Reason.entries.filter { it in reasons }
    return GuardResult(ok = list.isEmpty(), question = q, reasons = list, foreign = foreign, links = phraseLinks(q, tokens, witness))
}

private fun same(a: Token, b: Token): Boolean = if (NUMBER.matches(a.lower)) a.lower == b.lower else a.stem == b.stem

private data class Run(val segment: Int, val index: Int, val length: Int)

/**
 * Links each run of the witness's words in the question to the longest matching run in the witness's account, so
 * "dark estate car came round" points at the one place it was said. Runs start and end on content words. Among
 * equally long runs, the most recent answer wins, and within it the first mention.
 */
private fun phraseLinks(q: String, tokens: List<Token>, witness: WitnessIndex): List<Link> {
    val links = mutableListOf<Link>()
    val bySegment = witness.segments.indices.map { s -> witness.tokens.filter { it.segment == s }.map { it.token } }
    var i = 0
    while (i < tokens.size) {
        val t = tokens[i]
        if (isFreeWord(t.lower)) {
            i++
            continue
        }
        var best: Run? = null
        for (s in bySegment.indices.reversed()) {
            val seg = bySegment[s]
            for (j in seg.indices) {
                if (!same(t, seg[j])) continue
                var k = 1
                while (i + k < tokens.size && j + k < seg.size && same(tokens[i + k], seg[j + k])) k++
                while (k > 1 && isFreeWord(tokens[i + k - 1].lower)) k--
                if (best == null || k > best.length) best = Run(s, j, k)
            }
        }
        val run = best
        if (run == null) {
            i++
            continue
        }
        val seg = bySegment[run.segment]
        val qEnd = tokens[i + run.length - 1].end
        links.add(
            Link(
                question = Span(q.substring(t.start, qEnd), t.start, qEnd),
                segment = run.segment,
                start = seg[run.index].start,
                end = seg[run.index + run.length - 1].end,
            ),
        )
        i += run.length
    }
    return links
}

/** One plain sentence for each reason a question was refused, shown to the witness. */
val REASON_TEXT: Map<Reason, String> = mapOf(
    Reason.EMPTY to "empty",
    Reason.TOO_LONG to "too long",
    Reason.NOT_A_QUESTION to "not a question",
    Reason.MORE_THAN_ONE_QUESTION to "more than one question at once",
    Reason.CLOSED_FORM to "a yes-or-no question",
    Reason.EITHER_OR to "offers a choice between options",
    Reason.FOREIGN_WORDS to "uses words you never said",
    Reason.QUOTE_NOT_VERBATIM to "quotes words you never said",
)
