#!/usr/bin/env bash
# Install only the Android SDK packages required to assemble the pilot app.
# Avoids android-actions/setup-android@v3, which intermittently fails while
# downloading the emulator package (not needed for APK builds).
set -euo pipefail

sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "${sdk_root}" || ! -d "${sdk_root}" ]]; then
  echo "::error::ANDROID_HOME/ANDROID_SDK_ROOT is not set or does not exist"
  exit 1
fi

sdkmanager_bin="${sdk_root}/cmdline-tools/latest/bin/sdkmanager"
if [[ ! -x "${sdkmanager_bin}" ]]; then
  sdkmanager_bin="${sdk_root}/tools/bin/sdkmanager"
fi
if [[ ! -x "${sdkmanager_bin}" ]]; then
  sdkmanager_bin="$(command -v sdkmanager || true)"
fi
if [[ -z "${sdkmanager_bin}" || ! -x "${sdkmanager_bin}" ]]; then
  echo "::error::sdkmanager not found under ${sdk_root}"
  exit 1
fi

props_file="${1:-pilot/local.properties}"
mkdir -p "$(dirname "${props_file}")"
printf 'sdk.dir=%s\n' "${sdk_root}" > "${props_file}"

yes | "${sdkmanager_bin}" --sdk_root="${sdk_root}" --licenses >/dev/null || true
"${sdkmanager_bin}" --sdk_root="${sdk_root}" --install "platform-tools" "platforms;android-35" "build-tools;35.0.0"

echo "Android SDK ready at ${sdk_root}"
"${sdkmanager_bin}" --sdk_root="${sdk_root}" --list_installed | grep -E "platforms;android-35|build-tools;35.0.0|platform-tools" || true
