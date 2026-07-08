package simjury.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material.icons.outlined.VolumeUp
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import simjury.app.R

@Composable
fun ListenAloudBar(
    isSpeaking: Boolean,
    enabled: Boolean,
    onListen: () -> Unit,
    onStop: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (isSpeaking) {
            OutlinedButton(
                onClick = onStop,
                modifier = Modifier.weight(1f),
            ) {
                Icon(Icons.Outlined.Stop, contentDescription = null)
                Text(
                    stringResource(R.string.listen_stop),
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        } else {
            FilledTonalButton(
                onClick = onListen,
                enabled = enabled,
                modifier = Modifier.weight(1f),
            ) {
                Icon(Icons.Outlined.VolumeUp, contentDescription = null)
                Text(
                    stringResource(R.string.listen_aloud),
                    modifier = Modifier.padding(start = 8.dp),
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }
    }
}

@Composable
fun ItemNavigationBar(
    hasPrevious: Boolean,
    hasNext: Boolean,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedButton(
            onClick = onPrevious,
            enabled = hasPrevious,
            modifier = Modifier.weight(1f),
        ) {
            Text(stringResource(R.string.nav_previous_item))
        }
        OutlinedButton(
            onClick = onNext,
            enabled = hasNext,
            modifier = Modifier.weight(1f),
        ) {
            Text(stringResource(R.string.nav_next_item))
        }
    }
}
