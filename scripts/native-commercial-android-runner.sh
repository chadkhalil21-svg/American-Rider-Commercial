#!/usr/bin/env bash
set -euo pipefail
set -e
export PATH="$HOME/.maestro/bin:$PATH"
mkdir -p artifacts/native-commercial-android
adb install -r .qa-native-build-cache/android/app-release.apk
# Disposable Operator fixture is at this Miami test position. Do not
# let the emulator default to Google's California headquarters.
adb emu geo fix -80.1918 25.7617
adb shell pm grant com.americanrider.app android.permission.ACCESS_FINE_LOCATION
adb shell pm grant com.americanrider.app android.permission.ACCESS_COARSE_LOCATION
# The disposable Operator was created before Android emulator startup. Its
# 5-minute presence expires during SDK boot unless refreshed immediately
# before the real Traveler booking. This ONLY writes the local QA emulator.
node backend/native-commercial-qa-refresh-presence.cjs
# Prove emulator transport is responsive BEFORE launching any authenticated
# or payment-capable Maestro flow. Once a flow starts, never replay it from
# login, even if the OS Launcher or ADB later fails. A log string is not
# reliable proof that no payment action was sent.
if ! timeout 90 adb wait-for-device; then
  echo 'QA_ANDROID_FAILURE_CLASS=emulator_transport_preflight'
  exit 1
fi
if [ "$(adb get-state 2>/dev/null || true)" != 'device' ]; then
  echo 'QA_ANDROID_FAILURE_CLASS=emulator_offline_preflight'
  exit 1
fi
sleep 12
for flow in traveler operator; do
  test_file=".maestro/generated/qa-commercial-${flow}.yml"
  result_log="artifacts/native-commercial-android/${flow}.log"
  result=0
  maestro test "$test_file" > "$result_log" 2>&1 || result=$?
  if [ "$result" -ne 0 ]; then
    latest_debug="$(ls -1dt "$HOME"/.maestro/tests/* 2>/dev/null | head -1 || true)"
    if [ -n "$latest_debug" ] && grep -RqF "Pixel Launcher isn't responding" "$latest_debug" 2>/dev/null; then
      echo 'QA_ANDROID_FAILURE_CLASS=os_pixel_launcher_anr'
    elif [ -n "$latest_debug" ] && grep -RqE 'device offline|Device server died' "$latest_debug" 2>/dev/null; then
      echo 'QA_ANDROID_FAILURE_CLASS=emulator_transport_dropped'
    else
      echo 'QA_ANDROID_FAILURE_CLASS=native_flow_or_unclassified'
    fi
    echo 'QA_ANDROID_REPLAY_BLOCKED=flow_already_started'
    echo 'Never infer retry safety from partial Maestro logs. Preserve the stage evidence and re-seed isolated fixtures for a future independent attempt.'
    tail -100 "$result_log"
    mkdir -p artifacts/native-commercial-android/maestro-debug
    cp -R "$HOME/.maestro/tests/." artifacts/native-commercial-android/maestro-debug/ 2>/dev/null || true
    adb logcat -d -t 8000 > artifacts/native-commercial-android/failure-logcat.txt 2>/dev/null || true
    adb exec-out screencap -p > artifacts/native-commercial-android/failure-screen.png 2>/dev/null || true
    exit 1
  fi
done
node backend/native-commercial-qa-reconcile.cjs
