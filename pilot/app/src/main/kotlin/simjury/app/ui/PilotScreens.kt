package simjury.app.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import simjury.app.PilotUiState
import simjury.app.R
import simjury.app.model.TrialItem
import simjury.app.update.AppUpdateUiState
import simjury.deliberation.DeliberationPhase

private const val DIARY_MIN_CHARS = 10

@Composable
fun PilotAppShell(
    state: PilotUiState,
    onAcknowledgeSummons: () -> Unit,
    onSelectEpisode: (String) -> Unit,
    onBackToEpisodeHub: () -> Unit,
    onSelectCase: (String) -> Unit,
    onOpenItem: (String) -> Unit,
    onCloseItem: () -> Unit,
    onMarkItemRead: (String) -> Unit,
    onOpenDiary: () -> Unit,
    onCommitDiary: (String, String, String) -> Unit,
    onCastVote: (String) -> Unit,
    installedVersion: String,
    updateState: AppUpdateUiState,
    onCheckForUpdate: () -> Unit,
    onDismissUpdateStatus: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val screenKey = when {
        state.loading -> "loading"
        state.error != null -> "error"
        state.selectedItem != null -> "item"
        else -> state.phase.name
    }
    AnimatedContent(
        targetState = screenKey,
        modifier = modifier,
        transitionSpec = { fadeIn() togetherWith fadeOut() },
        label = "pilot_screen",
    ) { _ ->
        when {
            state.loading -> LoadingScreen(modifier = Modifier.fillMaxSize())
            state.error != null -> ErrorScreen(state.error, modifier = Modifier.fillMaxSize())
            state.selectedItem != null -> ItemDetailScreen(
                item = state.selectedItem,
                onContinue = { onMarkItemRead(state.selectedItem.id) },
                onBack = onCloseItem,
                modifier = Modifier.fillMaxSize(),
            )
            state.phase == DeliberationPhase.SUMMONS -> SummonsScreen(
                state = state,
                onEnter = onAcknowledgeSummons,
                onSelectCase = onSelectCase,
                installedVersion = installedVersion,
                updateState = updateState,
                onCheckForUpdate = onCheckForUpdate,
                onDismissUpdateStatus = onDismissUpdateStatus,
                modifier = Modifier.fillMaxSize(),
            )
            state.phase == DeliberationPhase.READING && state.showEpisodeHub -> EpisodeHubScreen(
                state = state,
                onSelectEpisode = onSelectEpisode,
                onOpenDiary = onOpenDiary,
                modifier = Modifier.fillMaxSize(),
            )
            state.phase == DeliberationPhase.READING -> ReadingHubScreen(
                state = state,
                onOpenItem = onOpenItem,
                onOpenDiary = onOpenDiary,
                onBackToEpisodeHub = if (state.episodes.size > 1) onBackToEpisodeHub else null,
                modifier = Modifier.fillMaxSize(),
            )
            state.phase == DeliberationPhase.DIARY -> DiaryScreen(
                onCommit = onCommitDiary,
                modifier = Modifier.fillMaxSize(),
            )
            state.phase == DeliberationPhase.VOTE -> VoteScreen(
                onVote = onCastVote,
                modifier = Modifier.fillMaxSize(),
            )
            state.phase == DeliberationPhase.REVEAL || state.phase == DeliberationPhase.COMPLETE ->
                RevealScreen(state = state, modifier = Modifier.fillMaxSize())
        }
    }
}

@Composable
private fun LoadingScreen(modifier: Modifier = Modifier) {
    ScreenScaffold(title = stringResource(R.string.app_name), modifier = modifier) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            LoadingContent(stringResource(R.string.loading_case))
        }
    }
}

@Composable
private fun ErrorScreen(message: String, modifier: Modifier = Modifier) {
    ScreenScaffold(title = stringResource(R.string.app_name), modifier = modifier) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
fun SummonsScreen(
    state: PilotUiState,
    onEnter: () -> Unit,
    onSelectCase: (String) -> Unit,
    installedVersion: String,
    updateState: AppUpdateUiState,
    onCheckForUpdate: () -> Unit,
    onDismissUpdateStatus: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ScreenScaffold(title = stringResource(R.string.summons_title), modifier = modifier) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Spacer(modifier = Modifier.height(8.dp))
            SummonsSeal()
            Text(
                state.caseTitle,
                style = MaterialTheme.typography.headlineMedium,
                textAlign = TextAlign.Center,
            )
            ChargeBadge(charge = state.charge)
            Text(
                stringResource(R.string.summons_body),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            state.contentNotes.forEach { note ->
                Text(note, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (state.showCasePicker) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Text(stringResource(R.string.case_picker_label), style = MaterialTheme.typography.titleSmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    state.availableCases.forEach { caseId ->
                        FilterChip(
                            selected = caseId == state.activeCaseId,
                            onClick = { onSelectCase(caseId) },
                            label = { Text(caseId) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                            ),
                        )
                    }
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            AppUpdateCheckSection(
                installedVersion = installedVersion,
                state = updateState,
                onCheckForUpdate = onCheckForUpdate,
                onDismissStatus = onDismissUpdateStatus,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Button(
                onClick = onEnter,
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
            ) {
                Text(stringResource(R.string.enter_courtroom))
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
fun EpisodeHubScreen(
    state: PilotUiState,
    onSelectEpisode: (String) -> Unit,
    onOpenDiary: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val totalItems = state.episodes.sumOf { it.itemsTotal }
    val readItems = state.episodes.sumOf { it.itemsRead }
    ScreenScaffold(title = stringResource(R.string.episode_hub_title), modifier = modifier) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Column(
                    modifier = Modifier.padding(vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        stringResource(R.string.episode_hub_intro),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    ReadingProgressBar(read = readItems, total = totalItems)
                }
            }
            items(state.episodes, key = { it.id }) { episode ->
                val complete = episode.itemsRead == episode.itemsTotal
                Card(
                    onClick = { onSelectEpisode(episode.id) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = if (complete) {
                            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f)
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant
                        },
                    ),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(episode.title, style = MaterialTheme.typography.titleMedium)
                            if (complete) {
                                Icon(
                                    imageVector = Icons.Outlined.CheckCircle,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                )
                            }
                        }
                        LinearProgressIndicator(
                            progress = {
                                if (episode.itemsTotal == 0) 0f
                                else episode.itemsRead.toFloat() / episode.itemsTotal.toFloat()
                            },
                            modifier = Modifier.fillMaxWidth(),
                            color = MaterialTheme.colorScheme.primary,
                            trackColor = MaterialTheme.colorScheme.surface,
                        )
                        Text(
                            stringResource(
                                R.string.episode_progress,
                                episode.id,
                                episode.itemsRead,
                                episode.itemsTotal,
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            item {
                DiaryCallToAction(allItemsRead = state.allItemsRead, onOpenDiary = onOpenDiary)
            }
        }
    }
}

@Composable
fun ReadingHubScreen(
    state: PilotUiState,
    onOpenItem: (String) -> Unit,
    onOpenDiary: () -> Unit,
    onBackToEpisodeHub: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val readCount = state.readingItems.count { it.isRead }
    val totalCount = state.readingItems.size
    ScreenScaffold(title = state.episodeTitle, modifier = modifier) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Column(
                    modifier = Modifier.padding(vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (state.episodeIntro.isNotBlank()) {
                        Text(
                            state.episodeIntro,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    ReadingProgressBar(read = readCount, total = totalCount)
                }
            }
            items(state.readingItems, key = { it.id }) { item ->
                TrialItemCard(
                    title = item.title,
                    kind = item.kind,
                    isRead = item.isRead,
                    onClick = { onOpenItem(item.id) },
                )
            }
            item {
                DiaryCallToAction(allItemsRead = state.allItemsRead, onOpenDiary = onOpenDiary)
            }
            if (onBackToEpisodeHub != null) {
                item {
                    OutlinedButton(
                        onClick = onBackToEpisodeHub,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(R.string.back_to_episodes))
                    }
                }
            }
        }
    }
}

@Composable
private fun DiaryCallToAction(allItemsRead: Boolean, onOpenDiary: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (allItemsRead) {
            Button(
                onClick = onOpenDiary,
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
            ) {
                Text(stringResource(R.string.open_diary))
            }
        } else {
            Text(
                stringResource(R.string.read_all_items_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
        }
    }
}

@Composable
fun ItemDetailScreen(
    item: TrialItem,
    onContinue: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ScreenScaffold(
        title = item.title,
        modifier = modifier,
        showBack = true,
        onBack = onBack,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Spacer(modifier = Modifier.height(4.dp))
            KindBadge(kind = item.kind)
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Text(item.body, style = MaterialTheme.typography.bodyLarge)
            if (item.subtitle.isNotBlank()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                ) {
                    Text(
                        item.subtitle,
                        modifier = Modifier.padding(16.dp),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = onContinue,
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
            ) {
                Text(stringResource(R.string.mark_read_continue))
            }
            OutlinedButton(
                onClick = onBack,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.back_to_hub))
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
fun DiaryScreen(onCommit: (String, String, String) -> Unit, modifier: Modifier = Modifier) {
    var leaning by rememberSaveable { mutableStateOf("G") }
    var reason by rememberSaveable { mutableStateOf("") }
    var doubt by rememberSaveable { mutableStateOf("") }
    val canCommit = reason.length >= DIARY_MIN_CHARS && doubt.length >= DIARY_MIN_CHARS

    ScreenScaffold(title = stringResource(R.string.diary_title), modifier = modifier) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Spacer(modifier = Modifier.height(4.dp))
            WarningBanner(text = stringResource(R.string.diary_permanent_warning))
            Text(
                stringResource(R.string.diary_leaning_prompt),
                style = MaterialTheme.typography.titleSmall,
            )
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
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                        ),
                    )
                }
            }
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it },
                label = { Text(stringResource(R.string.diary_reason_label)) },
                supportingText = {
                    Text(stringResource(R.string.diary_char_count, reason.length, DIARY_MIN_CHARS))
                },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                shape = MaterialTheme.shapes.medium,
            )
            OutlinedTextField(
                value = doubt,
                onValueChange = { doubt = it },
                label = { Text(stringResource(R.string.diary_doubt_label)) },
                supportingText = {
                    Text(stringResource(R.string.diary_char_count, doubt.length, DIARY_MIN_CHARS))
                },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                shape = MaterialTheme.shapes.medium,
            )
            Button(
                onClick = { onCommit(leaning, reason, doubt) },
                enabled = canCommit,
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
            ) {
                Text(stringResource(R.string.commit_diary))
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
fun VoteScreen(onVote: (String) -> Unit, modifier: Modifier = Modifier) {
    ScreenScaffold(title = stringResource(R.string.vote_title), modifier = modifier) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Spacer(modifier = Modifier.height(8.dp))
            WarningBanner(text = stringResource(R.string.vote_instruction))
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = { onVote("Guilty") },
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError,
                ),
            ) {
                Text(stringResource(R.string.vote_guilty))
            }
            OutlinedButton(
                onClick = { onVote("Not Guilty") },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.vote_not_guilty))
            }
        }
    }
}

@Composable
fun RevealScreen(state: PilotUiState, modifier: Modifier = Modifier) {
    ScreenScaffold(title = stringResource(R.string.reveal_title), modifier = modifier) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                state.revealTitle ?: stringResource(R.string.reveal_title),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.primary,
            )
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            state.revealLayers.forEach { layer ->
                RevealLayerCard(heading = layer.heading, body = layer.body)
            }
            if (state.revealNames.isNotEmpty()) {
                Text(
                    stringResource(R.string.names_restored),
                    style = MaterialTheme.typography.titleMedium,
                )
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        state.revealNames.forEach { row ->
                            NameRevealRow(
                                playName = row.playName,
                                realName = row.realName,
                                fateNote = row.fateNote,
                            )
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ScreenScaffold(
    title: String,
    modifier: Modifier = Modifier,
    showBack: Boolean = false,
    onBack: (() -> Unit)? = null,
    content: @Composable (PaddingValues) -> Unit,
) {
    Scaffold(
        modifier = modifier,
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Text(
                        title,
                        style = MaterialTheme.typography.titleLarge,
                        maxLines = 2,
                    )
                },
                navigationIcon = {
                    if (showBack && onBack != null) {
                        IconButton(onClick = onBack) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.back_to_hub),
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground,
                ),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
        content = content,
    )
}
