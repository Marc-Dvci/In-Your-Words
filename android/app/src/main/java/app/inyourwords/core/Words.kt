package app.inyourwords.core

/**
 * The only words a follow-up question may use without the witness having said them first.
 *
 * FUNCTION_WORDS are closed-class English words: articles, pronouns, prepositions, conjunctions, auxiliaries and
 * determiners. They carry grammar, not facts. SCAFFOLD_WORDS are the interviewer's own verbs and nouns for asking
 * an open question ("tell me", "describe", "remember"). Neither list names a person, object, colour, number, place,
 * time or action from an incident. Every word added here is a word the model may introduce, so the lists stay short.
 */

private fun wordSet(list: String): Set<String> = list.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.toSet()

/** Closed-class English words that carry grammar rather than facts. */
val FUNCTION_WORDS: Set<String> = wordSet(
    """
    a an the this that these those there here it its it's
    i me my mine myself you your yours yourself he him his himself she her hers herself we us our ours they them their theirs
    one ones someone something anyone anything everyone everything nobody nothing
    of in on at by for with without from to into onto over under above below between among through across along around
    about after before during until since towards toward near off out up down upon within beside behind against
    and or but nor so yet if then than as because while when where who whom whose which what how why whether
    is am are was were be been being do does did done have has had having
    can could will would shall should may might must
    not no any some all each every other another such same own more most
    just still also too very really even only again ever
    'd 'll 're 's 've
    s d ll re ve m t
    """,
)

/** The interviewer's own verbs and nouns for asking an open question. */
val SCAFFOLD_WORDS: Set<String> = wordSet(
    """
    tell describe talk remember recall say said says mention mentioned mentions describe described
    explain everything anything else detail details part moment
    see saw seen hear heard notice noticed
    happen happened happening
    let please take time way words own like go
    """,
)

/** Auxiliaries and modals that open a yes-or-no question when they lead a sentence. */
val CLOSED_OPENERS: Set<String> = wordSet(
    """
    is isn't am are aren't was wasn't were weren't do don't does doesn't did didn't
    have haven't has hasn't had hadn't can can't cannot could couldn't will won't would wouldn't
    shall should shouldn't may might must
    """,
)

/** Imperatives that may open a statement-form prompt ending in a full stop instead of a question mark. */
val IMPERATIVE_OPENERS: Set<String> = setOf("tell", "describe", "talk", "take", "explain", "go")

/** Whether [lower] is a word a follow-up question may use without the witness having said it. */
fun isFreeWord(lower: String): Boolean = lower in FUNCTION_WORDS || lower in SCAFFOLD_WORDS
