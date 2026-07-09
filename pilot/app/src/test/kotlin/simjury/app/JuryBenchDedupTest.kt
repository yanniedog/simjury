package simjury.app

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLooper
import simjury.app.data.PilotSaveRepository
import simjury.app.share.JurorCode
import simjury.app.speech.NoOpTrialSpeechController
import simjury.deliberation.DeliberationPhase

/**
 * Regression for the jury-bench dedup (GROWTH.md M-2). A seated juror is
 * identified by the parsed token, so cosmetic-but-parseable variants of the
 * same code — a trailing hyphen, mixed case — cannot claim a second seat, and
 * a genuinely different juror still can. Uses the synthetic C-000 for speed.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class JuryBenchDedupTest {

    private lateinit var viewModel: PilotViewModel
    private lateinit var app: Application

    @Before
    fun setUp() {
        PilotViewModel.speechControllerOverride = NoOpTrialSpeechController()
        app = ApplicationProvider.getApplicationContext()
        runBlocking { PilotSaveRepository(app).clear() }
        viewModel = PilotViewModel(app, "c_000")
        awaitCondition {
            val s = viewModel.uiState.value
            !s.loading && s.error == null && s.caseTitle.isNotBlank()
        }
    }

    @After
    fun tearDown() {
        if (::app.isInitialized) {
            runBlocking { PilotSaveRepository(app).clear() }
        }
        PilotViewModel.speechControllerOverride = null
    }

    @Test
    fun bench_dedupsByToken_notRawCodeString() {
        playToVerdict()

        val myCode = viewModel.uiState.value.playerJurorCode
        assertNotNull("player code should be minted after the verdict locks", myCode)
        assertEquals(1, viewModel.uiState.value.benchSeats.size)

        // Pick a friend token distinct from the player's own (avoids a 1/32768
        // self-collision making the first redeem read as a duplicate).
        val myToken = JurorCode.parse(myCode!!)!!.token
        val friendToken = if (myToken == "ABC") "ABD" else "ABC"
        val friendCode = JurorCode.mint("C-000", "Not Guilty", "U", friendToken)

        viewModel.redeemJurorCode(friendCode)
        assertEquals("friend should take seat 2", 2, viewModel.uiState.value.benchSeats.size)

        // A trailing hyphen still parses to the same token — must not double-seat.
        viewModel.redeemJurorCode("$friendCode-")
        assertEquals("cosmetic variant must dedup", 2, viewModel.uiState.value.benchSeats.size)

        // Lowercased whole code is the same juror too.
        viewModel.redeemJurorCode(friendCode.lowercase())
        assertEquals("case variant must dedup", 2, viewModel.uiState.value.benchSeats.size)

        // The player's own code cannot fill a second seat.
        viewModel.redeemJurorCode(myCode)
        assertEquals("own code must be rejected", 2, viewModel.uiState.value.benchSeats.size)

        // A genuinely different juror still seats. Pick a token distinct from both
        // the player's and the friend's so this can never collide with either.
        val otherToken = listOf("XYZ", "XY9", "XY8").first { it != myToken && it != friendToken }
        viewModel.redeemJurorCode(JurorCode.mint("C-000", "Guilty", "G", otherToken))
        assertEquals("distinct juror should seat", 3, viewModel.uiState.value.benchSeats.size)
    }

    private fun playToVerdict() {
        viewModel.acknowledgeSummons()
        awaitCondition { viewModel.uiState.value.phase == DeliberationPhase.READING }
        viewModel.uiState.value.itemOrder.forEach { viewModel.markItemRead(it) }
        awaitCondition { viewModel.uiState.value.allItemsRead }
        viewModel.openDiary()
        awaitCondition { viewModel.uiState.value.phase == DeliberationPhase.DIARY }
        viewModel.commitDiary(
            leaning = "G",
            topReason = "The pawn ticket trail is direct.",
            strongestDoubt = "The receipt timing is loose.",
        )
        awaitCondition { viewModel.uiState.value.phase == DeliberationPhase.VOTE }
        viewModel.castVote("Guilty")
        awaitCondition { viewModel.uiState.value.phase == DeliberationPhase.COMPLETE }
    }

    /** Iteration-bounded wait; Robolectric virtual time can freeze wall clocks. */
    private fun awaitCondition(maxAttempts: Int = 600, predicate: () -> Boolean) {
        repeat(maxAttempts) {
            if (predicate()) return
            ShadowLooper.idleMainLooper()
            Thread.sleep(10)
        }
        throw AssertionError("Condition not met after $maxAttempts attempts; state=${viewModel.uiState.value}")
    }
}
