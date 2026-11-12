package app.inyourwords.core

/**
 * A word of text and its place in the string it came from.
 *
 * [start] and [end] are UTF-16 indices, the same indices the TypeScript build reports.
 */
data class Token(
    /** The token exactly as written. */
    val text: String,
    /** Lower case, with typographic apostrophes folded to ASCII. */
    val lower: String,
    /** The token with its inflections folded, as [stem] returns it. */
    val stem: String,
    val start: Int,
    val end: Int,
)

/** The characters JavaScript's `\s` matches, written as the body of a Java regular expression character class. */
internal const val JS_WHITESPACE =
    "\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF"

private const val VOWELS = "aeiouy"

private val WORD = Regex("[\\p{L}\\p{N}]+(?:['’][\\p{L}]+)*")
private val WHITESPACE_RUN = Regex("[$JS_WHITESPACE]+")
private val POSSESSIVE = Regex("'s\\z")
private val PLURAL_POSSESSIVE = Regex("s'\\z")
private val SIBILANT_ES = Regex("(ch|sh|x|z|ss)es\\z")
private val UNSTRESSED_S = Regex("(ss|us|is|ous)\\z")

internal val NUMBER = Regex("\\p{N}+")

/** Whether [cp] is a cased letter in the sense of the Unicode `Cased` property. */
private fun isCased(cp: Int): Boolean =
    Character.isLowerCase(cp) || Character.isUpperCase(cp) || Character.isTitleCase(cp)

/** Whether [cp] is case-ignorable in the sense of the Unicode `Case_Ignorable` property, approximated from its categories. */
private fun isCaseIgnorable(cp: Int): Boolean = when (Character.getType(cp)) {
    Character.NON_SPACING_MARK.toInt(), Character.ENCLOSING_MARK.toInt(), Character.FORMAT.toInt(),
    Character.MODIFIER_LETTER.toInt(), Character.MODIFIER_SYMBOL.toInt() -> true
    else -> cp in CASE_IGNORABLE_PUNCTUATION
}

private val CASE_IGNORABLE_PUNCTUATION = setOf(
    0x27, 0x2E, 0x3A, 0xB7, 0x387, 0x55F, 0x5F4, 0x2018, 0x2019, 0x2024, 0x2027, 0xFE13, 0xFE52, 0xFE55, 0xFF07, 0xFF0E, 0xFF1A,
)

/** Whether the capital sigma at [index] is word-final, by the Unicode `Final_Sigma` condition. */
private fun isFinalSigma(text: String, index: Int): Boolean {
    var p = index
    var precededByCased = false
    while (p > 0) {
        val cp = text.codePointBefore(p)
        p -= Character.charCount(cp)
        if (isCaseIgnorable(cp)) continue
        precededByCased = isCased(cp)
        break
    }
    if (!precededByCased) return false
    var q = index + 1
    while (q < text.length) {
        val cp = text.codePointAt(q)
        q += Character.charCount(cp)
        if (isCaseIgnorable(cp)) continue
        return !isCased(cp)
    }
    return true
}

/**
 * Lower-cases [text] exactly as JavaScript's `toLowerCase` does: the simple case mapping, the dotted capital I, and the
 * final-sigma rule. Java's own `lowercase` applies the final-sigma rule differently, so it is not used here.
 */
internal fun jsLowercase(text: String): String {
    val out = StringBuilder(text.length)
    var i = 0
    while (i < text.length) {
        val cp = text.codePointAt(i)
        when (cp) {
            0x130 -> out.append("i̇")
            0x3A3 -> out.appendCodePoint(if (isFinalSigma(text, i)) 0x3C2 else 0x3C3)
            else -> out.appendCodePoint(Character.toLowerCase(cp))
        }
        i += Character.charCount(cp)
    }
    return out.toString()
}

/** Splits [text] into words, each with its lower-case form, its stem, and its UTF-16 span. */
fun tokenize(text: String): List<Token> =
    WORD.findAll(text).map { match ->
        val raw = match.value
        val lower = jsLowercase(raw).replace('’', '\'')
        val start = match.range.first
        Token(text = raw, lower = lower, stem = stem(lower), start = start, end = start + raw.length)
    }.toList()

private fun undouble(w: String): String {
    val n = w.length
    val doubled = n >= 3 && w[n - 1] == w[n - 2] && "lsz".indexOf(w[n - 1]) < 0 && w[n - 1] !in VOWELS
    return if (doubled) w.dropLast(1) else w
}

private fun hasVowel(s: String): Boolean = s.any { it in VOWELS }

/** Folds the inflections of an English word (plural, possessive, -ing, -ed), so that forms of one word share a stem. */
fun stem(word: String): String {
    var w = jsLowercase(word).replace('’', '\'')
    if (NUMBER.matches(w)) return w
    w = w.replace(POSSESSIVE, "").replace(PLURAL_POSSESSIVE, "s")
    if (w.length <= 3) return w
    return when {
        w.endsWith("ies") && w.length > 4 -> w.dropLast(3) + "y"
        w.endsWith("sses") -> w.dropLast(2)
        w.endsWith("ing") && w.length >= 6 && hasVowel(w.dropLast(3)) -> undouble(w.dropLast(3))
        w.endsWith("ied") && w.length > 4 -> w.dropLast(3) + "y"
        w.endsWith("ed") && !w.endsWith("eed") && w.length >= 5 && hasVowel(w.dropLast(2)) -> undouble(w.dropLast(2))
        w.endsWith("es") && SIBILANT_ES.containsMatchIn(w) -> w.dropLast(2)
        w.endsWith("s") && !UNSTRESSED_S.containsMatchIn(w) -> w.dropLast(1)
        else -> w
    }
}

/** Collapses runs of white space, trims, and folds typographic quotes, so that quotes compare verbatim. */
fun normalize(text: String): String {
    val folded = text
        .replace('‘', '\'')
        .replace('’', '\'')
        .replace('“', '"')
        .replace('”', '"')
    return jsLowercase(jsTrim(WHITESPACE_RUN.replace(folded, " ")))
}

/**
 * Splits [text] into pieces of up to four characters, as `text.match(/.{1,4}/g)` does in JavaScript. A line terminator
 * is not matched by `.`, so it ends a run and is left out of every piece.
 */
internal fun chunksOfFour(text: String): List<String> =
    text.split('\n', '\r', ' ', ' ').flatMap { it.chunked(4) }

/** Whether [c] is a character JavaScript's `String.prototype.trim` removes. */
internal fun isJsSpace(c: Char): Boolean = when (c) {
    '\t', '\n', '\u000B', '\u000C', '\r', ' ', ' ', ' ', ' ', ' ', ' ', ' ', '　', '﻿' -> true
    else -> c in ' '..' '
}

/** Removes leading and trailing white space exactly as JavaScript's `trim` does. */
internal fun jsTrim(text: String): String = text.trim(::isJsSpace)

/**
 * The UTF-8 bytes of [text]. Each unpaired surrogate becomes U+FFFD first, as `TextEncoder` writes it.
 */
internal fun utf8Bytes(text: String): ByteArray {
    val out = StringBuilder(text.length)
    var i = 0
    while (i < text.length) {
        val c = text[i]
        if (c.isHighSurrogate() && i + 1 < text.length && text[i + 1].isLowSurrogate()) {
            out.append(c).append(text[i + 1])
            i += 2
            continue
        }
        out.append(if (c.isSurrogate()) '�' else c)
        i++
    }
    return out.toString().toByteArray(Charsets.UTF_8)
}
