package simjury.app.update

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow

object ApkInstallResultBus {
    private val _events = Channel<ApkInstallResult>(capacity = Channel.BUFFERED)
    val events: Flow<ApkInstallResult> = _events.receiveAsFlow()

    fun emit(result: ApkInstallResult) {
        _events.trySend(result)
    }
}
