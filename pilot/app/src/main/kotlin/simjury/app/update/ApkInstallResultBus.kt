package simjury.app.update

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

object ApkInstallResultBus {
    private val _events = MutableSharedFlow<ApkInstallResult>(extraBufferCapacity = 1)
    val events: SharedFlow<ApkInstallResult> = _events.asSharedFlow()

    fun emit(result: ApkInstallResult) {
        _events.tryEmit(result)
    }
}
