package simjury.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import simjury.app.R
import simjury.app.update.AppUpdateUiState

@Composable
fun AppUpdateBanner(
    state: AppUpdateUiState,
    onUpdate: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (state) {
        is AppUpdateUiState.Available -> {
            UpdateSurface(modifier) {
                Text(
                    stringResource(R.string.update_available, state.remote.version, state.remote.buildNumber),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = onUpdate) {
                        Text(stringResource(R.string.update_download_install))
                    }
                    TextButton(onClick = onDismiss) {
                        Text(stringResource(R.string.update_later))
                    }
                }
            }
        }
        is AppUpdateUiState.Downloading -> {
            UpdateSurface(modifier) {
                Text(stringResource(R.string.update_downloading), style = MaterialTheme.typography.bodyMedium)
                LinearProgressIndicator(
                    progress = { state.progress },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        is AppUpdateUiState.ReadyToInstall -> {
            UpdateSurface(modifier) {
                Text(stringResource(R.string.update_ready), style = MaterialTheme.typography.bodyMedium)
                Button(onClick = onUpdate) {
                    Text(stringResource(R.string.update_retry_install))
                }
            }
        }
        is AppUpdateUiState.Error -> {
            UpdateSurface(modifier) {
                Text(state.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                TextButton(onClick = onDismiss) {
                    Text(stringResource(R.string.update_dismiss))
                }
            }
        }
        else -> Unit
    }
}

@Composable
private fun UpdateSurface(modifier: Modifier, content: @Composable () -> Unit) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.secondaryContainer,
        tonalElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            content()
        }
    }
}
