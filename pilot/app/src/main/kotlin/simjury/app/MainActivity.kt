package simjury.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import simjury.app.ui.AppUpdateBanner
import simjury.app.ui.PilotAppShell
import simjury.app.update.AppUpdateUiState
import simjury.app.update.AppUpdateViewModel

class MainActivity : ComponentActivity() {
    private val pilotViewModel: PilotViewModel by viewModels()
    private val updateViewModel: AppUpdateViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val uiState by pilotViewModel.uiState.collectAsState()
            val updateState by updateViewModel.state.collectAsState()

            LaunchedEffect(Unit) {
                updateViewModel.checkForUpdate()
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
                    Box(modifier = Modifier.weight(1f)) {
                        PilotAppShell(
                            state = uiState,
                            allItemsRead = pilotViewModel.allItemsRead,
                            onAcknowledgeSummons = pilotViewModel::acknowledgeSummons,
                            onOpenItem = pilotViewModel::openItem,
                            onCloseItem = pilotViewModel::closeItem,
                            onMarkItemRead = pilotViewModel::markItemRead,
                            onOpenDiary = pilotViewModel::openDiary,
                            onCommitDiary = pilotViewModel::commitDiary,
                            onCastVote = pilotViewModel::castVote,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }
            }
        }
    }
}
