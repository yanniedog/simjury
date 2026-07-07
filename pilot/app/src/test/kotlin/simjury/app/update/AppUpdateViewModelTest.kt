package simjury.app.update

import android.app.Application
import android.content.pm.PackageManager
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AppUpdateViewModelTest {

    private lateinit var application: Application

    @Before
    fun setUp() {
        application = ApplicationProvider.getApplicationContext()
    }

    private suspend fun awaitUpdateCheck(viewModel: AppUpdateViewModel) {
        withTimeout(5_000) {
            while (viewModel.state.value is AppUpdateUiState.Checking) {
                delay(10)
            }
        }
    }

    private fun currentManifest(): ApkManifest = ApkManifest(
        version = BuildConfig.VERSION_NAME,
        buildNumber = BuildConfig.VERSION_CODE.toString(),
        downloadUrl = "https://example.com/app.apk",
    )

    @After
    fun tearDown() {
    }

    @Test
    fun silentCheck_whenUpToDate_setsIdle() = runBlocking {
        val repository = object : AppUpdateRepository() {
            override fun fetchManifest(): ApkManifest = currentManifest()
        }
        val viewModel = AppUpdateViewModel(application, repository)

        viewModel.checkForUpdate(userInitiated = false)
        awaitUpdateCheck(viewModel)

        assertEquals(AppUpdateUiState.Idle, viewModel.state.value)
    }

    @Test
    fun userCheck_whenUpToDate_setsCurrent() = runBlocking {
        val repository = object : AppUpdateRepository() {
            override fun fetchManifest(): ApkManifest = currentManifest()
        }
        val viewModel = AppUpdateViewModel(application, repository)

        viewModel.checkForUpdate(userInitiated = true)
        awaitUpdateCheck(viewModel)

        val state = viewModel.state.value
        assertTrue(state is AppUpdateUiState.Current)
    }

    @Test
    fun userCheck_whenRemoteIsNewer_setsAvailable() = runBlocking {
        val repository = object : AppUpdateRepository() {
            override fun fetchManifest(): ApkManifest = ApkManifest(
                version = "9.9.9",
                buildNumber = "999",
                downloadUrl = "https://example.com/app.apk",
                sha256 = "abc",
            )
        }
        val viewModel = AppUpdateViewModel(application, repository)

        viewModel.checkForUpdate(userInitiated = true)
        awaitUpdateCheck(viewModel)

        val state = viewModel.state.value
        assertTrue(state is AppUpdateUiState.Available)
        assertEquals("9.9.9", (state as AppUpdateUiState.Available).remote.version)
    }

    @Test
    fun silentCheck_onFailure_setsIdle() = runBlocking {
        val repository = object : AppUpdateRepository() {
            override fun fetchManifest(): ApkManifest = error("network down")
        }
        val viewModel = AppUpdateViewModel(application, repository)

        viewModel.checkForUpdate(userInitiated = false)
        awaitUpdateCheck(viewModel)

        assertEquals(AppUpdateUiState.Idle, viewModel.state.value)
    }

    @Test
    fun userCheck_onFailure_setsError() = runBlocking {
        val repository = object : AppUpdateRepository() {
            override fun fetchManifest(): ApkManifest = error("network down")
        }
        val viewModel = AppUpdateViewModel(application, repository)

        viewModel.checkForUpdate(userInitiated = true)
        awaitUpdateCheck(viewModel)

        assertTrue(viewModel.state.value is AppUpdateUiState.Error)
    }
}
