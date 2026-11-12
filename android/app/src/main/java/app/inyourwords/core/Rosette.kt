package app.inyourwords.core

/**
 * The guilloché rosette drawn on every seal. Its four rose-engine curves (hypotrochoids) take their radii from the
 * fingerprint's bytes, so one changed character in the account draws a different rosette. Web and Android compute
 * the same integers from the same fingerprint.
 */

/**
 * One rose-engine curve.
 *
 * [R] is the fixed circle radius and [r] the rolling circle radius. [d] is the pen distance from the rolling circle's
 * centre, [turns] the turns of the rolling circle needed to close the curve, and [extent] the outer radius of this
 * curve as a share of the rosette's radius.
 */
data class Curve(
    @get:JvmName("getFixedRadius") val R: Int,
    val r: Int,
    val d: Double,
    val turns: Int,
    val extent: Double,
)

private fun gcd(a: Int, b: Int): Int = if (b == 0) a else gcd(b, a % b)

/** Rounds [x] to three decimals, halves toward positive infinity, as `Math.round(x * 1000) / 1000` does in JavaScript. */
private fun round3(x: Double): Double = java.lang.Math.round(x * 1000.0).toDouble() / 1000.0

/**
 * The 32 bytes of a 64-digit lower-case hex [hex]. Throws [IllegalArgumentException] for any other input.
 */
fun hexBytes(hex: String): IntArray {
    require(HEX64.containsMatchIn(hex)) { "expected a 64-digit lower-case hex fingerprint" }
    return IntArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16) }
}

/** The four curves drawn from the fingerprint [hex]. */
fun rosette(hex: String): List<Curve> {
    val b = hexBytes(hex)
    return (0 until 4).map { k ->
        val fixed = 60 + b[k] % 36
        var rolling = 5 + b[k + 4] % 17
        if (rolling == fixed || fixed % rolling == 0) rolling += 1
        val d = rolling * (0.7 + (b[k + 8] / 255.0) * 0.9)
        Curve(
            R = fixed,
            r = rolling,
            d = round3(d),
            turns = rolling / gcd(fixed, rolling),
            extent = (96 - k * 13) / 110.0,
        )
    }
}

/**
 * The points of one curve, centred on ([cx], [cy]) and scaled so that the curve reaches `radius * extent`. The
 * first and last point coincide, because the curve is closed.
 */
fun curvePoints(c: Curve, cx: Double, cy: Double, radius: Double, n: Int = 2400): List<Pair<Double, Double>> {
    val scale = (radius * c.extent) / (c.R - c.r + c.d)
    val k = (c.R - c.r).toDouble() / c.r
    return (0..n).map { i ->
        val t = (i.toDouble() / n) * Math.PI * 2 * c.turns
        val x = (c.R - c.r) * StrictMath.cos(t) + c.d * StrictMath.cos(k * t)
        val y = (c.R - c.r) * StrictMath.sin(t) - c.d * StrictMath.sin(k * t)
        Pair(cx + x * scale, cy + y * scale)
    }
}
