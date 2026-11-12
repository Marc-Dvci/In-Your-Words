package app.inyourwords.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.googlefonts.Font
import androidx.compose.ui.text.googlefonts.GoogleFont
import androidx.compose.ui.unit.sp
import app.inyourwords.R

/** Intaglio: one engraving ink on cool paper, security green for the witness's own words. */
object Ink {
    val paper = Color(0xFFF6F8FA)
    val paperDeep = Color(0xFFEDF1F5)
    val ink = Color(0xFF12324B)
    val inkSoft = Color(0x9E12324B)
    val green = Color(0xFF1D6B5B)
    val steel = Color(0xFF5E6B78)
    val red = Color(0xFFB23A2E)
    val hair = Color(0x2412324B)
}

private val provider = GoogleFont.Provider(
    providerAuthority = "com.google.android.gms.fonts",
    providerPackage = "com.google.android.gms",
    certificates = R.array.com_google_android_gms_fonts_certs,
)

private fun family(name: String, vararg weights: FontWeight) =
    FontFamily(weights.map { Font(googleFont = GoogleFont(name), fontProvider = provider, weight = it) })

val Serif = family("Source Serif 4", FontWeight.Normal, FontWeight.SemiBold)
val Sans = family("IBM Plex Sans", FontWeight.Normal, FontWeight.Medium, FontWeight.SemiBold)
val Mono = family("IBM Plex Mono", FontWeight.Normal, FontWeight.Medium)

object Type {
    val display = TextStyle(fontFamily = Serif, fontWeight = FontWeight.SemiBold, fontSize = 34.sp, lineHeight = 38.sp, color = Ink.ink)
    val lede = TextStyle(fontFamily = Serif, fontSize = 19.sp, lineHeight = 28.sp, color = Ink.inkSoft)
    val question = TextStyle(fontFamily = Serif, fontWeight = FontWeight.SemiBold, fontSize = 26.sp, lineHeight = 33.sp, color = Ink.ink)
    val opening = TextStyle(fontFamily = Serif, fontSize = 23.sp, lineHeight = 31.sp, color = Ink.ink)
    val witness = TextStyle(fontFamily = Serif, fontSize = 18.sp, lineHeight = 29.sp, color = Ink.ink)
    val eyebrow = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Medium, fontSize = 11.sp, letterSpacing = 1.6.sp, color = Ink.steel)
    val body = TextStyle(fontFamily = Sans, fontSize = 15.sp, lineHeight = 23.sp, color = Ink.inkSoft)
    val label = TextStyle(fontFamily = Sans, fontSize = 13.sp, color = Ink.steel)
    val mono = TextStyle(fontFamily = Mono, fontSize = 14.sp, lineHeight = 22.sp, color = Ink.ink)
}

@Composable
fun InYourWordsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            background = Ink.paper,
            surface = Ink.paper,
            onSurface = Ink.ink,
            primary = Ink.green,
            onPrimary = Ink.paper,
            error = Ink.red,
            outline = Ink.steel,
        ),
        typography = Typography(bodyLarge = Type.body),
        content = content,
    )
}
