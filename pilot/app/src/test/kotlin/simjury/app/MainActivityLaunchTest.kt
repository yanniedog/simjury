package simjury.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.AfterClass
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import simjury.app.update.ApkManifest
import simjury.app.update.AppUpdateRepository

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class MainActivityLaunchTest {

    companion object {
        @JvmStatic
        @BeforeClass
        fun setUpClass() {
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
            MainActivity.testUpdateRepositoryOverride = null
            MainActivity.testSkipAutoUpdateCheck = false
        }
    }

    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun ensureTestMode() {
        MainActivity.testSkipAutoUpdateCheck = true
        MainActivity.testUpdateRepositoryOverride = object : AppUpdateRepository() {
            override fun fetchManifest(): ApkManifest = ApkManifest(
                version = "0.0.0",
                buildNumber = "0",
                downloadUrl = "https://example.com/app.apk",
            )
        }
    }

    @Test
    fun mainActivity_showsSummonsAfterCaseLoad() {
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithText("Enter the courtroom", substring = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
        composeRule.onNodeWithText("Enter the courtroom", substring = true).assertExists()
        composeRule.onNodeWithText("Check for updates", substring = true).assertExists()
    }

    @Test
    fun mainActivity_manualUpdateCheck_showsUpToDateMessage() {
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithText("Check for updates", substring = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
        composeRule.onNodeWithText("Check for updates", substring = true)
            .performScrollTo()
            .performClick()
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithText("latest version", substring = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
        composeRule.onNodeWithText("latest version", substring = true).assertExists()
    }
}
