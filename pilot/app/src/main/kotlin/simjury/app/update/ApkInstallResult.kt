package simjury.app.update

import android.content.pm.PackageInstaller

sealed interface ApkInstallResult {
    data object Success : ApkInstallResult
    data class Failure(val status: Int, val message: String) : ApkInstallResult

    companion object {
        fun from(status: Int, message: String?): ApkInstallResult {
            return if (status == PackageInstaller.STATUS_SUCCESS) {
                Success
            } else {
                Failure(status, message?.trim().orEmpty())
            }
        }
    }
}
