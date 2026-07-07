package simjury.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import simjury.deliberation.deliberationJson

private val Context.pilotDataStore: DataStore<Preferences> by preferencesDataStore(name = "pilot_session")

class PilotSaveRepository(private val context: Context) {

    private val saveKey = stringPreferencesKey("pilot_save_v1")

    suspend fun load(): PilotSave? {
        val raw = context.pilotDataStore.data.map { prefs -> prefs[saveKey] }.first() ?: return null
        return runCatching { deliberationJson.decodeFromString(PilotSave.serializer(), raw) }.getOrNull()
    }

    suspend fun save(save: PilotSave) {
        val encoded = deliberationJson.encodeToString(PilotSave.serializer(), save)
        context.pilotDataStore.edit { prefs -> prefs[saveKey] = encoded }
    }

    suspend fun clear() {
        context.pilotDataStore.edit { prefs -> prefs.remove(saveKey) }
    }
}
