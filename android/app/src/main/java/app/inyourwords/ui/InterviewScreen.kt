package app.inyourwords.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Text
import androidx.compose.foundation.background
import app.inyourwords.core.Link
import app.inyourwords.core.Prompt
import app.inyourwords.core.REASON_TEXT
import app.inyourwords.core.Rejected

/** Where each piece sits on screen, so the link lines can be drawn between real glyphs. */
class Geometry {
    var root: LayoutCoordinates? = null
    val segments = mutableStateMapOf<Int, Pair<LayoutCoordinates, TextLayoutResult>>()
    var accountBottom by mutableStateOf<Float?>(null)
    var question by mutableStateOf<Pair<LayoutCoordinates, TextLayoutResult>?>(null)
}

private fun merged(links: List<Link>, segment: Int): List<IntRange> =
    links.filter { it.segment == segment }.map { it.start until it.end }.sortedBy { it.first }
        .fold(mutableListOf()) { acc, r ->
            val last = acc.lastOrNull()
            if (last != null && r.first <= last.last + 1) acc[acc.size - 1] = last.first..maxOf(last.last, r.last) else acc.add(r)
            acc
        }

@Composable
fun Account(segments: List<String>, links: List<Link>, geo: Geometry) {
    Column(Modifier.onGloballyPositioned { c -> geo.root?.let { geo.accountBottom = it.localPositionOf(c, Offset(0f, c.size.height.toFloat())).y } }) {
        Text("YOUR WORDS", style = Type.eyebrow)
        Spacer(Modifier.height(10.dp))
        segments.forEachIndexed { i, text ->
            val ranges = merged(links, i)
            val past = i < segments.size - 1 && ranges.isEmpty()
            val styled = buildAnnotatedString {
                var at = 0
                for (r in ranges) {
                    append(text.substring(at, r.first))
                    withStyle(SpanStyle(color = Ink.green, textDecoration = TextDecoration.Underline)) { append(text.substring(r.first, r.last + 1)) }
                    at = r.last + 1
                }
                append(text.substring(at))
            }
            var coords by remember { mutableStateOf<LayoutCoordinates?>(null) }
            Text(
                styled,
                style = if (past) Type.witness.copy(color = Ink.inkSoft, fontSize = Type.witness.fontSize * 0.9f) else Type.witness,
                modifier = Modifier.padding(bottom = 6.dp).onGloballyPositioned { coords = it },
                onTextLayout = { layout -> coords?.let { geo.segments[i] = it to layout } },
            )
        }
    }
}

/** The question, revealed word by word without reflowing: each word fades in where it will stay. */
@Composable
fun QuestionText(prompt: Prompt, geo: Geometry) {
    val words = remember(prompt.text) { Regex("\\S+\\s*").findAll(prompt.text).map { it.range }.toList() }
    val reveal = remember(prompt.text) { Animatable(0f) }
    LaunchedEffect(prompt.text) { reveal.animateTo(words.size + 1f, tween(words.size * 45 + 500, easing = LinearEasing)) }
    val inPhrase = { pos: Int -> prompt.links.any { pos >= it.question.start && pos < it.question.end } }
    val text = buildAnnotatedString {
        words.forEachIndexed { i, r ->
            val alpha = (reveal.value - i).coerceIn(0f, 1f)
            val base = if (inPhrase(r.first + (prompt.text.substring(r).takeWhile { !it.isLetterOrDigit() }.length))) Ink.green else Ink.ink
            withStyle(SpanStyle(color = base.copy(alpha = base.alpha * alpha))) { append(prompt.text.substring(r)) }
        }
    }
    var coords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    Text(
        text,
        style = if (prompt.kind.wire == "opening") Type.opening else Type.question,
        modifier = Modifier.onGloballyPositioned { coords = it },
        onTextLayout = { layout -> coords?.let { geo.question = it to layout } },
    )
}

/** Lines from each run of the witness's words down to its place in the question, engraved after it arrives. */
@Composable
fun Links(prompt: Prompt, geo: Geometry, modifier: Modifier) {
    val draw = remember(prompt.text) { Animatable(0f) }
    LaunchedEffect(prompt.text) { draw.snapTo(0f); kotlinx.coroutines.delay(650); draw.animateTo(1f, tween(900, easing = Engrave)) }
    Canvas(modifier) {
        val root = geo.root ?: return@Canvas
        val floor = (geo.accountBottom ?: return@Canvas) + 10f
        val (qc, ql) = geo.question ?: return@Canvas
        prompt.links.forEach { l ->
            val (sc, sl) = geo.segments[l.segment] ?: return@forEach
            val src: Rect = sl.getBoundingBox(l.start).let { a -> a.copy(right = sl.getBoundingBox((l.end - 1).coerceAtLeast(l.start)).right) }
            val dst: Rect = ql.getBoundingBox(l.question.start).let { a -> a.copy(right = ql.getBoundingBox((l.question.end - 1).coerceAtLeast(l.question.start)).right) }
            val x1 = root.localPositionOf(sc, Offset(src.center.x, 0f)).x
            val p2 = root.localPositionOf(qc, Offset(dst.center.x, dst.top))
            val y2 = p2.y - 6f
            val dy = (y2 - floor) * 0.55f
            val path = Path().apply { moveTo(x1, floor); cubicTo(x1, floor + dy, p2.x, y2 - dy, p2.x, y2) }
            val m = PathMeasure().apply { setPath(path, false) }
            val part = Path()
            m.getSegment(0f, m.length * draw.value, part, true)
            drawPath(part, Ink.green.copy(alpha = 0.85f), style = Stroke(2.2f, cap = StrokeCap.Round))
            drawCircle(Ink.green, 4.5f * minOf(1f, draw.value * 3), Offset(x1, floor))
            if (draw.value > 0.95f) drawCircle(Ink.green, 4.5f, Offset(p2.x, y2))
        }
    }
}

@Composable
fun SourceLine(prompt: Prompt, ms: Long?) {
    val (label, color) = when (prompt.source.wire) {
        "on_device" -> "Asked on this device" to Ink.green
        "in_cloud" -> "Written in the cloud" to Ink.ink
        "template" -> "A fixed question" to Ink.steel
        else -> "From the interview script" to Ink.steel
    }
    val timed = if (ms != null && (prompt.source.wire == "on_device" || prompt.source.wire == "in_cloud")) " · %.1f s".format(ms / 1000.0) else ""
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(9.dp))
        Text(label + timed, style = Type.label)
    }
}

@Composable
fun Thinking(where: String) {
    val t = rememberInfiniteTransition(label = "engrave")
    val phase by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1100, easing = LinearEasing), RepeatMode.Restart), label = "phase")
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.height(60.dp)) {
        Canvas(Modifier.size(width = 120.dp, height = 24.dp)) {
            val path = Path()
            for (i in 0..120) {
                val x = size.width * i / 120f
                val y = size.height / 2 + kotlin.math.sin((i / 120f + phase) * 2 * Math.PI).toFloat() * size.height / 3
                if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            drawPath(path, Ink.green, style = Stroke(2f, pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(10f, 14f), phase * 48f)))
        }
        Spacer(Modifier.width(14.dp))
        Text(if (where == "on_device") "Writing the next question on this device" else "Writing the next question in the cloud", style = Type.label)
    }
}

@Composable
fun GuardNote(rejected: List<Rejected>) {
    if (rejected.isEmpty()) return
    Column(Modifier.padding(top = 32.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.hair))
        Spacer(Modifier.height(6.dp))
        rejected.forEach { r ->
            Text("Checked before you saw it:", style = Type.label)
            val words = r.foreign.toSet()
            Text(
                buildAnnotatedString {
                    append("“")
                    Regex("\\S+\\s*").findAll(r.question).forEach { m ->
                        val core = m.value.trim().trim('.', ',', '?', '!', '“', '”', '"')
                        if (core in words) withStyle(SpanStyle(color = Ink.red, textDecoration = TextDecoration.LineThrough)) { append(m.value) } else append(m.value)
                    }
                    append("”")
                },
                style = Type.witness.copy(color = Ink.inkSoft, fontSize = Type.witness.fontSize * 0.85f),
            )
            Text(r.reasons.joinToString(", ") { REASON_TEXT[it] ?: it.wire }, style = Type.label.copy(color = Ink.red))
        }
    }
}

/** The answer: a writing line, not a box, that turns green while focused. */
@Composable
fun WriteLine(value: String, onValue: (String) -> Unit, placeholder: String, enabled: Boolean) {
    var focused by remember { mutableStateOf(false) }
    val line by animateColorAsState(if (focused) Ink.green else Ink.hair, tween(600), label = "line")
    Column(Modifier.fillMaxWidth()) {
        Box {
            if (value.isEmpty()) Text(placeholder, style = Type.witness.copy(color = Ink.steel.copy(alpha = 0.7f), fontStyle = androidx.compose.ui.text.font.FontStyle.Italic))
            BasicTextField(
                value = value,
                onValueChange = onValue,
                enabled = enabled,
                textStyle = Type.witness,
                cursorBrush = SolidColor(Ink.green),
                modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused },
            )
        }
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth().height(if (focused) 2.dp else 1.dp).background(line))
    }
}

/** Crossfades and lifts the question when it changes. */
@Composable
fun <T> Swap(key: T, content: @Composable (T) -> Unit) {
    AnimatedContent(
        targetState = key,
        transitionSpec = { (fadeIn(tween(520)) + slideInVertically(tween(520, easing = EaseOut)) { it / 8 }) togetherWith fadeOut(tween(220)) },
        label = "swap",
    ) { content(it) }
}

val Transparent = Color(0x00000000)
