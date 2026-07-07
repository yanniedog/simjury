package simjury.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
fun AppUpdateCheckSection(
    installedVersion: String,
    state: AppUpdateUiState,
    onCheckForUpdate: () -> Unit,
    onDismissStatus: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            stringResource(R.string.update_section_title),
            style = MaterialTheme.typography.titleSmall,
        )
        Text(
            stringResource(R.string.update_installed_version, installedVersion),
            style = MaterialTheme.typography.bodyMedium,
        )
        when (state) {
            AppUpdateUiState.Checking -> {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(modifier = Modifier.padding(4.dp))
                    Text(
                        stringResource(R.string.update_checking),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
            is AppUpdateUiState.Current -> {
                Text(
                    stringResource(R.string.update_current, state.version),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                TextButton(onClick = onDismissStatus) {
                    Text(stringResource(R.string.update_dismiss))
                }
            }
            is AppUpdateUiState.Error -> {
                if (state.duringDownload) return@Column
                Text(
                    state.message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onCheckForUpdate) {
                        Text(stringResource(R.string.update_check_again))
                    }
                    TextButton(onClick = onDismissStatus) {
                        Text(stringResource(R.string.update_dismiss))
                    }
                }
            }
            else -> {
                Button(
                    onClick = onCheckForUpdate,
                    enabled = state is AppUpdateUiState.Idle,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.update_check))
                }
            }
        }
    }
}
