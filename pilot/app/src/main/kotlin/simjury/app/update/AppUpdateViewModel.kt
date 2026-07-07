package simjury.app.update

import android.app.Application
import android.content.pm.PackageManager
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

sealed interface AppUpdateUiState {
    data object Idle : AppUpdateUiState
    data object Checking : AppUpdateUiState
    data class Current(val version: String) : AppUpdateUiState
    data class Available(
        val installedVersion: String,
        val installedBuild: Int,
        val remote: ApkManifest,
    ) : AppUpdateUiState
    data class Downloading(val progress: Float, val remote: ApkManifest) : AppUpdateUiState
    data class ReadyToInstall(val apkFile: File, val remote: ApkManifest) : AppUpdateUiState
    data class Error(val message: String) : AppUpdateUiState
}

class AppUpdateViewModel(
    application: Application,
    private val repository: AppUpdateRepository = AppUpdateRepository(),
) : AndroidViewModel(application) {

    private val _state = MutableStateFlow<AppUpdateUiState>(AppUpdateUiState.Idle)
    val state: StateFlow<AppUpdateUiState> = _state.asStateFlow()

    private val cacheApk: File
        get() = File(getApplication<Application>().cacheDir, "app-preview-update.apk")

    fun checkForUpdate() {
        if (_state.value !is AppUpdateUiState.Idle && _state.value !is AppUpdateUiState.Current) return
        viewModelScope.launch {
            _state.value = AppUpdateUiState.Checking
            try {
                val installed = readInstalled()
                val remote = withContext(Dispatchers.IO) { repository.fetchManifest() }
                val remoteBuild = remote.buildNumber.toIntOrNull() ?: 0
                if (VersionCompare.remoteIsNewer(installed.versionName, installed.versionCode, remote.version, remoteBuild)) {
                    _state.value = AppUpdateUiState.Available(installed.versionName, installed.versionCode, remote)
                } else {
                    _state.value = AppUpdateUiState.Current(installed.versionName)
                }
            } catch (e: Exception) {
                _state.value = AppUpdateUiState.Error(e.message ?: "Update check failed")
            }
        }
    }

    fun installPending() {
        val ready = _state.value as? AppUpdateUiState.ReadyToInstall ?: return
        ApkInstaller.installApk(getApplication(), ready.apkFile)
    }

    fun downloadAndInstall() {
        val available = _state.value as? AppUpdateUiState.Available ?: return
        viewModelScope.launch {
            try {
                _state.value = AppUpdateUiState.Downloading(0f, available.remote)
                withContext(Dispatchers.IO) {
                    if (cacheApk.exists()) cacheApk.delete()
                    repository.downloadApk(available.remote.downloadUrl, cacheApk) { progress ->
                        _state.value = AppUpdateUiState.Downloading(progress, available.remote)
                    }
                    val expected = available.remote.sha256?.takeIf { it.isNotBlank() }
                        ?: error("APK manifest missing sha256 checksum")
                    val actual = ApkInstaller.sha256Hex(cacheApk)
                    check(actual.equals(expected, ignoreCase = true)) {
                        "APK checksum mismatch"
                    }
                }
                _state.value = AppUpdateUiState.ReadyToInstall(cacheApk, available.remote)
                ApkInstaller.installApk(getApplication(), cacheApk)
            } catch (e: Exception) {
                _state.value = AppUpdateUiState.Error(e.message ?: "Download failed")
            }
        }
    }

    fun dismiss() {
        _state.value = AppUpdateUiState.Idle
    }

    private fun readInstalled(): InstalledInfo {
        val pm = getApplication<Application>().packageManager
        val pkg = getApplication<Application>().packageName
        val info = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(pkg, 0)
        }
        return InstalledInfo(
            versionName = info.versionName ?: "0.0.0",
            versionCode = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                info.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                info.versionCode
            },
        )
    }

    private data class InstalledInfo(val versionName: String, val versionCode: Int)
}
