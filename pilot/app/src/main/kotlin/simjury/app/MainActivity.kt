package simjury.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import simjury.app.ui.PilotAppShell

class MainActivity : ComponentActivity() {
    private val viewModel: PilotViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val uiState by viewModel.uiState.collectAsState()
            SimJuryTheme {
                PilotAppShell(
                    state = uiState,
                    allItemsRead = viewModel.allItemsRead,
                    onAcknowledgeSummons = viewModel::acknowledgeSummons,
                    onOpenItem = viewModel::openItem,
                    onCloseItem = viewModel::closeItem,
                    onMarkItemRead = viewModel::markItemRead,
                    onOpenDiary = viewModel::openDiary,
                    onCommitDiary = viewModel::commitDiary,
                    onCastVote = viewModel::castVote,
                )
            }
        }
    }
}
