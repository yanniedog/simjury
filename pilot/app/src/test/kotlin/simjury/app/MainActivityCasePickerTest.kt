package simjury.app

import android.app.Application
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLooper
import simjury.app.data.PilotSaveRepository
import simjury.app.speech.NoOpTrialSpeechController
import simjury.app.update.ApkManifest
import simjury.app.update.AppUpdateRepository

/**
 * R4 Android UI evidence: C-001 can be selected and opens the four-episode hub.
 * Debug builds also assert the summons case-picker chips (hidden in release).
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class MainActivityCasePickerTest {

    @get:Rule(order = 0)
    val testModeRule = object : ExternalResource() {
        override fun before() {
            // Default BuildConfig.PILOT_CASE_ID (c_000); do not force c_001.
            PilotViewModel.testInitialCaseId = null
            PilotViewModel.speechControllerOverride = NoOpTrialSpeechController()
            MainActivity.testSkipAutoUpdateCheck = true
            MainActivity.testUpdateRepositoryOverride = object : AppUpdateRepository() {
                override fun fetchManifest(): ApkManifest = ApkManifest(
                    version = "0.0.0",
                    buildNumber = "0",
                    downloadUrl = "https://example.com/app.apk",
                )
            }
            val app = ApplicationProvider.getApplicationContext<Application>()
            runBlocking { PilotSaveRepository(app).clear() }
        }

        override fun after() {
            PilotViewModel.testInitialCaseId = null
            PilotViewModel.speechControllerOverride = null
            MainActivity.testUpdateRepositoryOverride = null
            MainActivity.testSkipAutoUpdateCheck = false
            val app = ApplicationProvider.getApplicationContext<Application>()
            runBlocking { PilotSaveRepository(app).clear() }
        }
    }

    @get:Rule(order = 1)
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun mainActivity_selectsC001AndOpensFourEpisodeHub() {
        awaitNodesWithTag("summons_enter")
        composeRule.onAllNodesWithText("The Pocket Watch", substring = true)
            .onFirst()
            .assertExists()

        // Picker is debug-only (BuildConfig.DEBUG); release unit tests skip chip asserts.
        if (BuildConfig.DEBUG) {
            composeRule.onNodeWithTag("case_picker_c_000").assertExists()
            composeRule.onNodeWithTag("case_picker_c_001").assertExists()
        }

        // Prefer ViewModel selectCase: FilterChip clicks are flaky under Robolectric
        // when bootstrap hops Dispatchers.IO. Chip presence above is the UI evidence.
        val viewModel = ViewModelProvider(composeRule.activity)[PilotViewModel::class.java]
        viewModel.selectCase("c_001")
        val minTitleCount = if (BuildConfig.DEBUG) 2 else 1
        awaitTextCount("The List", minCount = minTitleCount)

        composeRule.onNodeWithTag("summons_enter").performScrollTo().performClick()
        composeRule.waitForIdle()
        awaitNodesWithTag("episode_hub")
        composeRule.onNodeWithTag("episode_hub").assertExists()
        composeRule.onNodeWithTag("episode_card_E-01").assertExists()
        composeRule.onNodeWithTag("episode_hub")
            .performScrollToNode(hasTestTag("episode_card_E-04"))
        composeRule.onNodeWithTag("episode_card_E-04").assertExists()
    }

    /**
     * [composeRule.waitUntil] plus [ShadowLooper.idleMainLooper] inside the predicate.
     * Idle is required because [PilotViewModel.bootstrapCase] hops [Dispatchers.IO];
     * plain waitUntil alone can stall under Robolectric (see C001ViewModelPlaythroughTest).
     */
    private fun awaitNodesWithTag(tag: String, timeoutMillis: Long = 15_000) {
        composeRule.waitUntil(timeoutMillis) {
            ShadowLooper.idleMainLooper()
            composeRule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun awaitTextCount(text: String, minCount: Int, timeoutMillis: Long = 15_000) {
        composeRule.waitUntil(timeoutMillis) {
            ShadowLooper.idleMainLooper()
            composeRule.onAllNodesWithText(text, substring = true)
                .fetchSemanticsNodes()
                .size >= minCount
        }
    }
}
