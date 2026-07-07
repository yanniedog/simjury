package simjury.app.update

import android.content.pm.PackageInstaller
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ApkInstallResultTest {

    @Test
    fun from_success_mapsToSuccess() {
        val result = ApkInstallResult.from(PackageInstaller.STATUS_SUCCESS, null)
        assertTrue(result is ApkInstallResult.Success)
    }

    @Test
    fun from_failure_mapsToFailure() {
        val result = ApkInstallResult.from(
            PackageInstaller.STATUS_FAILURE_INCOMPATIBLE,
            "INSTALL_FAILED_UPDATE_INCOMPATIBLE",
        )
        assertTrue(result is ApkInstallResult.Failure)
        assertEquals(
            PackageInstaller.STATUS_FAILURE_INCOMPATIBLE,
            (result as ApkInstallResult.Failure).status,
        )
    }
}
