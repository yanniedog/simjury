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

    private fun currentManifest(): ApkManifest {
        val pm = application.packageManager
        val pkg = application.packageName
        val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(pkg, 0)
        }
        val versionName = info.versionName ?: "0.0.0"
        val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.longVersionCode.toInt()
        } else {
            @Suppress("DEPRECATION")
            info.versionCode
        }
        return ApkManifest(
            version = versionName,
            buildNumber = versionCode.toString(),
            downloadUrl = "https://example.com/app.apk",
        )
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
