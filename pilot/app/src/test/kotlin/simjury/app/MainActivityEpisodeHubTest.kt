package simjury.app

import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import simjury.app.update.ApkManifest
import simjury.app.update.AppUpdateRepository

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class MainActivityEpisodeHubTest {

    companion object {
        @JvmStatic
        @BeforeClass
        fun setUpClass() {
            PilotViewModel.testInitialCaseId = "c_001"
            MainActivity.testSkipAutoUpdateCheck = true
            MainActivity.testUpdateRepositoryOverride = object : AppUpdateRepository() {
                override fun fetchManifest(): ApkManifest = ApkManifest(
                    version = "0.0.0",
                    buildNumber = "0",
                    downloadUrl = "https://example.com/app.apk",
                )
            }
        }

        @JvmStatic
        @AfterClass
        fun tearDownClass() {
            PilotViewModel.testInitialCaseId = null
            MainActivity.testUpdateRepositoryOverride = null
            MainActivity.testSkipAutoUpdateCheck = false
        }
    }

    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun mainActivity_c001_showsEpisodeHubAfterSummons() {
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithTag("summons_enter").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithTag("summons_enter").performClick()
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithTag("episode_hub").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithTag("episode_hub").assertExists()
        composeRule.onNodeWithTag("episode_card_E-01").assertExists()
        composeRule.onNodeWithText("The method", substring = true).assertExists()
    }
}
