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
# Maestro's adb transport may falsely report an otherwise healthy
# Android emulator offline on launch (see Maestro issue #3451).
# Retry ONCE for that exact infrastructure error; never retry a
# failing business/UI assertion and never count a retry as a pass.
adb wait-for-device
sleep 12
# Never replay a paid Travel or even a successful sign-in from the beginning.
# A whole-flow retry is safe ONLY before authenticated UI actions begin.
# The previous retry logic looked only at the infrastructure error, so a
# late Pixel Launcher ANR could duplicate a TEST authorization/booking.
safe_before_auth_retry(){
  local log="$1"
  ! grep -Eiq 'auth-primary-action|traveler-confirm-travel|operator-commence-operations|operator-accept-traveler|operator-confirm-arrival|operator-commence-travel|operator-complete-operation|Confirm Travel|Accept Traveler|Complete Operation' "$log"
}
for flow in traveler operator; do
  test_file=".maestro/generated/qa-commercial-${flow}.yml"
  result_log="artifacts/native-commercial-android/${flow}.log"
  result=0
  maestro test "$test_file" > "$result_log" 2>&1 || result=$?
  latest_debug="$(ls -1dt "$HOME"/.maestro/tests/* 2>/dev/null | head -1 || true)"
  if [ "$result" -ne 0 ] && [ -n "$latest_debug" ] &&
     grep -RqE 'device offline|Device server died' "$latest_debug" 2>/dev/null &&
     safe_before_auth_retry "$result_log"; then
    echo "Maestro emulator transport dropped in ${flow}; retrying once after reconnect."
    timeout 90 adb wait-for-device
    sleep 15
    result=0
    maestro test "$test_file" > "$result_log" 2>&1 || result=$?
  fi
  # The exact captured CI failure was an Android *Pixel Launcher* ANR dialog
  # blocking a healthy sign-in page. Retry once ONLY for that OS infrastructure
  # dialog, never for an American Rider error or failed fare/payment assertion.
  latest_debug="$(ls -1dt "$HOME"/.maestro/tests/* 2>/dev/null | head -1 || true)"
  if [ "$result" -ne 0 ] && [ -n "$latest_debug" ] &&
     grep -RqF "Pixel Launcher isn't responding" "$latest_debug" 2>/dev/null &&
     safe_before_auth_retry "$result_log"; then
    echo "Verified Pixel Launcher ANR over healthy app; preserve original evidence and retry once."
    mkdir -p "artifacts/native-commercial-android/initial-launcher-anr"
    cp -R "$latest_debug/." "artifacts/native-commercial-android/initial-launcher-anr/" 2>/dev/null || true
    adb shell input keyevent KEYCODE_BACK || true
    adb wait-for-device
    sleep 20
    result=0
    maestro test "$test_file" > "$result_log" 2>&1 || result=$?
  fi
  if [ "$result" -ne 0 ]; then
    if ! safe_before_auth_retry "$result_log"; then
      echo 'QA_ANDROID_REPLAY_BLOCKED=authenticated_or_payment_action_already_attempted'
      echo 'No automated whole-flow retry after sign-in; preserve evidence and re-seed isolated fixture before any new journey.'
    fi
    tail -100 "$result_log"
    mkdir -p artifacts/native-commercial-android/maestro-debug
    cp -R "$HOME/.maestro/tests/." artifacts/native-commercial-android/maestro-debug/ 2>/dev/null || true
    adb logcat -d -t 8000 > artifacts/native-commercial-android/failure-logcat.txt 2>/dev/null || true
    adb exec-out screencap -p > artifacts/native-commercial-android/failure-screen.png 2>/dev/null || true
    exit 1
  fi
done
node backend/native-commercial-qa-reconcile.cjs
