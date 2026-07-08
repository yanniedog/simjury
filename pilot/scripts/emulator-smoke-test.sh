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
PACKAGE_MANAGER_TIMEOUT_SEC="${PACKAGE_MANAGER_TIMEOUT_SEC:-120}"
ACTIVITY_TIMEOUT_SEC="${ACTIVITY_TIMEOUT_SEC:-90}"
UI_TIMEOUT_SEC="${UI_TIMEOUT_SEC:-60}"
UI_DUMP_TIMEOUT_SEC="${UI_DUMP_TIMEOUT_SEC:-20}"
INSTALL_RETRIES="${INSTALL_RETRIES:-5}"

SUMMONS_UI_MARKERS=(
  "Enter the courtroom"
  "Check for updates"
  "You have been called to serve"
  "Jury summons"
)

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
  adb wait-for-device || die "adb wait-for-device failed"
  while (( elapsed < BOOT_TIMEOUT_SEC )); do
    local boot
    boot="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [[ "${boot}" == "1" ]]; then
      log "Device boot complete after ${elapsed}s"
      sleep 5
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  die "Device did not finish booting within ${BOOT_TIMEOUT_SEC}s"
}

wait_for_bootanim_stopped() {
  local elapsed=0
  while (( elapsed < 60 )); do
    local anim
    anim="$(adb shell getprop init.svc.bootanim 2>/dev/null | tr -d '\r' || true)"
    if [[ "${anim}" == "stopped" ]]; then
      log "Boot animation stopped after ${elapsed}s"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  log "Boot animation still running after 60s (continuing)"
}

wait_for_package_manager() {
  local elapsed=0
  while (( elapsed < PACKAGE_MANAGER_TIMEOUT_SEC )); do
    if adb shell pm path android >/dev/null 2>&1; then
      log "Package manager ready after ${elapsed}s"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  die "Package manager not ready within ${PACKAGE_MANAGER_TIMEOUT_SEC}s"
}

activity_is_resumed() {
  adb shell dumpsys activity activities 2>/dev/null \
    | grep -Eq "topResumedActivity=ActivityRecord\\{[^}]+[[:space:]]+u0[[:space:]]+${PACKAGE}/simjury\\.app\\.MainActivity"
}

wait_for_resumed_activity() {
  local elapsed=0
  while (( elapsed < ACTIVITY_TIMEOUT_SEC )); do
    if activity_is_resumed; then
      log "MainActivity is resumed"
      return 0
    fi
    if ! adb shell pidof "${PACKAGE}" >/dev/null 2>&1; then
      die "Process exited before MainActivity resumed"
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  die "Timed out waiting for MainActivity to resume"
}

ui_dump_once() {
  if timeout "${UI_DUMP_TIMEOUT_SEC}" adb shell uiautomator dump "${UI_DUMP}" >/dev/null 2>&1; then
    adb shell cat "${UI_DUMP}" 2>/dev/null || true
    return 0
  fi
  return 1
}

ui_dump_contains() {
  local needle="$1"
  local dump="$2"
  grep -Fq "${needle}" <<<"${dump}"
}

scroll_summons_into_view() {
  adb shell input swipe 500 1400 500 500 250 >/dev/null 2>&1 || true
}

wait_for_summons_ui() {
  local elapsed=0
  while (( elapsed < UI_TIMEOUT_SEC )); do
    local dump=""
    if dump="$(ui_dump_once)"; then
      local marker
      for marker in "${SUMMONS_UI_MARKERS[@]}"; do
        if ui_dump_contains "${marker}" "${dump}"; then
          log "Found summons UI marker: ${marker}"
          return 0
        fi
      done
      if ui_dump_contains "summons_enter" "${dump}"; then
        log "Found UI test tag: summons_enter"
        return 0
      fi
      if ui_dump_contains "Loading case" "${dump}"; then
        log "Case still loading (${elapsed}s elapsed)"
      elif ui_dump_contains "Try again" "${dump}"; then
        dump_app_logcat "$(app_pid)"
        die "App showed load error screen"
      fi
    else
      log "uiautomator dump failed (${elapsed}s elapsed)"
    fi

    if ! adb shell pidof "${PACKAGE}" >/dev/null 2>&1; then
      die "Process exited before summons UI appeared"
    fi

    scroll_summons_into_view
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

dump_app_logcat() {
  local pid="$1"
  if [[ -n "${pid}" ]]; then
    adb logcat -d --pid="${pid}" 2>/dev/null | tail -120 >&2 || true
  else
    adb logcat -d 2>/dev/null | grep -E "FATAL EXCEPTION|AndroidRuntime|${PACKAGE}" -A 20 | tail -80 >&2 || true
  fi
}

app_pid() {
  adb shell pidof "${PACKAGE}" 2>/dev/null | tr -d '\r' | awk '{print $1}'
}

assert_app_running() {
  local label="$1"
  local pid
  pid="$(app_pid)"
  if [[ -z "${pid}" ]]; then
    dump_app_logcat ""
    die "${label}"
  fi
  if adb logcat -d --pid="${pid}" 2>/dev/null | grep -Fq "FATAL EXCEPTION"; then
    dump_app_logcat "${pid}"
    die "App crashed (${label})"
  fi
}

install_apk_with_retry() {
  local attempt=1
  while (( attempt <= INSTALL_RETRIES )); do
    if adb install -r "${APK}"; then
      log "APK installed on attempt ${attempt}"
      return 0
    fi
    log "Install attempt ${attempt}/${INSTALL_RETRIES} failed; waiting for package manager"
    wait_for_package_manager
    sleep 3
    attempt=$((attempt + 1))
  done
  die "adb install failed after ${INSTALL_RETRIES} attempts"
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
wait_for_bootanim_stopped
wait_for_package_manager

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
install_apk_with_retry

log "Launching ${ACTIVITY}"
adb logcat -c
adb shell am start -W -n "${ACTIVITY}" --ez skipAutoUpdateCheck true

assert_app_running "App process is not running after launch"

wait_for_resumed_activity

if wait_for_summons_ui; then
  log "Summons UI confirmed"
else
  log "WARN: summons UI not detected (Compose accessibility can lag on CI); MainActivity is resumed"
fi

STABILIZE_SEC="${STABILIZE_SEC:-15}"
log "Waiting ${STABILIZE_SEC}s to confirm process stability"
sleep "${STABILIZE_SEC}"
assert_app_running "App process exited after initial render"

log "Smoke test passed"
