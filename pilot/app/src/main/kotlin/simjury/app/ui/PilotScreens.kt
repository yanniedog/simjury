package simjury.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import java.util.Locale
import simjury.app.PilotUiState
import simjury.app.R
import simjury.app.model.TrialItem
import simjury.deliberation.DeliberationPhase

@Composable
fun PilotAppShell(
    state: PilotUiState,
    allItemsRead: Boolean,
    onAcknowledgeSummons: () -> Unit,
    onOpenItem: (String) -> Unit,
    onCloseItem: () -> Unit,
    onMarkItemRead: (String) -> Unit,
    onOpenDiary: () -> Unit,
    onCommitDiary: (String, String, String) -> Unit,
    onCastVote: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    when {
        state.loading -> LoadingScreen(modifier)
        state.error != null -> ErrorScreen(state.error, modifier)
        state.selectedItem != null -> ItemDetailScreen(
            item = state.selectedItem,
            onContinue = { onMarkItemRead(state.selectedItem.id) },
            onBack = onCloseItem,
            modifier = modifier,
        )
        state.phase == DeliberationPhase.SUMMONS -> SummonsScreen(
            state = state,
            onEnter = onAcknowledgeSummons,
            modifier = modifier,
        )
        state.phase == DeliberationPhase.READING -> ReadingHubScreen(
            state = state,
            allItemsRead = allItemsRead,
            onOpenItem = onOpenItem,
            onOpenDiary = onOpenDiary,
            modifier = modifier,
        )
        state.phase == DeliberationPhase.DIARY -> DiaryScreen(onCommit = onCommitDiary, modifier = modifier)
        state.phase == DeliberationPhase.VOTE -> VoteScreen(onVote = onCastVote, modifier = modifier)
        state.phase == DeliberationPhase.REVEAL || state.phase == DeliberationPhase.COMPLETE ->
            RevealScreen(state = state, modifier = modifier)
    }
}

@Composable
private fun LoadingScreen(modifier: Modifier = Modifier) {
    CenteredText(stringResource(R.string.loading_case), modifier)
}

@Composable
private fun ErrorScreen(message: String, modifier: Modifier = Modifier) {
    CenteredText(message, modifier)
}

@Composable
private fun CenteredText(text: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
fun SummonsScreen(state: PilotUiState, onEnter: () -> Unit, modifier: Modifier = Modifier) {
    ScreenScaffold(title = stringResource(R.string.summons_title), modifier = modifier) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(state.caseTitle, style = MaterialTheme.typography.headlineMedium)
            Text(stringResource(R.string.charge_label, state.charge), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.summons_body), style = MaterialTheme.typography.bodyLarge)
            state.contentNotes.forEach { Text(it, style = MaterialTheme.typography.bodyMedium) }
            Button(onClick = onEnter, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.enter_courtroom))
            }
        }
    }
}

@Composable
fun ReadingHubScreen(
    state: PilotUiState,
    allItemsRead: Boolean,
    onOpenItem: (String) -> Unit,
    onOpenDiary: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ScreenScaffold(title = state.episodeTitle, modifier = modifier) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Text(state.episodeIntro, modifier = Modifier.padding(vertical = 12.dp))
            }
            items(state.itemOrder, key = { it }) { itemId ->
                val read = itemId in state.itemsRead
                Card(
                    modifier = Modifier.fillMaxWidth().clickable { onOpenItem(itemId) },
                ) {
                    Text(
                        text = if (read) stringResource(R.string.item_read, itemId)
                        else stringResource(R.string.item_unread, itemId),
                        modifier = Modifier.padding(16.dp),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            }
            item {
                if (allItemsRead) {
                    Button(
                        onClick = onOpenDiary,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    ) {
                        Text(stringResource(R.string.open_diary))
                    }
                } else {
                    Text(stringResource(R.string.read_all_items_hint), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
fun ItemDetailScreen(item: TrialItem, onContinue: () -> Unit, onBack: () -> Unit, modifier: Modifier = Modifier) {
    ScreenScaffold(title = item.title, modifier = modifier) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(item.kind.uppercase(Locale.ROOT), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Text(item.body, style = MaterialTheme.typography.bodyLarge)
            if (item.subtitle.isNotBlank()) {
                Text(item.subtitle, style = MaterialTheme.typography.bodyMedium)
            }
            Button(onClick = onContinue, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.mark_read_continue))
            }
            Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.back_to_hub))
            }
        }
    }
}

@Composable
fun DiaryScreen(onCommit: (String, String, String) -> Unit, modifier: Modifier = Modifier) {
    var leaning by rememberSaveable { mutableStateOf("G") }
    var reason by rememberSaveable { mutableStateOf("") }
    var doubt by rememberSaveable { mutableStateOf("") }
    val canCommit = reason.length >= 10 && doubt.length >= 10

    ScreenScaffold(title = stringResource(R.string.diary_title), modifier = modifier) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.diary_permanent_warning), style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(
                    "G" to stringResource(R.string.diary_leaning_guilty),
                    "NG" to stringResource(R.string.diary_leaning_not_guilty),
                    "U" to stringResource(R.string.diary_leaning_undecided),
                ).forEach { (code, label) ->
                    FilterChip(
                        selected = leaning == code,
                        onClick = { leaning = code },
                        label = { Text(label) },
                    )
                }
            }
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it },
                label = { Text(stringResource(R.string.diary_reason_label)) },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = doubt,
                onValueChange = { doubt = it },
                label = { Text(stringResource(R.string.diary_doubt_label)) },
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = { onCommit(leaning, reason, doubt) },
                enabled = canCommit,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.commit_diary))
            }
        }
    }
}

@Composable
fun VoteScreen(onVote: (String) -> Unit, modifier: Modifier = Modifier) {
    ScreenScaffold(title = stringResource(R.string.vote_title), modifier = modifier) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.vote_instruction), style = MaterialTheme.typography.bodyLarge)
            Button(onClick = { onVote("Guilty") }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.vote_guilty))
            }
            Button(onClick = { onVote("Not Guilty") }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.vote_not_guilty))
            }
        }
    }
}

@Composable
fun RevealScreen(state: PilotUiState, modifier: Modifier = Modifier) {
    ScreenScaffold(title = stringResource(R.string.reveal_title), modifier = modifier) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                state.revealTitle ?: stringResource(R.string.reveal_title),
                style = MaterialTheme.typography.headlineSmall,
            )
            state.revealLayers.forEach { layer ->
                Text(layer.heading, style = MaterialTheme.typography.titleMedium)
                Text(layer.body, style = MaterialTheme.typography.bodyLarge)
            }
            if (state.revealNames.isNotEmpty()) {
                Text(stringResource(R.string.names_restored), style = MaterialTheme.typography.titleMedium)
                state.revealNames.forEach { row ->
                    Text("${row.playName} → ${row.realName} (${row.fateNote})")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ScreenScaffold(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable (PaddingValues) -> Unit,
) {
    Scaffold(
        modifier = modifier,
        topBar = { TopAppBar(title = { Text(title) }) },
        containerColor = MaterialTheme.colorScheme.background,
        content = content,
    )
}
