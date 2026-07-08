package simjury.app.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.Balance
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import simjury.app.R
import java.util.Locale

@Composable
fun kindLabel(kind: String): String = when (kind.lowercase(Locale.ROOT)) {
    "examination" -> stringResource(R.string.kind_examination)
    "cross" -> stringResource(R.string.kind_cross)
    "exhibit" -> stringResource(R.string.kind_exhibit)
    "direction" -> stringResource(R.string.kind_direction)
    else -> kind.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.ROOT) else it.toString() }
}

fun kindIcon(kind: String): ImageVector = when (kind.lowercase(Locale.ROOT)) {
    "examination", "cross" -> Icons.Outlined.Person
    "exhibit" -> Icons.Outlined.Description
    "direction" -> Icons.Outlined.Balance
    else -> Icons.AutoMirrored.Outlined.MenuBook
}

@Composable
fun LoadingContent(message: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(40.dp),
            color = MaterialTheme.colorScheme.primary,
            strokeWidth = 3.dp,
        )
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
fun ReadingProgressBar(read: Int, total: Int, modifier: Modifier = Modifier) {
    if (total <= 0) return
    val target = read.toFloat() / total.toFloat()
    val progress by animateFloatAsState(targetValue = target, animationSpec = tween(400), label = "progress")
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                stringResource(R.string.reading_progress_label),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                stringResource(R.string.reading_progress_count, read, total),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.primary,
            trackColor = MaterialTheme.colorScheme.surfaceVariant,
        )
    }
}

@Composable
fun KindBadge(kind: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.primaryContainer,
    ) {
        Text(
            text = kindLabel(kind).uppercase(Locale.ROOT),
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
    }
}

@Composable
fun WarningBanner(text: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.secondaryContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                imageVector = Icons.Outlined.Warning,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )
            Text(text = text, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun SummonsSeal(modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.size(72.dp),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.primaryContainer,
        border = BorderStroke(2.dp, MaterialTheme.colorScheme.primary),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = Icons.Outlined.Gavel,
                contentDescription = null,
                modifier = Modifier.size(36.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
fun ChargeBadge(charge: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Text(
            text = stringResource(R.string.charge_label, charge),
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
fun TrialItemCard(
    title: String,
    kind: String,
    isRead: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val containerColor = if (isRead) {
        MaterialTheme.colorScheme.surface
    } else {
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
    }
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = containerColor),
        border = BorderStroke(
            width = 1.dp,
            color = if (isRead) MaterialTheme.colorScheme.outlineVariant else MaterialTheme.colorScheme.outline,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = if (isRead) 0.dp else 2.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = kindIcon(kind),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(24.dp),
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = kindLabel(kind),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(
                imageVector = if (isRead) Icons.Outlined.CheckCircle else Icons.Outlined.RadioButtonUnchecked,
                contentDescription = if (isRead) {
                    stringResource(R.string.item_status_read)
                } else {
                    stringResource(R.string.item_status_unread)
                },
                tint = if (isRead) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                modifier = Modifier.size(22.dp),
            )
        }
    }
}

@Composable
fun RevealLayerCard(heading: String, body: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(heading, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
            Text(body, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

@Composable
fun NameRevealRow(playName: String, realName: String, fateNote: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = playName,
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.weight(0.35f),
        )
        Text(
            text = "→",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.primary,
        )
        Column(modifier = Modifier.weight(0.6f)) {
            Text(realName, style = MaterialTheme.typography.titleSmall)
            if (fateNote.isNotBlank()) {
                Text(
                    fateNote,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
