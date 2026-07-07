package simjury.app.update

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import java.io.File
import java.security.MessageDigest

object ApkSigning {

    fun canInstallOverExisting(context: Context, apkFile: File): Boolean {
        val installed = installedCertificateDigests(context)
        val apk = apkCertificateDigests(context, apkFile) ?: return false
        if (installed.isEmpty()) return apk.isNotEmpty()
        return installed.intersect(apk).isNotEmpty()
    }

    private fun installedCertificateDigests(context: Context): Set<String> {
        val pm = context.packageManager
        val flags = signingFlags()
        val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(flags.toLong()))
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(context.packageName, flags)
        }
        return certificateDigests(info)
    }

    private fun apkCertificateDigests(context: Context, apkFile: File): Set<String>? {
        val pm = context.packageManager
        val flags = signingFlags()
        val archive = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.getPackageArchiveInfo(apkFile.absolutePath, PackageManager.PackageInfoFlags.of(flags.toLong()))
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageArchiveInfo(apkFile.absolutePath, flags)
        } ?: return null
        archive.applicationInfo?.let { appInfo ->
            appInfo.sourceDir = apkFile.absolutePath
            appInfo.publicSourceDir = apkFile.absolutePath
        }
        return certificateDigests(archive)
    }

    private fun signingFlags(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            @Suppress("DEPRECATION")
            PackageManager.GET_SIGNATURES
        }
    }

    private fun certificateDigests(info: PackageInfo): Set<String> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val signingInfo = info.signingInfo ?: return emptySet()
            val signatures = if (signingInfo.hasMultipleSigners()) {
                signingInfo.apkContentsSigners
            } else {
                signingInfo.signingCertificateHistory
            }
            return signatures?.map { digest(it.toByteArray()) }?.toSet() ?: emptySet()
        }
        @Suppress("DEPRECATION")
        return info.signatures?.map { digest(it.toByteArray()) }?.toSet() ?: emptySet()
    }

    private fun digest(bytes: ByteArray): String {
        val hash = MessageDigest.getInstance("SHA-256")
        return hash.digest(bytes).joinToString("") { "%02x".format(it) }
    }
}
