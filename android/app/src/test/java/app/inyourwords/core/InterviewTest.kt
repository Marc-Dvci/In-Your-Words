package app.inyourwords.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private const val ACCOUNT =
    "I was waiting at the crossing by the bakery when a dark estate car came round the corner too fast. There was a sticker on the rear window, white, maybe round."

private const val START = "2026-11-12T18:52:00.000Z"

private fun started(): Session = answer(newSession(Mode.ON_DEVICE, START), ACCOUNT)

private fun followup(text: String): Prompt = Prompt(text, PromptKind.FOLLOWUP, PromptSource.TEMPLATE, emptyList(), emptyList())

class InterviewTest {
    @Test
    fun hasTheFivePhasesInTheOrderOfTheSelfAdministeredInterview() {
        assertEquals(listOf("event", "people", "vehicles", "sequence", "surroundings"), PHASES.map { it.id.wire })
    }

    @Test
    fun opensEveryPhaseWithFixedText() {
        var s: Session? = newSession(Mode.TEMPLATES, START)
        val seen = mutableListOf<String>()
        while (s != null) {
            assertEquals(PromptKind.OPENING, currentTurn(s).prompt.kind)
            assertEquals(PromptSource.SCRIPT, currentTurn(s).prompt.source)
            seen.add(currentTurn(s).prompt.text)
            s = nextPhase(answer(s, "Something I saw."))
        }
        assertEquals(PHASES.map { it.opening }, seen)
    }

    @Test
    fun endsAfterTheLastPhase() {
        var s: Session = newSession(Mode.TEMPLATES, START)
        for (i in 0 until PHASES.size - 1) s = nextPhase(answer(s, "Text."))!!
        assertEquals(PHASES.size - 1, phaseIndex(s))
        assertNull(nextPhase(s))
    }

    @Test
    fun dropsAnUnansweredFollowupWhenTheWitnessMovesOn() {
        val s = ask(started(), followup(GENERIC_TEMPLATE))
        val next = nextPhase(s)!!
        assertEquals(1, next.phases[0].turns.size)
        assertEquals(PhaseId.PEOPLE, currentPhase(next).id)
    }

    @Test
    fun asksAfterAnAnswerOfFourWordsOrMore() {
        assertTrue(wantsFollowup(started()))
    }

    @Test
    fun doesNotAskAfterAnEmptyOrVeryShortAnswer() {
        assertFalse(wantsFollowup(newSession(Mode.ON_DEVICE, "t")))
        assertFalse(wantsFollowup(answer(newSession(Mode.ON_DEVICE, "t"), "No idea.")))
    }

    @Test
    fun stopsAfterMaxFollowupsInAPhase() {
        var s = started()
        for (i in 0 until MAX_FOLLOWUPS) {
            s = answer(ask(s, followup(GENERIC_TEMPLATE)), "The sticker was round and white.")
        }
        assertFalse(wantsFollowup(s))
    }

    @Test
    fun carriesTheWitnessWordsAndEveryQuestionAlreadyAsked() {
        val p = followupPrompt(started())
        assertTrue(p.contains(ACCOUNT))
        assertTrue(p.contains(PHASES[0].opening))
        assertTrue(p.contains("What happened"))
    }

    @Test
    fun neverCountsAQuestionAsTheWitnessWords() {
        assertEquals(listOf(ACCOUNT), witnessSegments(started()))
    }

    @Test
    fun readsJsonEvenWithTextAroundIt() {
        assertEquals(
            Proposal(anchor = "a sticker", question = "Tell me about the sticker."),
            parseProposal("Sure: {\"anchor\": \"a sticker\", \"question\": \"Tell me about the sticker.\"}"),
        )
    }

    @Test
    fun returnsNullForReplyThatIsNotAUsableProposal() {
        for (raw in listOf("", "no json here", "{\"anchor\": 3, \"question\": \"x\"}", "{broken")) {
            assertNull(raw, parseProposal(raw))
        }
    }

    @Test
    fun refusesRawControlCharactersInsideTheJsonAsJsonParseDoes() {
        assertNull(parseProposal("{\"anchor\": \"a\tb\", \"question\": \"q\"}"))
        assertNull(parseProposal("{\"anchor\": \"a\", \"question\": \"q\u0001\"}"))
    }

    @Test
    fun lowersGreekCapitalSigmaAsJavaScriptDoes() {
        assertEquals("οδος", tokenize("ΟΔΟΣ")[0].lower)
        assertEquals("οδοσ'was", tokenize("ΟΔΟΣ’was")[0].lower)
    }

    @Test
    fun showsAnAcceptedProposalLabelledWithWhereItRanWithItsLinks() {
        val d = decide(
            started(),
            Proposal(
                anchor = "a sticker",
                question = "You said there was a sticker on the rear window. Tell me everything you remember about it.",
            ),
            PromptSource.ON_DEVICE,
        )
        assertEquals(PromptSource.ON_DEVICE, d.prompt.source)
        assertEquals(listOf("sticker on the rear window"), d.prompt.links.map { it.question.text })
        assertEquals(emptyList<Rejected>(), d.prompt.rejected)
    }

    @Test
    fun refusesALeadingProposalAndReusesItsAnchorWhenTheAnchorIsTheWitnessExactWords() {
        val d = decide(started(), Proposal(anchor = "a sticker", question = "Was the sticker a parking permit?"), PromptSource.IN_CLOUD)
        assertEquals(PromptSource.TEMPLATE, d.prompt.source)
        assertEquals("You said “a sticker”. Tell me everything you remember about that.", d.prompt.text)
        assertEquals(
            listOf(Rejected("Was the sticker a parking permit?", listOf(Reason.CLOSED_FORM, Reason.FOREIGN_WORDS), listOf("parking", "permit"))),
            d.prompt.rejected,
        )
    }

    @Test
    fun fallsBackToTheGenericQuestionWhenTheAnchorWasInvented() {
        val d = decide(started(), Proposal(anchor = "the parking permit", question = "Describe the parking permit."), PromptSource.ON_DEVICE)
        assertEquals(GENERIC_TEMPLATE, d.prompt.text)
        assertEquals(1, d.prompt.rejected.size)
    }

    @Test
    fun refusesAnAnchorLongerThanSixWords() {
        val d = decide(started(), Proposal(anchor = "a dark estate car came round the corner", question = "Was it fast?"), PromptSource.ON_DEVICE)
        assertEquals(GENERIC_TEMPLATE, d.prompt.text)
    }

    @Test
    fun usesTheGenericQuestionWhenTheModelReturnedNothingUsable() {
        val prompt = decide(started(), null, PromptSource.ON_DEVICE).prompt
        assertEquals(GENERIC_TEMPLATE, prompt.text)
        assertEquals(PromptSource.TEMPLATE, prompt.source)
        assertEquals(emptyList<Rejected>(), prompt.rejected)
    }

    @Test
    fun onlyEverShowsAQuestionTheGuardAccepts() {
        val proposals = listOf(
            Proposal(anchor = "a sticker", question = "Was it a parking permit?"),
            Proposal(anchor = "rear window", question = "What colour was the window?"),
            Proposal(anchor = "invented", question = "Tell me about the gun."),
            Proposal(anchor = "dark estate car", question = "Tell me about the dark estate car."),
        )
        val s = started()
        for (p in proposals) {
            val shown = decide(s, p, PromptSource.ON_DEVICE).prompt.text
            assertTrue(shown, checkQuestion(shown, indexWitness(witnessSegments(s))).ok)
        }
    }
}
