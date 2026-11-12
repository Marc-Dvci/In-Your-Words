package app.inyourwords

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.dp
import app.inyourwords.core.Mode
import app.inyourwords.core.PHASES
import app.inyourwords.core.PromptSource
import app.inyourwords.core.Session
import app.inyourwords.core.answer
import app.inyourwords.core.ask
import app.inyourwords.core.currentTurn
import app.inyourwords.core.decide
import app.inyourwords.core.encrypt
import app.inyourwords.core.fingerprint
import app.inyourwords.core.formatCode
import app.inyourwords.core.groupHex
import app.inyourwords.core.mrzLine
import app.inyourwords.core.newCode
import app.inyourwords.core.newSession
import app.inyourwords.core.nextPhase
import app.inyourwords.core.phaseIndex
import app.inyourwords.core.recordId
import app.inyourwords.core.sealable
import app.inyourwords.core.wantsFollowup
import app.inyourwords.ui.Account
import app.inyourwords.ui.EaseOut
import app.inyourwords.ui.Geometry
import app.inyourwords.ui.GuardNote
import app.inyourwords.ui.InYourWordsTheme
import app.inyourwords.ui.Ink
import app.inyourwords.ui.Links
import app.inyourwords.ui.QuestionText
import app.inyourwords.ui.Rail
import app.inyourwords.ui.RosetteSeal
import app.inyourwords.ui.SourceLine
import app.inyourwords.ui.Thinking
import app.inyourwords.ui.Type
import app.inyourwords.ui.WriteLine
import com.google.firebase.Firebase
import com.google.firebase.appcheck.appCheck
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory
import com.google.firebase.initialize
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Firebase.initialize(this)
        Firebase.appCheck.installAppCheckProviderFactory(DebugAppCheckProviderFactory.getInstance())
        enableEdgeToEdge()
        setContent { InYourWordsTheme { App() } }
    }
}

sealed interface Screen {
    data object Home : Screen
    data object Setup : Screen
    data object Interview : Screen
    data object Review : Screen
    data class Sealed(val hex: String, val at: Instant, val existing: Boolean) : Screen
    data class Handover(val code: String?) : Screen
}

@Composable
fun App() {
    var screen by remember { mutableStateOf<Screen>(Screen.Home) }
    var session by remember { mutableStateOf<Session?>(null) }
    var engine by remember { mutableStateOf<HybridEngine?>(null) }
    var config by remember { mutableStateOf(RuntimeConfig()) }
    LaunchedEffect(Unit) { config = loadConfig() }
    val scope = rememberCoroutineScope()

    Box(Modifier.fillMaxSize().background(Ink.paper).safeDrawingPadding()) {
        AnimatedContent(
            targetState = screen,
            transitionSpec = { (fadeIn(tween(520)) + slideInVertically(tween(520, easing = EaseOut)) { it / 14 }) togetherWith fadeOut(tween(240)) },
            contentKey = { it::class },
            label = "screen",
        ) { s ->
            when (s) {
                Screen.Home -> Home(onStart = { screen = Screen.Setup })
                Screen.Setup -> Setup(config) { mode, e ->
                    engine = e
                    session = newSession(mode, Instant.now().toString())
                    screen = Screen.Interview
                }
                Screen.Interview -> session?.let { current ->
                    Interview(current, engine, config, onChange = { session = it }, onDone = { session = it; screen = Screen.Review })
                }
                Screen.Review -> session?.let { current ->
                    Review(current) {
                        scope.launch {
                            val hex = fingerprint(sealable(current))
                            val (at, existing) = Store.seal(hex, current.mode.wire)
                            screen = Screen.Sealed(hex, at, existing)
                        }
                    }
                }
                is Screen.Sealed -> Sealed(s, onHandover = {
                    val code = newCode()
                    screen = Screen.Handover(null)
                    scope.launch {
                        val box = encrypt(code, sessionJson(session!!))
                        Store.putHandover(recordId(code), box.iv, box.ct)
                        screen = Screen.Handover(code)
                    }
                }, onRestart = { session = null; screen = Screen.Home })
                is Screen.Handover -> Handover(s.code) { screen = Screen.Home }
            }
        }
    }
}

@Composable
fun Page(content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(horizontal = 24.dp, vertical = 20.dp),
    ) { content() }
}

@Composable
fun Mark() {
    Row(verticalAlignment = Alignment.CenterVertically) {
        app.inyourwords.ui.RosetteSeal("4fa7c01e93d25b68e0a1f4c7b3926d58c1e07a4f2b9d36e81c5a0f7d4e2b9c63", 22.dp, animate = false)
        Spacer(Modifier.padding(start = 10.dp))
        Text("IN YOUR WORDS", style = Type.eyebrow.copy(fontFamily = app.inyourwords.ui.Serif, color = Ink.ink, letterSpacing = Type.eyebrow.letterSpacing * 1.2f))
    }
}

@Composable
fun Pill(text: String, enabled: Boolean = true, green: Boolean = false, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(50),
        colors = ButtonDefaults.buttonColors(containerColor = if (green) Ink.green else Ink.ink, contentColor = Ink.paper),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 24.dp, vertical = 14.dp),
    ) { Text(text, style = Type.body.copy(color = Ink.paper, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium)) }
}

@Composable
fun Quiet(text: String, onClick: () -> Unit) {
    TextButton(onClick = onClick) { Text(text, style = Type.body.copy(color = Ink.ink, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium)) }
}

@Composable
fun Home(onStart: () -> Unit) = Page {
    Mark()
    Spacer(Modifier.height(48.dp))
    Text("FOR SOMEONE WHO HAS JUST SEEN SOMETHING HAPPEN", style = Type.eyebrow)
    Spacer(Modifier.height(16.dp))
    Text("Write down what you saw, before anything changes it.", style = Type.display)
    Spacer(Modifier.height(20.dp))
    Text("A guided interview that can only ask about words you have already used. Only a fingerprint of your account is sealed.", style = Type.lede)
    Spacer(Modifier.height(32.dp))
    Pill("Start a new account", green = true, onClick = onStart)
    Spacer(Modifier.height(40.dp))
    listOf(
        "01" to ("Your words stay with you" to "Follow-up questions are written on this phone by Gemini Nano, or in the cloud when you choose."),
        "02" to ("No word of ours" to "A check refuses any question that uses a word you never said, or that can be answered yes or no."),
        "03" to ("A seal with a time" to "A fingerprint of the whole interview is sealed with the server's clock."),
    ).forEach { (n, t) ->
        Box(Modifier.fillMaxWidth().height(1.dp).background(Ink.hair))
        Column(Modifier.padding(vertical = 14.dp)) {
            Text(n, style = Type.label.copy(fontFamily = app.inyourwords.ui.Mono, color = Ink.green))
            Text(t.first, style = Type.witness.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold))
            Text(t.second, style = Type.body)
        }
    }
}

@Composable
fun Setup(config: RuntimeConfig, begin: (Mode, HybridEngine?) -> Unit) = Page {
    var status by remember { mutableStateOf<DeviceStatus?>(null) }
    LaunchedEffect(Unit) { status = deviceStatus() }
    val here = status == DeviceStatus.AVAILABLE
    Mark()
    Spacer(Modifier.height(40.dp))
    Text("BEFORE YOU START", style = Type.eyebrow)
    Spacer(Modifier.height(12.dp))
    Text(
        when (status) {
            null -> "Checking this phone…"
            DeviceStatus.AVAILABLE -> "This phone can write the questions."
            else -> "Choose where the questions are written."
        },
        style = Type.display.copy(fontSize = Type.display.fontSize * 0.85f),
    )
    Spacer(Modifier.height(28.dp))
    if (here) {
        Choice("Questions written on this phone", "Your words stay here. Gemini Nano writes each follow-up, and a check refuses any question that uses a word you did not say.") {
            Pill("Begin", green = true) { begin(Mode.ON_DEVICE, HybridEngine(true, config)) }
        }
    }
    if (status != null) {
        Choice(if (here) "Or: questions written in the cloud" else "Questions written in the cloud", "Each answer goes to Gemini through Firebase AI Logic, which writes the next question. The same check refuses any question that uses a word you did not say.") {
            if (here) Quiet("Use the cloud") { begin(Mode.CLOUD, HybridEngine(false, config)) } else Pill("Use the cloud") { begin(Mode.CLOUD, HybridEngine(false, config)) }
        }
        Choice("Fixed questions only", "No model at all. The interview asks the same questions to everyone.") {
            Quiet("Use fixed questions") { begin(Mode.TEMPLATES, null) }
        }
    }
}

@Composable
fun Choice(title: String, body: String, action: @Composable () -> Unit) {
    Column(Modifier.padding(bottom = 26.dp)) {
        Text(title, style = Type.witness.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, fontSize = Type.witness.fontSize * 1.1f))
        Spacer(Modifier.height(6.dp))
        Text(body, style = Type.body)
        Spacer(Modifier.height(10.dp))
        action()
    }
}

@Composable
fun Interview(session: Session, engine: HybridEngine?, config: RuntimeConfig, onChange: (Session) -> Unit, onDone: (Session) -> Unit) {
    var draft by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var ms by remember { mutableStateOf<Long?>(null) }
    val scope = rememberCoroutineScope()
    val geo = remember { Geometry() }
    val prompt = currentTurn(session).prompt
    val segments = session.phases.flatMap { p -> p.turns.filter { it.answer.isNotBlank() }.map { it.answer } }
    val phase = PHASES[phaseIndex(session)]

    fun advance(s: Session) {
        val next = nextPhase(s)
        if (next == null) onDone(s) else { ms = null; onChange(next) }
    }

    fun send() {
        if (draft.isBlank() || busy) return
        val answered = answer(session, draft)
        draft = ""
        onChange(answered)
        if (!wantsFollowup(answered, config.maxFollowups)) { advance(answered); return }
        busy = true
        scope.launch {
            val proposed = try { engine?.propose(answered) } catch (e: Exception) { null }
            val d = decide(answered, proposed?.proposal, proposed?.source ?: PromptSource.ON_DEVICE)
            ms = if (d.prompt.source.wire == "template") null else proposed?.ms
            busy = false
            onChange(ask(answered, d.prompt))
        }
    }

    Box(Modifier.fillMaxSize().onGloballyPositioned { geo.root = it }) {
        Page {
            Mark()
            Spacer(Modifier.height(18.dp))
            Rail(phaseIndex(session))
            Spacer(Modifier.height(6.dp))
            Text(phase.title, style = Type.label.copy(color = Ink.ink))
            Spacer(Modifier.height(28.dp))
            if (segments.isNotEmpty()) {
                Account(segments, prompt.links, geo)
                Spacer(Modifier.height(72.dp))
            }
            if (busy) Thinking(engine?.kind ?: "on_device") else app.inyourwords.ui.Swap(prompt.text) {
                Column {
                    QuestionText(prompt, geo)
                    Spacer(Modifier.height(12.dp))
                    SourceLine(prompt, ms)
                }
            }
            Spacer(Modifier.height(28.dp))
            WriteLine(draft, { draft = it }, if (prompt.kind.wire == "opening") "Write about ${phase.title.lowercase()} here…" else "Write your answer here…", !busy)
            Spacer(Modifier.height(18.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Pill("Next", enabled = !busy && draft.isNotBlank()) { send() }
                Quiet("Nothing more to add") { if (!busy) advance(session) }
            }
            if (!busy) GuardNote(prompt.rejected)
            Spacer(Modifier.height(48.dp))
        }
        if (!busy && segments.isNotEmpty()) Links(prompt, geo, Modifier.matchParentSize())
    }
}

@Composable
fun Review(session: Session, onSeal: () -> Unit) = Page {
    var sealing by remember { mutableStateOf(false) }
    Mark()
    Spacer(Modifier.height(18.dp))
    Rail(PHASES.size, complete = true)
    Spacer(Modifier.height(28.dp))
    Text("READ IT THROUGH", style = Type.eyebrow)
    Spacer(Modifier.height(10.dp))
    Text("Your account, exactly as written.", style = Type.display.copy(fontSize = Type.display.fontSize * 0.8f))
    Spacer(Modifier.height(20.dp))
    sealable(session).phases.filter { it.turns.isNotEmpty() }.forEach { p ->
        Text(PHASES.first { it.id == p.id }.title.uppercase(), style = Type.eyebrow)
        Spacer(Modifier.height(6.dp))
        p.turns.forEach { t ->
            Text(t.question, style = Type.body.copy(fontStyle = androidx.compose.ui.text.font.FontStyle.Italic))
            Text(t.answer, style = Type.witness)
            Spacer(Modifier.height(10.dp))
        }
        Spacer(Modifier.height(10.dp))
    }
    Text("Sealing computes a fingerprint of every question and every answer above. Only that fingerprint leaves this phone, with the time it arrived.", style = Type.body)
    Spacer(Modifier.height(18.dp))
    Pill(if (sealing) "Sealing…" else "Seal my account", enabled = !sealing, green = true) { sealing = true; onSeal() }
}

@Composable
fun Sealed(s: Screen.Sealed, onHandover: () -> Unit, onRestart: () -> Unit) = Page {
    val local = s.at.atZone(ZoneId.systemDefault())
    Mark()
    Spacer(Modifier.height(18.dp))
    Rail(PHASES.size, complete = true)
    Spacer(Modifier.height(24.dp))
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { RosetteSeal(s.hex, 250.dp) }
    Spacer(Modifier.height(20.dp))
    Text(if (s.existing) "ALREADY SEALED" else "YOUR ACCOUNT IS SEALED", style = Type.eyebrow)
    Text(local.format(DateTimeFormatter.ofPattern("HH:mm:ss")), style = Type.mono.copy(fontSize = Type.mono.fontSize * 3))
    Text(local.format(DateTimeFormatter.ofPattern("d MMMM yyyy")), style = Type.label)
    Spacer(Modifier.height(16.dp))
    groupHex(s.hex).forEach { Text(it, style = Type.mono) }
    Spacer(Modifier.height(8.dp))
    Text(mrzLine(s.hex, s.at), style = Type.mono.copy(fontSize = Type.mono.fontSize * 0.72f), maxLines = 1)
    Spacer(Modifier.height(16.dp))
    Text("Only this fingerprint left your phone. Firebase recorded the time it arrived, and nobody can change that record.", style = Type.body)
    Spacer(Modifier.height(20.dp))
    Pill("Continue on your laptop", green = true, onClick = onHandover)
    Quiet("Start again", onRestart)
}

@Composable
fun Handover(code: String?, onDone: () -> Unit) = Page {
    Mark()
    Spacer(Modifier.height(40.dp))
    Text("CONTINUE ON YOUR LAPTOP", style = Type.eyebrow)
    Spacer(Modifier.height(10.dp))
    Text("Type this code on your laptop.", style = Type.display.copy(fontSize = Type.display.fontSize * 0.85f))
    Spacer(Modifier.height(20.dp))
    Text(code?.let { formatCode(it) } ?: "····-····-····-····-····", style = Type.mono.copy(fontSize = Type.mono.fontSize * 1.7f))
    Spacer(Modifier.height(16.dp))
    Text("Your account travels encrypted with a key made from this code. The code never leaves this screen. It works once, for 30 minutes.", style = Type.body)
    Spacer(Modifier.height(24.dp))
    Quiet("Done", onDone)
}
