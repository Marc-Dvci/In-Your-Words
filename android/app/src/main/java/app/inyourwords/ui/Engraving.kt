package app.inyourwords.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.inyourwords.core.PHASES
import app.inyourwords.core.curvePoints
import app.inyourwords.core.rosette
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

val Engrave = CubicBezierEasing(0.65f, 0f, 0.35f, 1f)
val EaseOut = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)

/** The guilloché seal: the same four rose-engine curves as the web, engraved one after another. */
@Composable
fun RosetteSeal(hex: String, size: Dp, animate: Boolean = true) {
    val curves = remember(hex) { rosette(hex) }
    val progress = remember(hex) { curves.map { Animatable(if (animate) 0f else 1f) } }
    val ring = remember(hex) { Animatable(if (animate) 0f else 1f) }
    LaunchedEffect(hex) {
        if (!animate) return@LaunchedEffect
        progress.forEachIndexed { i, a -> launch { delay(i * 260L); a.animateTo(1f, tween(1500, easing = Engrave)) } }
        launch { delay(1100); ring.animateTo(1f, tween(900, easing = Engrave)) }
    }
    Canvas(Modifier.size(size)) {
        val c = this.size.minDimension / 2
        val r = c * 104f / 120f
        val ink = Brush.linearGradient(listOf(Ink.ink, Ink.green), Offset.Zero, Offset(this.size.width, this.size.height))
        curves.forEachIndexed { i, curve ->
            val path = Path()
            curvePoints(curve, c.toDouble(), c.toDouble(), r.toDouble(), 2400).forEachIndexed { j, (x, y) ->
                if (j == 0) path.moveTo(x.toFloat(), y.toFloat()) else path.lineTo(x.toFloat(), y.toFloat())
            }
            val measure = PathMeasure().apply { setPath(path, false) }
            val part = Path()
            measure.getSegment(0f, measure.length * progress[i].value, part, true)
            drawPath(part, ink, style = Stroke(width = 0.9f))
        }
        val sweep = 360f * ring.value
        drawArc(Ink.ink, -90f, sweep, false, Offset(c - (r + 10 * c / 120f), c - (r + 10 * c / 120f)), Size(2 * (r + 10 * c / 120f), 2 * (r + 10 * c / 120f)), style = Stroke(1.6f))
        drawArc(Ink.ink, -90f, sweep, false, Offset(c - (r + 6 * c / 120f), c - (r + 6 * c / 120f)), Size(2 * (r + 6 * c / 120f), 2 * (r + 6 * c / 120f)), style = Stroke(0.7f))
        drawCircle(Ink.paper, radius = 10 * c / 120f, center = Offset(c, c))
        drawCircle(Ink.ink, radius = 10 * c / 120f, center = Offset(c, c), style = Stroke(1.4f))
    }
}

/** The five phases as road-stud bars: done in ink, the current one breathing in green. */
@Composable
fun Rail(at: Int, complete: Boolean = false) {
    val breathe = rememberInfiniteTransition(label = "breathe")
    val glow by breathe.animateFloat(0.25f, 0.6f, infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "glow")
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PHASES.forEachIndexed { i, _ ->
            val state = when {
                complete || i < at -> 2
                i == at -> 1
                else -> 0
            }
            val fill by animateFloatAsState(if (state > 0) 1f else 0f, tween(900, easing = EaseOut), label = "fill")
            Column(Modifier.weight(1f)) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .drawBehind {
                            drawRoundRect(Ink.hair, cornerRadius = CornerRadius(4f))
                            val color = if (state == 1) Ink.green else Ink.ink.copy(alpha = 0.7f)
                            if (state == 1) drawRoundRect(Ink.green.copy(alpha = glow * 0.5f), Offset(0f, -4f), Size(size.width * fill, size.height + 8f), CornerRadius(8f))
                            drawRoundRect(color, size = Size(size.width * fill, size.height), cornerRadius = CornerRadius(4f))
                        },
                )
                Text(String.format("%02d", i + 1), style = Type.label.copy(fontFamily = Mono, fontSize = Type.label.fontSize * 0.85f), modifier = Modifier.padding(top = 6.dp))
            }
        }
    }
}

