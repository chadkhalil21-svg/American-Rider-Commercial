#!/usr/bin/env python3
"""QA-only prompt Operator response through real emulator UI, not backend.
Maestro's point tap needed 25.5 seconds in 40721224687, beyond the real 15s
offer window. This watcher polls Android's accessibility tree and performs
one direct ADB touchscreen tap on the verified, enabled Accept Traveler button.
It NEVER sends an API acceptance, waives an offer deadline, or re-taps.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "com.americanrider.app"
BUTTON = "operator-accept-traveler"
DEVICE = "emulator-5554"
OUT = Path("artifacts/native-commercial-android")


def parse_button(raw):
    """Find exactly one enabled clickable native offer element from fresh UI."""
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    start = raw.find("<hierarchy")
    if start < 0:
        return None
    try:
        root = ET.fromstring(raw[start:])
    except ET.ParseError:
        return None
    eligible = []
    for node in root.iter("node"):
        a = node.attrib
        rid = a.get("resource-id", "")
        label = a.get("content-desc", "") or a.get("text", "")
        if rid != BUTTON and not rid.endswith(":id/" + BUTTON):
            continue
        if a.get("enabled") != "true" or a.get("clickable") != "true":
            continue
        match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", a.get("bounds", ""))
        if not match:
            continue
        x1, y1, x2, y2 = map(int, match.groups())
        # Reject invalid or off-screen bounds on the fixed QA Pixel 6.
        if not (0 <= x1 < x2 <= 1080 and 0 <= y1 < y2 <= 2400):
            continue
        if not (x2 - x1 >= 80 and y2 - y1 >= 35):
            continue
        eligible.append({"x": (x1 + x2)//2, "y": (y1 + y2)//2,
                         "bounds": a["bounds"], "id": rid,
                         "label": label[:70]})
    if len(eligible) > 1:
        raise RuntimeError("Ambiguous duplicate Operator accept controls")
    return eligible[0] if eligible else None


def check_isolation():
    if os.environ.get("FIRESTORE_EMULATOR_HOST") is None:
        raise RuntimeError("Refuse physical/production environment: Firestore emulator missing")
    if os.environ.get("FIREBASE_AUTH_EMULATOR_HOST") is None:
        raise RuntimeError("Refuse production environment: Auth emulator missing")
    if os.environ.get("GOOGLE_CLOUD_PROJECT") != "demo-american-rider-qa":
        raise RuntimeError("Refuse non-disposable project")
    if not os.environ.get("STRIPE_SECRET_KEY", "").startswith("sk_test_"):
        raise RuntimeError("Refuse non-TEST Stripe environment")
    if os.environ.get("K_SERVICE") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        raise RuntimeError("Refuse production service credentials")


def adb(device, *args, deadline=12):
    return subprocess.run(["adb", "-s", device, *args], capture_output=True,
                          timeout=deadline, check=False)


def self_test():
    sample = ('<hierarchy><node resource-id="operator-accept-traveler" '
              'enabled="true" clickable="true" bounds="[556,2094][972,2250]" '
              'content-desc="Accept Traveler"/></hierarchy>')
    b = parse_button(sample)
    assert b and (b["x"], b["y"]) == (764, 2172)
    assert parse_button(sample.replace('enabled="true"', 'enabled="false"')) is None
    assert parse_button(sample.replace('operator-accept-traveler', 'other-button')) is None
    assert parse_button(sample.replace('[556,2094][972,2250]', '[0,0][9999,9999]')) is None
    print("PASS QA Operator response watcher: enabled exact native button only")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", default=DEVICE)
    parser.add_argument("--timeout", type=int, default=540)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    check_isolation()
    if args.device != DEVICE or not (30 <= args.timeout <= 600):
        raise RuntimeError("Refuse non-QA device or unbounded wait")
    OUT.mkdir(parents=True, exist_ok=True)
    until = time.monotonic() + args.timeout
    polls = 0
    while time.monotonic() < until:
        polls += 1
        started = time.monotonic()
        try:
            scan = adb(args.device, "exec-out", "uiautomator", "dump", "/dev/tty", deadline=15)
        except subprocess.TimeoutExpired:
            time.sleep(0.5)
            continue
        elapsed = time.monotonic()-started
        if scan.returncode != 0 or elapsed > 7:
            time.sleep(0.5)
            continue
        data = scan.stdout
        button = parse_button(data)
        if button:
            # Save observed tree prior to tapping, never fake API events.
            (OUT/"operator-accept-observed.xml").write_bytes(data)
            touch_start = time.monotonic()
            touch = adb(args.device, "shell", "input", "tap",
                        str(button["x"]), str(button["y"]), deadline=7)
            duration = time.monotonic()-touch_start
            record = {"device":args.device, "buttonId":button["id"],
                      "bounds":button["bounds"], "polls":polls,
                      "snapshotSeconds":round(elapsed,3),
                      "touchSeconds":round(duration,3),
                      "touchTransportOk":touch.returncode==0}
            (OUT/"operator-accept-touch.json").write_text(json.dumps(record,indent=2)+"\n")
            if touch.returncode != 0:
                raise RuntimeError("Native touch was not delivered; no retry after an attempted offer")
            print("PASS QA_NATIVE_OPERATOR_OFFER_TOUCHED_ONCE "
                  "(touch only, server acceptance separately required)",flush=True)
            return
        time.sleep(0.35)
    raise RuntimeError("No enabled native Operator offer observed before QA timeout; "
                       "server's real response window was never extended")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.SubprocessError) as exc:
        print("QA_NATIVE_OPERATOR_WATCHER_FAILED:",str(exc),file=sys.stderr,flush=True)
        sys.exit(1)
