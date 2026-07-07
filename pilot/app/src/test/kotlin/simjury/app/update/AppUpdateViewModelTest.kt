package simjury.app.update

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], manifest = Config.NONE)
class AppUpdateViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private lateinit var application: Application

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        application = ApplicationProvider.getApplicationContext()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun silentCheck_whenUpToDate_setsIdle() = runTest(dispatcher) {
        val repository = object : AppUpdateRepository() {
            override fun fetchManifest(): ApkManifest = ApkManifest(
                version = "0.0.0",
                buildNumber = "0",
                downloadUrl = "https://example.com/app.apk",
            )
        }
        val viewModel = AppUpdateViewModel(application, repository)

        viewModel.checkForUpdate(userInitiated = false)
        advanceUntilIdle()

        assertEquals(AppUpdateUiState.Idle, viewModel.state.value)
    }

    @Test
    fun userCheck_whenUpToDate_setsCurrent() = runTest(dispatcher) {
        val repository = object : AppUpdateRepository() {
            override fun fetchManifest(): ApkManifest = ApkManifest(
                version = "0.0.0",
                buildNumber = "0",
                downloadUrl = "https://example.com/app.apk",
            )
        }
        val viewModel = AppUpdateViewModel(application, repository)

        viewModel.checkForUpdate(userInitiated = true)
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue(state is AppUpdateUiState.Current)
    }

    @Test
    fun userCheck_whenRemoteIsNewer_setsAvailable() = runTest(dispatcher) {
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
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue(state is AppUpdateUiState.Available)
        assertEquals("9.9.9", (state as AppUpdateUiState.Available).remote.version)
    }

    @Test
    fun silentCheck_onFailure_setsIdle() = runTest(dispatcher) {
        val repository = object : AppUpdateRepository() {
            override fun fetchManifest(): ApkManifest = error("network down")
        }
        val viewModel = AppUpdateViewModel(application, repository)

        viewModel.checkForUpdate(userInitiated = false)
        advanceUntilIdle()

        assertEquals(AppUpdateUiState.Idle, viewModel.state.value)
    }

    @Test
    fun userCheck_onFailure_setsError() = runTest(dispatcher) {
        val repository = object : AppUpdateRepository() {
            override fun fetchManifest(): ApkManifest = error("network down")
        }
        val viewModel = AppUpdateViewModel(application, repository)

        viewModel.checkForUpdate(userInitiated = true)
        advanceUntilIdle()

        assertTrue(viewModel.state.value is AppUpdateUiState.Error)
    }
}
