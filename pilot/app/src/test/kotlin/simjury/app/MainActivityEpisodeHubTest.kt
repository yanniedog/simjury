package simjury.app

import android.app.Application
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import simjury.app.data.PilotSaveRepository
import simjury.app.speech.NoOpTrialSpeechController
import simjury.app.update.ApkManifest
import simjury.app.update.AppUpdateRepository

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class MainActivityEpisodeHubTest {

    @get:Rule(order = 0)
    val testModeRule = object : ExternalResource() {
        override fun before() {
            PilotViewModel.testInitialCaseId = "c_001"
            PilotViewModel.speechControllerOverride = NoOpTrialSpeechController()
            MainActivity.testSkipAutoUpdateCheck = true
            MainActivity.testUpdateRepositoryOverride = object : AppUpdateRepository() {
                override fun fetchManifest(): ApkManifest = ApkManifest(
                    version = "0.0.0",
                    buildNumber = "0",
                    downloadUrl = "https://example.com/app.apk",
                )
            }
            // Clear any prior Robolectric DataStore save so summons is shown.
            val app = ApplicationProvider.getApplicationContext<Application>()
            runBlocking { PilotSaveRepository(app).clear() }
        }

        override fun after() {
            PilotViewModel.testInitialCaseId = null
            PilotViewModel.speechControllerOverride = null
            MainActivity.testUpdateRepositoryOverride = null
            MainActivity.testSkipAutoUpdateCheck = false
        }
    }

    @get:Rule(order = 1)
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun mainActivity_c001_showsEpisodeHubAfterSummons() {
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithText("The List", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("The List", substring = true).assertExists()
        composeRule.onNodeWithTag("summons_enter").performScrollTo().performClick()
        composeRule.waitForIdle()
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithTag("episode_hub").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithTag("episode_hub").assertExists()
        composeRule.onNodeWithTag("episode_card_E-01").assertExists()
        composeRule.onNodeWithText("The method", substring = true).assertExists()
    }
}
