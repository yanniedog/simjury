package simjury.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import simjury.app.ui.AppUpdateBanner
import simjury.app.ui.PilotAppShell
import simjury.app.BuildConfig
import simjury.app.update.AppUpdateRepository
import simjury.app.update.AppUpdateUiState
import simjury.app.update.AppUpdateViewModel

open class MainActivity : ComponentActivity() {
    private val pilotViewModel: PilotViewModel by viewModels()
    private val updateViewModel: AppUpdateViewModel by viewModels {
        AppUpdateViewModel.factory(application, createAppUpdateRepository())
    }

    protected open fun createAppUpdateRepository(): AppUpdateRepository =
        testUpdateRepositoryOverride ?: AppUpdateRepository()

    companion object {
        internal var testUpdateRepositoryOverride: AppUpdateRepository? = null
        internal var testSkipAutoUpdateCheck: Boolean = false
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val uiState by pilotViewModel.uiState.collectAsState()
            val updateState by updateViewModel.state.collectAsState()

            LaunchedEffect(Unit) {
                if (!testSkipAutoUpdateCheck) {
                    updateViewModel.checkForUpdate(userInitiated = false)
                }
            }

            DisposableEffect(Unit) {
                onDispose {
                    pilotViewModel.stopListening()
                }
            }

            SimJuryTheme {
                Column(modifier = Modifier.fillMaxSize()) {
                    AppUpdateBanner(
                        state = updateState,
                        onUpdate = {
                            when (updateState) {
                                is AppUpdateUiState.ReadyToInstall -> updateViewModel.installPending()
                                else -> updateViewModel.downloadAndInstall()
                            }
                        },
                        onDismiss = updateViewModel::dismiss,
                    )
                    PilotAppShell(
                        state = uiState,
                        onAcknowledgeSummons = pilotViewModel::acknowledgeSummons,
                        onSelectEpisode = pilotViewModel::selectEpisode,
                        onBackToEpisodeHub = pilotViewModel::backToEpisodeHub,
                        onSelectCase = pilotViewModel::selectCase,
                        onOpenItem = pilotViewModel::openItem,
                        onCloseItem = pilotViewModel::closeItem,
                        onMarkItemRead = pilotViewModel::markItemRead,
                        onOpenDiary = pilotViewModel::openDiary,
                        onCommitDiary = pilotViewModel::commitDiary,
                        onCastVote = pilotViewModel::castVote,
                        onNavigate = pilotViewModel::navigateTo,
                        onListenAloud = pilotViewModel::listenAloud,
                        onStopListening = pilotViewModel::stopListening,
                        onPreviousItem = { pilotViewModel.openAdjacentItem(-1) },
                        onNextItem = { pilotViewModel.openAdjacentItem(1) },
                        installedVersion = BuildConfig.VERSION_NAME,
                        updateState = updateState,
                        onCheckForUpdate = { updateViewModel.checkForUpdate(userInitiated = true) },
                        onDismissUpdateStatus = updateViewModel::dismiss,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}
