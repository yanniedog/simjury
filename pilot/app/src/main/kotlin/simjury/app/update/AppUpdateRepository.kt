package simjury.app.update

import kotlinx.serialization.json.Json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield
import okhttp3.OkHttpClient
import okhttp3.Request
import simjury.app.BuildConfig

open class AppUpdateRepository(
    private val client: OkHttpClient = OkHttpClient(),
    private val manifestUrl: String = BuildConfig.APK_MANIFEST_URL,
    private val json: Json = Json { ignoreUnknownKeys = true },
) {

    open fun fetchManifest(): ApkManifest {
        val url = "${manifestUrl.trimEnd('/')}?_=${System.currentTimeMillis()}"
        val request = Request.Builder().url(url).get().build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                error("APK manifest HTTP ${response.code}")
            }
            val body = response.body?.string() ?: error("Empty manifest body")
            val manifest = json.decodeFromString(ApkManifest.serializer(), body)
            require(manifest.version.isNotBlank()) { "manifest.version missing" }
            require(manifest.buildNumber.isNotBlank()) { "manifest.build_number missing" }
            require(manifest.downloadUrl.startsWith("https://")) { "manifest.download_url must be https" }
            return manifest
        }
    }

    suspend fun downloadApk(
        url: String,
        destination: java.io.File,
        onProgress: (Float) -> Unit = {},
    ) = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url).get().build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("APK download HTTP ${response.code}")
            val body = response.body ?: error("Empty APK body")
            val total = body.contentLength().coerceAtLeast(1L)
            destination.outputStream().use { out ->
                body.byteStream().use { input ->
                    val buffer = ByteArray(8192)
                    var read: Int
                    var written = 0L
                    var lastReported = -1f
                    while (input.read(buffer).also { read = it } != -1) {
                        yield()
                        out.write(buffer, 0, read)
                        written += read
                        val progress = (written.toFloat() / total.toFloat()).coerceIn(0f, 1f)
                        if (progress - lastReported >= 0.01f || progress >= 1f) {
                            lastReported = progress
                            onProgress(progress)
                        }
                    }
                }
            }
        }
    }
}
