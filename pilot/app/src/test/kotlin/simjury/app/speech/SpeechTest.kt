package simjury.app.speech

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import simjury.app.model.TrialItem

class VoiceAssignerTest {

    @Test
    fun witnessRoles_receiveStableDistinctProfiles() {
        val assigner = VoiceAssigner.fromCaseWitnessRefs(listOf("P-01", "P-02"))
        val witnessOne = assigner.profileFor(SpeechRole.witness("P-01"))
        val witnessTwo = assigner.profileFor(SpeechRole.witness("P-02"))
        val witnessOneAgain = assigner.profileFor(SpeechRole.witness("P-01"))

        assertEquals(witnessOne, witnessOneAgain)
        assertNotEquals(witnessOne.voiceName, witnessTwo.voiceName)
        assertNotEquals(witnessOne.pitch, witnessTwo.pitch)
    }

    @Test
    fun courtroomRoles_useDedicatedProfiles() {
        val assigner = VoiceAssigner()
        val narrator = assigner.profileFor(SpeechRole.NARRATOR)
        val judge = assigner.profileFor(SpeechRole.JUDGE)
        val clerk = assigner.profileFor(SpeechRole.CLERK)

        assertNotEquals(narrator.voiceName, judge.voiceName)
        assertNotEquals(judge.voiceName, clerk.voiceName)
        assertTrue(judge.pitch < narrator.pitch)
    }
}

class ScreenSpeechBuilderTest {

    @Test
    fun trialItem_usesWitnessSpeakerForTestimony() {
        val item = TrialItem(
            id = "T-W01-001",
            kind = "examination",
            title = "Mr Alden (Complainant)",
            body = "The watch was taken.",
            speakerRole = SpeechRole.witness("P-01"),
        )
        val segments = ScreenSpeechBuilder.trialItem(item)
        assertTrue(segments.all { it.roleKey == SpeechRole.witness("P-01") })
    }

    @Test
    fun trialItem_usesClerkForExhibitSubtitle() {
        val item = TrialItem(
            id = "X-01",
            kind = "exhibit",
            title = "Receipt",
            body = "Ledger entry.",
            subtitle = "Crown: stolen\nDefence: not identified",
            speakerRole = SpeechRole.CLERK,
        )
        val segments = ScreenSpeechBuilder.trialItem(item)
        assertEquals(SpeechRole.CLERK, segments.first().roleKey)
        assertEquals(SpeechRole.CLERK, segments.last().roleKey)
    }
}
