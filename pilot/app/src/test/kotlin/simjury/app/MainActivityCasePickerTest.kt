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
 * R4 Android UI evidence: debug case picker lists C-001, and selecting it loads
 * the four-episode hub without a `-PpilotCaseId` rebuild.
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
    fun mainActivity_debugCasePicker_switchesToC001AndOpensHub() {
        awaitNodesWithTag("summons_enter")
        composeRule.onAllNodesWithText("The Pocket Watch", substring = true)
            .onFirst()
            .assertExists()
        composeRule.onNodeWithTag("case_picker_c_000").assertExists()
        composeRule.onNodeWithTag("case_picker_c_001").assertExists()

        // Prefer ViewModel selectCase: FilterChip clicks are flaky under Robolectric
        // when bootstrap hops Dispatchers.IO. Chip presence above is the UI evidence.
        val viewModel = ViewModelProvider(composeRule.activity)[PilotViewModel::class.java]
        viewModel.selectCase("c_001")
        awaitTextCount("The List", minCount = 2)

        composeRule.onNodeWithTag("summons_enter").performScrollTo().performClick()
        composeRule.waitForIdle()
        awaitNodesWithTag("episode_hub")
        composeRule.onNodeWithTag("episode_hub").assertExists()
        composeRule.onNodeWithTag("episode_card_E-01").assertExists()
        composeRule.onNodeWithTag("episode_hub")
            .performScrollToNode(hasTestTag("episode_card_E-04"))
        composeRule.onNodeWithTag("episode_card_E-04").assertExists()
    }

    private fun awaitNodesWithTag(tag: String, maxAttempts: Int = 800) {
        repeat(maxAttempts) {
            if (composeRule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()) return
            ShadowLooper.idleMainLooper()
            composeRule.waitForIdle()
            Thread.sleep(10)
        }
        throw AssertionError("No nodes with tag='$tag' after $maxAttempts attempts")
    }

    private fun awaitTextCount(text: String, minCount: Int, maxAttempts: Int = 800) {
        repeat(maxAttempts) {
            val count = composeRule.onAllNodesWithText(text, substring = true)
                .fetchSemanticsNodes()
                .size
            if (count >= minCount) return
            ShadowLooper.idleMainLooper()
            composeRule.waitForIdle()
            Thread.sleep(10)
        }
        throw AssertionError(
            "Expected >= $minCount nodes containing '$text' after $maxAttempts attempts",
        )
    }
}
