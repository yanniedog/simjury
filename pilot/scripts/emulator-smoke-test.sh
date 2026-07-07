#!/usr/bin/env bash
# Install a release APK on a connected emulator/device, launch it, and fail if the
# process crashes or the summons screen never appears.
#
# Usage:
#   APK_PATH=/path/to/app-release.apk bash pilot/scripts/emulator-smoke-test.sh
#   # or, from pilot/: builds release APK first when APK_PATH is unset
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_APK="${ROOT_DIR}/app/build/outputs/apk/release/app-release.apk"
APK="${APK_PATH:-${DEFAULT_APK}}"
PACKAGE="com.simjury.app"
ACTIVITY="${PACKAGE}/simjury.app.MainActivity"
UI_DUMP="/data/local/tmp/simjury-smoke-ui.xml"
BOOT_TIMEOUT_SEC="${BOOT_TIMEOUT_SEC:-180}"
UI_TIMEOUT_SEC="${UI_TIMEOUT_SEC:-60}"

log() {
  printf '[smoke] %s\n' "$*"
}

die() {
  printf '[smoke] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

wait_for_boot() {
  local elapsed=0
  adb wait-for-device
  while (( elapsed < BOOT_TIMEOUT_SEC )); do
    local boot
    boot="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [[ "${boot}" == "1" ]]; then
      log "Device boot complete after ${elapsed}s"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  die "Device did not finish booting within ${BOOT_TIMEOUT_SEC}s"
}

wait_for_ui_text() {
  local needle="$1"
  local elapsed=0
  while (( elapsed < UI_TIMEOUT_SEC )); do
    adb shell uiautomator dump "${UI_DUMP}" >/dev/null 2>&1 || true
    if adb shell cat "${UI_DUMP}" 2>/dev/null | grep -Fq "${needle}"; then
      log "Found UI text: ${needle}"
      return 0
    fi
    if ! adb shell pidof "${PACKAGE}" >/dev/null 2>&1; then
      die "Process exited before UI text '${needle}' appeared"
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  die "Timed out waiting for UI text '${needle}'"
}

require_cmd adb

if [[ -n "${APK_PATH:-}" ]]; then
  [[ -f "${APK}" ]] || die "APK not found at ${APK} (APK_PATH=${APK_PATH})"
  log "Using prebuilt APK: ${APK}"
elif [[ -z "${ANDROID_HOME:-}" ]]; then
  die "ANDROID_HOME is not set (required to build APK when APK_PATH is unset)"
fi

if ! adb get-state >/dev/null 2>&1; then
  die "No adb device connected"
fi

wait_for_boot

if [[ -z "${APK_PATH:-}" ]]; then
  log "Building release APK"
  (
    cd "${ROOT_DIR}"
    ./gradlew :app:assembleRelease --no-daemon --console=plain
  )
  [[ -f "${APK}" ]] || die "Release APK not found at ${APK}"
fi

log "Installing ${APK}"
adb uninstall "${PACKAGE}" >/dev/null 2>&1 || true
adb install -r "${APK}"

log "Launching ${ACTIVITY}"
adb logcat -c
adb shell am start -W -n "${ACTIVITY}"

if adb logcat -d 2>/dev/null | grep -Fq "FATAL EXCEPTION: main"; then
  adb logcat -d 2>/dev/null | grep -E "FATAL EXCEPTION|AndroidRuntime" -A 20 | tail -80 >&2 || true
  die "App crashed on launch"
fi

if ! adb shell pidof "${PACKAGE}" >/dev/null 2>&1; then
  adb logcat -d 2>/dev/null | grep -E "FATAL EXCEPTION|AndroidRuntime|${PACKAGE}" -A 20 | tail -80 >&2 || true
  die "App process is not running after launch"
fi

wait_for_ui_text "Enter the courtroom"

if adb logcat -d 2>/dev/null | grep -Fq "FATAL EXCEPTION: main"; then
  adb logcat -d 2>/dev/null | grep -E "FATAL EXCEPTION|AndroidRuntime" -A 20 | tail -80 >&2 || true
  die "App crashed after initial render"
fi

log "Smoke test passed"
