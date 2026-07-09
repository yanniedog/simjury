package simjury.app

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import simjury.app.data.CaseCatalog

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class CaseCatalogTest {

    @Test
    fun listEntriesFromAssets_discoversC000AndC001UnderRobolectric() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        val ids = CaseCatalog.listFromAssets(app.assets)
        assertTrue("expected c_000 in $ids", "c_000" in ids)
        assertTrue("expected c_001 in $ids", "c_001" in ids)
        assertEquals(ids, ids.sorted())

        val entries = CaseCatalog.listEntriesFromAssets(app.assets)
        assertEquals("The Pocket Watch", entries.first { it.id == "c_000" }.titlePlay)
        assertEquals("The List", entries.first { it.id == "c_001" }.titlePlay)
    }
}
