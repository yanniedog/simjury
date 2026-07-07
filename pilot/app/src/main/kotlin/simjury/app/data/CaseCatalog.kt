package simjury.app.data

import android.content.res.AssetManager

object CaseCatalog {

    fun listFromAssets(assets: AssetManager): List<String> =
        assets.list("cases")
            ?.filter { it.startsWith("c_") }
            ?.sorted()
            .orEmpty()
}
