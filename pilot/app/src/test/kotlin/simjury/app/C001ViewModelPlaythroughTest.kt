package simjury.app

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import simjury.app.speech.NoOpTrialSpeechController
import simjury.deliberation.DeliberationPhase

/**
 * R4 Android unit evidence: drive PilotViewModel through the full C-001 loop
 * (summons → mark all items → diary → vote → reveal) under Robolectric.
 * Complements CLI [simjury.pilot.C001PlaythroughTest]; device/emulator QA still required for G-4.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class C001ViewModelPlaythroughTest {

    private lateinit var viewModel: PilotViewModel

    @Before
    fun setUp() {
        PilotViewModel.speechControllerOverride = NoOpTrialSpeechController()
        val app = ApplicationProvider.getApplicationContext<Application>()
        viewModel = PilotViewModel(app, "c_001")
        awaitLoaded()
    }

    @After
    fun tearDown() {
        viewModel.stopListening()
        PilotViewModel.speechControllerOverride = null
        PilotViewModel.testInitialCaseId = null
    }

    @Test
    fun c001_viewModel_fullLoop_reachesRevealWithoutPreRevealLeaks() {
        val loadedTitle = viewModel.uiState.value.caseTitle
        assertEquals("The List", loadedTitle)
        assertEquals(DeliberationPhase.SUMMONS, viewModel.uiState.value.phase)

        viewModel.acknowledgeSummons()
        awaitPhase(DeliberationPhase.READING)
        assertTrue(viewModel.uiState.value.showEpisodeHub)
        assertTrue(viewModel.uiState.value.episodes.size >= 3)

        // Episode summaries omit item ids — select each episode and collect itemOrder.
        val itemIds = mutableListOf<String>()
        viewModel.uiState.value.episodes.forEach { ep ->
            viewModel.selectEpisode(ep.id)
            awaitCondition { viewModel.uiState.value.episodeTitle == ep.title }
            itemIds += viewModel.uiState.value.itemOrder
            viewModel.backToEpisodeHub()
        }
        assertTrue("expected >= 60 C-001 items, got ${itemIds.size}", itemIds.size >= 60)

        itemIds.forEach { id ->
            viewModel.markItemRead(id)
        }
        awaitCondition { viewModel.uiState.value.allItemsRead }

        viewModel.openDiary()
        awaitPhase(DeliberationPhase.DIARY)
        viewModel.commitDiary(
            leaning = "NG",
            topReason = "Identification parade conditions undermine certainty.",
            strongestDoubt = "Handwriting certainty may be overstated on the record.",
        )
        awaitPhase(DeliberationPhase.VOTE)

        viewModel.castVote("Not Guilty")
        awaitPhase(DeliberationPhase.COMPLETE)

        val end = viewModel.uiState.value
        assertEquals(DeliberationPhase.COMPLETE, end.phase)
        assertEquals("Not Guilty", end.vote)
        assertNotNull(end.revealTitle)
        assertTrue(end.revealLayers.isNotEmpty())
        assertTrue(end.revealNames.isNotEmpty())

        // Pre-reveal UI fields must not contain F-4 static tokens (play title / charge / notes).
        val preRevealBlob = listOf(
            end.caseTitle,
            end.charge,
            end.contentNotes.joinToString(" "),
            end.episodes.joinToString(" ") { it.title },
        ).joinToString(" ").lowercase()
        listOf("beck", "1896", "old bailey", "gurrin", "spurrell").forEach { token ->
            assertFalse("F-4 token '$token' in play-reachable UI fields", preRevealBlob.contains(token))
        }
    }

    private fun awaitLoaded() {
        awaitCondition(timeoutMs = 20_000) {
            val s = viewModel.uiState.value
            !s.loading && s.error == null && s.caseTitle.isNotBlank()
        }
        val err = viewModel.uiState.value.error
        assertTrue("case load failed: $err", err == null)
    }

    private fun awaitPhase(phase: DeliberationPhase) {
        awaitCondition { viewModel.uiState.value.phase == phase }
    }

    private fun awaitCondition(timeoutMs: Long = 15_000, predicate: () -> Boolean) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (predicate()) return
            Thread.sleep(25)
            org.robolectric.shadows.ShadowLooper.idleMainLooper()
        }
        throw AssertionError("Condition not met within ${timeoutMs}ms; state=${viewModel.uiState.value}")
    }
}
