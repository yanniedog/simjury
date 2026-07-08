package simjury.app.ui

import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import simjury.app.model.ExhibitMediaItem

@Composable
fun ExhibitMediaPanel(
    media: List<ExhibitMediaItem>,
    modifier: Modifier = Modifier,
) {
    if (media.isEmpty()) return

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        media.forEach { item ->
            when (item.type) {
                "image" -> ExhibitImage(item)
                "audio" -> ExhibitAudio(item)
            }
        }
    }
}

@Composable
private fun ExhibitImage(item: ExhibitMediaItem) {
    val context = LocalContext.current
    val description = item.altText.ifBlank { item.caption.ifBlank { "Exhibit image" } }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data("file:///android_asset/${item.assetPath}")
                    .crossfade(true)
                    .build(),
                contentDescription = description,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 480.dp)
                    .semantics { contentDescription = description },
                contentScale = ContentScale.FillWidth,
            )
            if (item.caption.isNotBlank()) {
                Text(
                    text = item.caption,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun ExhibitAudio(item: ExhibitMediaItem) {
    val context = LocalContext.current
    val mainHandler = remember { Handler(Looper.getMainLooper()) }
    var playing by remember(item.assetPath) { mutableStateOf(false) }
    var player by remember(item.assetPath) { mutableStateOf<MediaPlayer?>(null) }
    var loadFailed by remember(item.assetPath) { mutableStateOf(false) }

    LaunchedEffect(item.assetPath) {
        playing = false
        player?.let { existing ->
            runCatching {
                if (existing.isPlaying) existing.stop()
            }
            existing.release()
        }
        player = null
        loadFailed = false
        val created = withContext(Dispatchers.IO) {
            runCatching {
                MediaPlayer().apply {
                    val descriptor = context.assets.openFd(item.assetPath)
                    setDataSource(descriptor.fileDescriptor, descriptor.startOffset, descriptor.length)
                    descriptor.close()
                    prepare()
                    setOnCompletionListener { mainHandler.post { playing = false } }
                }
            }.getOrNull()
        }
        if (created == null) {
            loadFailed = true
        } else {
            player = created
        }
    }

    DisposableEffect(item.assetPath) {
        onDispose {
            player?.let { active ->
                runCatching {
                    if (active.isPlaying) active.stop()
                }
                active.release()
            }
            player = null
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            IconButton(
                onClick = {
                    val active = player ?: return@IconButton
                    if (playing) {
                        runCatching {
                            active.pause()
                            active.seekTo(0)
                        }
                        playing = false
                    } else {
                        runCatching {
                            active.start()
                            playing = true
                        }
                    }
                },
                enabled = player != null && !loadFailed,
            ) {
                Icon(
                    imageVector = if (playing) Icons.Outlined.Stop else Icons.Outlined.PlayArrow,
                    contentDescription = if (playing) "Stop audio" else "Play audio",
                )
            }
            val label = when {
                loadFailed -> "Audio unavailable"
                item.caption.isNotBlank() -> item.caption
                else -> "Court audio"
            }
            Text(label, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
