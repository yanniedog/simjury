package simjury.app.update

import android.app.Application
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import simjury.app.R
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
    data class Error(val message: String, val duringDownload: Boolean = false) : AppUpdateUiState
}

class AppUpdateViewModel @JvmOverloads constructor(
    application: Application,
    private val repository: AppUpdateRepository = AppUpdateRepository(),
) : AndroidViewModel(application) {

    companion object {
        fun factory(
            application: Application,
            repository: AppUpdateRepository = AppUpdateRepository(),
        ): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                if (modelClass.isAssignableFrom(AppUpdateViewModel::class.java)) {
                    return AppUpdateViewModel(application, repository) as T
                }
                throw IllegalArgumentException("Unknown ViewModel: $modelClass")
            }
        }
    }

    private val _state = MutableStateFlow<AppUpdateUiState>(AppUpdateUiState.Idle)
    val state: StateFlow<AppUpdateUiState> = _state.asStateFlow()

    private val cacheApk: File
        get() = File(getApplication<Application>().cacheDir, "app-preview-update.apk")

    private var pendingInstallRemote: ApkManifest? = null

    init {
        viewModelScope.launch {
            ApkInstallResultBus.events.collect { result ->
                when (result) {
                    ApkInstallResult.Success -> clearPendingInstall()
                    is ApkInstallResult.Failure -> handleInstallFailure(result)
                }
            }
        }
    }

    fun checkForUpdate(userInitiated: Boolean = true) {
        when (_state.value) {
            is AppUpdateUiState.Checking,
            is AppUpdateUiState.Available,
            is AppUpdateUiState.Downloading,
            is AppUpdateUiState.ReadyToInstall,
            -> return
            else -> Unit
        }
        viewModelScope.launch {
            _state.value = AppUpdateUiState.Checking
            try {
                val installed = readInstalled()
                val remote = withContext(Dispatchers.IO) { repository.fetchManifest() }
                val remoteBuild = remote.buildNumber.toIntOrNull() ?: 0
                if (VersionCompare.remoteIsNewer(installed.versionName, installed.versionCode, remote.version, remoteBuild)) {
                    _state.value = AppUpdateUiState.Available(installed.versionName, installed.versionCode, remote)
                } else if (userInitiated) {
                    _state.value = AppUpdateUiState.Current(installed.versionName)
                } else {
                    _state.value = AppUpdateUiState.Idle
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (userInitiated) {
                    _state.value = AppUpdateUiState.Error(e.message ?: "Update check failed")
                } else {
                    _state.value = AppUpdateUiState.Idle
                }
            }
        }
    }

    fun installPending() {
        val ready = _state.value as? AppUpdateUiState.ReadyToInstall ?: return
        launchInstall(ready.apkFile, ready.remote)
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
                launchInstall(cacheApk, available.remote)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _state.value = AppUpdateUiState.Error(e.message ?: "Download failed", duringDownload = true)
            }
        }
    }

    fun dismiss() {
        pendingInstallRemote = null
        _state.value = AppUpdateUiState.Idle
    }

    private fun launchInstall(apkFile: File, remote: ApkManifest) {
        val app = getApplication<Application>()
        if (!ApkSigning.canInstallOverExisting(app, apkFile)) {
            pendingInstallRemote = null
            _state.value = AppUpdateUiState.Error(
                app.getString(R.string.update_signature_mismatch),
                duringDownload = true,
            )
            return
        }
        try {
            pendingInstallRemote = remote
            ApkInstaller.installApk(app, apkFile)
            _state.value = AppUpdateUiState.ReadyToInstall(apkFile, remote)
        } catch (e: Exception) {
            pendingInstallRemote = null
            _state.value = AppUpdateUiState.Error(
                e.message ?: app.getString(R.string.update_install_failed),
                duringDownload = true,
            )
        }
    }

    private fun handleInstallFailure(result: ApkInstallResult.Failure) {
        pendingInstallRemote = null
        val app = getApplication<Application>()
        val message = when (result.status) {
            PackageInstaller.STATUS_FAILURE_ABORTED ->
                app.getString(R.string.update_install_aborted)
            PackageInstaller.STATUS_FAILURE_INCOMPATIBLE,
            PackageInstaller.STATUS_FAILURE_CONFLICT,
            ->
                app.getString(R.string.update_signature_mismatch)
            else -> result.message.takeIf { it.isNotBlank() }
                ?: app.getString(R.string.update_install_failed)
        }
        _state.value = AppUpdateUiState.Error(message, duringDownload = true)
    }

    private fun clearPendingInstall() {
        pendingInstallRemote = null
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
