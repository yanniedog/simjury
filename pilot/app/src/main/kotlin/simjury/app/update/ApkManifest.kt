package simjury.app.update

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ApkManifest(
    @SerialName("schema_version") val schemaVersion: Int = 1,
    val version: String,
    @SerialName("build_number") val buildNumber: String,
    @SerialName("download_url") val downloadUrl: String,
    val sha256: String? = null,
    val bytes: Long? = null,
    @SerialName("published_at") val publishedAt: String? = null,
    val repo: String? = null,
    val tag: String? = null,
)
