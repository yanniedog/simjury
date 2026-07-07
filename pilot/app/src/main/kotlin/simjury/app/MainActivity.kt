package simjury.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import simjury.app.ui.PilotAppShell

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val viewModel = PilotViewModel(application)
        var uiState by mutableStateOf(viewModel.uiState)
        viewModel.setOnStateChanged { uiState = viewModel.uiState }

        setContent {
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
