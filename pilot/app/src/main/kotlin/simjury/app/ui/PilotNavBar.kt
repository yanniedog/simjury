package simjury.app.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.automirrored.outlined.Note
import androidx.compose.material.icons.outlined.Balance
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import simjury.app.PilotNavTarget
import simjury.app.PilotSection
import simjury.app.R

@Composable
fun PilotNavBar(
    targets: List<PilotNavTarget>,
    onNavigate: (PilotSection) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (targets.isEmpty()) return
    NavigationBar(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.surface,
        contentColor = MaterialTheme.colorScheme.onSurface,
    ) {
        targets.forEach { target ->
            NavigationBarItem(
                selected = target.selected,
                onClick = { if (target.enabled) onNavigate(target.section) },
                enabled = target.enabled,
                icon = {
                    Icon(
                        imageVector = iconFor(target.section),
                        contentDescription = stringResource(labelFor(target.section)),
                    )
                },
                label = { Text(stringResource(labelFor(target.section))) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.primary,
                    selectedTextColor = MaterialTheme.colorScheme.primary,
                    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                ),
            )
        }
    }
}

private fun iconFor(section: PilotSection): ImageVector = when (section) {
    PilotSection.SUMMONS -> Icons.Outlined.Gavel
    PilotSection.EVIDENCE -> Icons.AutoMirrored.Outlined.MenuBook
    PilotSection.DIARY -> Icons.AutoMirrored.Outlined.Note
    PilotSection.VOTE -> Icons.Outlined.Balance
    PilotSection.REVEAL -> Icons.Outlined.Visibility
}

private fun labelFor(section: PilotSection): Int = when (section) {
    PilotSection.SUMMONS -> R.string.nav_summons
    PilotSection.EVIDENCE -> R.string.nav_evidence
    PilotSection.DIARY -> R.string.nav_diary
    PilotSection.VOTE -> R.string.nav_vote
    PilotSection.REVEAL -> R.string.nav_reveal
}
