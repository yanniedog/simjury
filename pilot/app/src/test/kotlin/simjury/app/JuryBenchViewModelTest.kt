package simjury.app

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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
 * GROWTH.md M-2: after the verdict locks, the juror gets a shareable code and can
 * seat fellow jurors from exchanged codes — offline, spoiler-gated, persisted.
 * Uses the synthetic C-000 case for a fast full loop.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class JuryBenchViewModelTest {

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
    fun bench_mintsCodeSeatsJurorsAndRejectsBadCodes() {
        // No code before the verdict locks.
        assertEquals("", viewModel.uiState.value.myJurorCode)

        playToVerdict()

        val myCode = viewModel.uiState.value.myJurorCode
        assertTrue("expected SJ1-C000 code, got '$myCode'", myCode.startsWith("SJ1-C000-"))

        // Own code cannot fill a seat.
        viewModel.addJurorCode(myCode)
        assertEquals(BenchNotice.OWN_CODE, viewModel.uiState.value.benchNotice)
        assertTrue(viewModel.uiState.value.benchJurors.isEmpty())

        // A friend's code seats them with their verdict and diary leaning.
        val ownTag = myCode.split("-")[3]
        val friendTag = if (ownTag == "AAA") "BBB" else "AAA"
        val friendCode = JurorCode.encode("C-000", "Not Guilty", "U", friendTag)
        viewModel.addJurorCode(friendCode)
        assertEquals(BenchNotice.ADDED, viewModel.uiState.value.benchNotice)
        assertEquals(listOf(BenchJuror("Not Guilty", "U")), viewModel.uiState.value.benchJurors)

        // Same juror cannot be seated twice, even sloppily retyped.
        viewModel.addJurorCode(friendCode.lowercase().replace("-", " "))
        assertEquals(BenchNotice.DUPLICATE, viewModel.uiState.value.benchNotice)

        // Garbage and wrong-case codes are refused.
        viewModel.addJurorCode("not a code")
        assertEquals(BenchNotice.INVALID, viewModel.uiState.value.benchNotice)
        viewModel.addJurorCode(JurorCode.encode("C-001", "Guilty", "G", friendTag))
        assertEquals(BenchNotice.WRONG_CASE, viewModel.uiState.value.benchNotice)
        assertEquals(1, viewModel.uiState.value.benchJurors.size)

        // The seated juror survives in the save.
        awaitCondition {
            runBlocking { PilotSaveRepository(app).load() }?.benchCodes?.size == 1
        }
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
