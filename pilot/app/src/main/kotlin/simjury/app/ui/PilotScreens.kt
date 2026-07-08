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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import simjury.app.PilotNavTarget
import simjury.app.PilotSection
import simjury.app.PilotUiState
import simjury.app.R
import simjury.app.model.TrialItem
import simjury.app.update.AppUpdateUiState

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
    onNavigate: (PilotSection) -> Unit,
    onListenAloud: () -> Unit,
    onStopListening: () -> Unit,
    onPreviousItem: () -> Unit,
    onNextItem: () -> Unit,
    installedVersion: String,
    updateState: AppUpdateUiState,
    onCheckForUpdate: () -> Unit,
    onDismissUpdateStatus: () -> Unit,
    onRetryLoad: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val screenKey = when {
        state.loading -> "loading"
        state.error != null -> "error"
        state.selectedItem != null -> "item"
        else -> state.activeSection.name
    }
    val showChrome = !state.loading && state.error == null
    ScreenScaffold(
        title = screenTitle(state),
        modifier = modifier,
        showBack = state.selectedItem != null,
        onBack = if (state.selectedItem != null) onCloseItem else null,
        showNavBar = showChrome && state.navTargets.isNotEmpty(),
        navTargets = state.navTargets,
        onNavigate = onNavigate,
        showListenBar = showChrome && state.canListenAloud,
        isSpeaking = state.isSpeaking,
        onListenAloud = onListenAloud,
        onStopListening = onStopListening,
        showItemNav = state.selectedItem != null,
        hasPreviousItem = state.previousItemId != null,
        hasNextItem = state.nextItemId != null,
        onPreviousItem = onPreviousItem,
        onNextItem = onNextItem,
    ) { padding ->
        AnimatedContent(
            targetState = screenKey,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            transitionSpec = { fadeIn() togetherWith fadeOut() },
            label = "pilot_screen",
        ) { _ ->
            when {
                state.loading -> LoadingBody()
                state.error != null -> ErrorBody(state.error, onRetry = onRetryLoad)
                state.selectedItem != null -> ItemDetailBody(
                    item = state.selectedItem,
                    canMarkRead = state.canMarkItemsRead,
                    onContinue = { onMarkItemRead(state.selectedItem.id) },
                )
                state.activeSection == PilotSection.SUMMONS -> SummonsBody(
                    state = state,
                    onEnter = onAcknowledgeSummons,
                    onSelectCase = onSelectCase,
                    installedVersion = installedVersion,
                    updateState = updateState,
                    onCheckForUpdate = onCheckForUpdate,
                    onDismissUpdateStatus = onDismissUpdateStatus,
                )
                state.activeSection == PilotSection.EVIDENCE && state.showEpisodeHub -> EpisodeHubBody(
                    state = state,
                    onSelectEpisode = onSelectEpisode,
                    onOpenDiary = onOpenDiary,
                )
                state.activeSection == PilotSection.EVIDENCE -> ReadingHubBody(
                    state = state,
                    onOpenItem = onOpenItem,
                    onOpenDiary = onOpenDiary,
                    onBackToEpisodeHub = if (state.episodes.size > 1) onBackToEpisodeHub else null,
                )
                state.activeSection == PilotSection.DIARY -> DiaryBody(
                    state = state,
                    onCommit = onCommitDiary,
                )
                state.activeSection == PilotSection.VOTE -> VoteBody(onVote = onCastVote)
                state.activeSection == PilotSection.REVEAL -> RevealBody(state = state)
            }
        }
    }
}

@Composable
private fun screenTitle(state: PilotUiState): String = when {
    state.selectedItem != null -> state.selectedItem.title
    state.activeSection == PilotSection.SUMMONS -> stringResource(R.string.summons_title)
    state.activeSection == PilotSection.EVIDENCE && state.showEpisodeHub ->
        stringResource(R.string.episode_hub_title)
    state.activeSection == PilotSection.EVIDENCE -> state.episodeTitle.ifBlank {
        stringResource(R.string.nav_evidence)
    }
    state.activeSection == PilotSection.DIARY -> stringResource(R.string.diary_title)
    state.activeSection == PilotSection.VOTE -> stringResource(R.string.vote_title)
    state.activeSection == PilotSection.REVEAL -> stringResource(R.string.reveal_title)
    else -> stringResource(R.string.app_name)
}

@Composable
private fun LoadingBody() {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        LoadingContent(
            message = stringResource(R.string.loading_case),
            modifier = Modifier.testTag("loading_case"),
        )
    }
}

@Composable
private fun ErrorBody(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.error,
            textAlign = TextAlign.Center,
        )
        Button(
            onClick = onRetry,
            modifier = Modifier.testTag("error_retry"),
            shape = MaterialTheme.shapes.medium,
        ) {
            Text(stringResource(R.string.retry_load))
        }
    }
}

@Composable
private fun SummonsBody(
    state: PilotUiState,
    onEnter: () -> Unit,
    onSelectCase: (String) -> Unit,
    installedVersion: String,
    updateState: AppUpdateUiState,
    onCheckForUpdate: () -> Unit,
    onDismissUpdateStatus: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Spacer(modifier = Modifier.height(8.dp))
        SummonsSeal()
        Text(state.caseTitle, style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center)
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
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                state.availableCases.forEach { option ->
                    FilterChip(
                        selected = option.id == state.activeCaseId,
                        onClick = { onSelectCase(option.id) },
                        enabled = !state.loading,
                        label = { Text(option.titlePlay) },
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
        Button(
            onClick = onEnter,
            modifier = Modifier.fillMaxWidth().testTag("summons_enter"),
            shape = MaterialTheme.shapes.medium,
        ) {
            Text(stringResource(R.string.enter_courtroom))
        }
        Spacer(modifier = Modifier.height(16.dp))
    }
}

@Composable
private fun EpisodeHubBody(
    state: PilotUiState,
    onSelectEpisode: (String) -> Unit,
    onOpenDiary: () -> Unit,
) {
    val totalItems = state.episodes.sumOf { it.itemsTotal }
    val readItems = state.episodes.sumOf { it.itemsRead }
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp)
            .testTag("episode_hub"),
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
                modifier = Modifier.fillMaxWidth().testTag("episode_card_${episode.id}"),
                colors = CardDefaults.cardColors(
                    containerColor = if (complete) {
                        MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f)
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    },
                ),
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
                        stringResource(R.string.episode_progress, episode.itemsRead, episode.itemsTotal),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        item { DiaryCallToAction(allItemsRead = state.allItemsRead, onOpenDiary = onOpenDiary) }
    }
}

@Composable
private fun ReadingHubBody(
    state: PilotUiState,
    onOpenItem: (String) -> Unit,
    onOpenDiary: () -> Unit,
    onBackToEpisodeHub: (() -> Unit)?,
) {
    val readCount = state.readingItems.count { it.isRead }
    val totalCount = state.readingItems.size
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Column(
                modifier = Modifier.padding(vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (isAuthoringPending(state.episodeIntro)) {
                    WarningBanner(text = stringResource(R.string.content_in_progress))
                }
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
        item { DiaryCallToAction(allItemsRead = state.allItemsRead, onOpenDiary = onOpenDiary) }
        if (onBackToEpisodeHub != null) {
            item {
                OutlinedButton(onClick = onBackToEpisodeHub, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.back_to_episodes))
                }
            }
        }
    }
}

@Composable
private fun DiaryCallToAction(allItemsRead: Boolean, onOpenDiary: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (allItemsRead) {
            Button(onClick = onOpenDiary, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium) {
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
private fun ItemDetailBody(item: TrialItem, canMarkRead: Boolean, onContinue: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Spacer(modifier = Modifier.height(4.dp))
        KindBadge(kind = item.kind)
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        ExhibitMediaPanel(media = item.media)
        Text(item.body, style = MaterialTheme.typography.bodyLarge)
        if (item.subtitle.isNotBlank()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            ) {
                Text(item.subtitle, modifier = Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium)
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        if (canMarkRead) {
            Button(onClick = onContinue, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium) {
                Text(stringResource(R.string.mark_read_continue))
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
    }
}

@Composable
private fun DiaryBody(
    state: PilotUiState,
    onCommit: (String, String, String) -> Unit,
) {
    val committed = state.diary != null
    if (committed) {
        CommittedDiaryBody(state = state)
        return
    }
    var leaning by rememberSaveable { mutableStateOf("G") }
    var reason by rememberSaveable { mutableStateOf("") }
    var doubt by rememberSaveable { mutableStateOf("") }
    val canCommit = reason.length >= DIARY_MIN_CHARS && doubt.length >= DIARY_MIN_CHARS
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Spacer(modifier = Modifier.height(4.dp))
        WarningBanner(text = stringResource(R.string.diary_permanent_warning))
        Text(stringResource(R.string.diary_leaning_prompt), style = MaterialTheme.typography.titleSmall)
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
            label = { Text(stringResource(R.string.diary_reason_label, DIARY_MIN_CHARS)) },
            supportingText = { Text(stringResource(R.string.diary_char_count, reason.length, DIARY_MIN_CHARS)) },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3,
            shape = MaterialTheme.shapes.medium,
        )
        OutlinedTextField(
            value = doubt,
            onValueChange = { doubt = it },
            label = { Text(stringResource(R.string.diary_doubt_label, DIARY_MIN_CHARS)) },
            supportingText = { Text(stringResource(R.string.diary_char_count, doubt.length, DIARY_MIN_CHARS)) },
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

@Composable
private fun CommittedDiaryBody(state: PilotUiState) {
    val diary = state.diary ?: return
    val leaningLabel = when (diary.leaning) {
        "G" -> stringResource(R.string.diary_leaning_guilty)
        "NG" -> stringResource(R.string.diary_leaning_not_guilty)
        else -> stringResource(R.string.diary_leaning_undecided)
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(stringResource(R.string.diary_committed_title), style = MaterialTheme.typography.titleMedium)
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(R.string.diary_leaning_prompt), style = MaterialTheme.typography.labelMedium)
                Text(leaningLabel, style = MaterialTheme.typography.titleSmall)
                Text(stringResource(R.string.diary_reason_label, DIARY_MIN_CHARS), style = MaterialTheme.typography.labelMedium)
                Text(diary.topReason, style = MaterialTheme.typography.bodyLarge)
                Text(stringResource(R.string.diary_doubt_label, DIARY_MIN_CHARS), style = MaterialTheme.typography.labelMedium)
                Text(diary.strongestDoubt, style = MaterialTheme.typography.bodyLarge)
            }
        }
    }
}

@Composable
private fun VoteBody(onVote: (String) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
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
        OutlinedButton(onClick = { onVote("Not Guilty") }, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.vote_not_guilty))
        }
    }
}

@Composable
private fun RevealBody(state: PilotUiState) {
    Column(
        modifier = Modifier
            .fillMaxSize()
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
            Text(stringResource(R.string.names_restored), style = MaterialTheme.typography.titleMedium)
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    state.revealNames.forEach { row ->
                        NameRevealRow(playName = row.playName, realName = row.realName, fateNote = row.fateNote)
                    }
                }
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ScreenScaffold(
    title: String,
    modifier: Modifier = Modifier,
    showBack: Boolean = false,
    onBack: (() -> Unit)? = null,
    showNavBar: Boolean = false,
    navTargets: List<PilotNavTarget> = emptyList(),
    onNavigate: (PilotSection) -> Unit = {},
    showListenBar: Boolean = false,
    isSpeaking: Boolean = false,
    onListenAloud: () -> Unit = {},
    onStopListening: () -> Unit = {},
    showItemNav: Boolean = false,
    hasPreviousItem: Boolean = false,
    hasNextItem: Boolean = false,
    onPreviousItem: () -> Unit = {},
    onNextItem: () -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    Scaffold(
        modifier = modifier,
        topBar = {
            Column {
                CenterAlignedTopAppBar(
                    title = {
                        Text(title, style = MaterialTheme.typography.titleLarge, maxLines = 2)
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
                if (showListenBar) {
                    ListenAloudBar(
                        isSpeaking = isSpeaking,
                        enabled = true,
                        onListen = onListenAloud,
                        onStop = onStopListening,
                    )
                }
                if (showItemNav) {
                    ItemNavigationBar(
                        hasPrevious = hasPreviousItem,
                        hasNext = hasNextItem,
                        onPrevious = onPreviousItem,
                        onNext = onNextItem,
                    )
                }
            }
        },
        bottomBar = {
            if (showNavBar) {
                PilotNavBar(targets = navTargets, onNavigate = onNavigate)
            }
        },
        containerColor = MaterialTheme.colorScheme.background,
        content = content,
    )
}

private fun isAuthoringPending(text: String): Boolean =
    text.trimStart().startsWith("[AUTHORING PENDING")
