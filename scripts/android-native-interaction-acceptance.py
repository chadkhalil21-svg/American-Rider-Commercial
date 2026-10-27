#!/usr/bin/env python3
"""Drive real Android emulator touch events against the RELEASE app, without real identities.
This is a native USER-INTERACTION smoke suite, not complete paid commercial certification.
Never signs up, approves qualifications, creates Travels, contacts Stripe or sends payout.
"""
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "com.americanrider.app"
ARTIFACTS = Path("artifacts/android-native-interaction")
ARTIFACTS.mkdir(parents=True, exist_ok=True)
COUNT = 0

def adb(*args, timeout=35):
    run = subprocess.run(["adb", *args], text=True, capture_output=True, timeout=timeout)
    if run.returncode:
        raise RuntimeError("ADB command failed (%s): %s" % (" ".join(args[:3]), run.stderr[-600:]))
    return run.stdout

def snapshot(label):
    """An actual rendered accessibility hierarchy, not app source or a guessed screen."""
    global COUNT
    last = None
    for _ in range(4):
        try:
            adb("shell", "uiautomator", "dump", "/sdcard/qa-hierarchy.xml", timeout=45)
            xml = adb("exec-out", "cat", "/sdcard/qa-hierarchy.xml")
            root = ET.fromstring(xml)
            COUNT += 1
            safe = re.sub(r"[^a-zA-Z0-9_-]", "-", label)
            (ARTIFACTS / f"{COUNT:02d}-{safe}.xml").write_text(xml)
            adb("shell", "screencap", "-p", "/sdcard/qa-native.png")
            adb("pull", "/sdcard/qa-native.png", str(ARTIFACTS / f"{COUNT:02d}-{safe}.png"))
            return list(root.iter("node"))
        except (ET.ParseError, RuntimeError, subprocess.TimeoutExpired) as e:
            last = e
            time.sleep(3)
    raise AssertionError("Could not observe real screen hierarchy: " + str(last))

def desc(node):
    return " ".join([node.attrib.get("text", ""), node.attrib.get("content-desc", "")]).strip()

def locate(nodes, patterns, *, edit=False):
    for pattern in patterns:
        pattern = pattern.casefold()
        for node in nodes:
            if edit and "EditText" not in node.attrib.get("class", ""):
                continue
            if pattern in desc(node).casefold():
                return node
    return None

def center(node):
    area = node.attrib.get("bounds", "")
    m = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", area)
    if not m:
        raise AssertionError("Accessible UI element has no screen position")
    x1,y1,x2,y2=map(int,m.groups())
    return (x1+x2)//2,(y1+y2)//2

def wait_visible(*patterns, label="screen", seconds=22):
    expiry = time.monotonic()+seconds
    while time.monotonic()<expiry:
        nodes=snapshot(label)
        node=locate(nodes, patterns)
        if node:
            return node
        time.sleep(2)
    # Distinct failure. No "pass" just because an activity was foreground.
    raise AssertionError(f"Expected displayed control {patterns} not found on {label}")

def touch(patterns,label):
    node=wait_visible(*patterns,label=label)
    x,y=center(node)
    adb("shell","input","tap",str(x),str(y))
    print(f"PASS actual Android touchscreen tap: {label}")

def first_edit(label):
    nodes=snapshot(label)
    edits=[n for n in nodes if "EditText" in n.attrib.get("class","")]
    if not edits:
        raise AssertionError(f"No rendered editable field on {label}")
    x,y=center(edits[0])
    adb("shell","input","tap",str(x),str(y))

def prepare_clean_fixture():
    # ADB pm clear revokes Android runtime permissions on API 35.
    # Re-grant ONLY in disposable emulator before launching the app, otherwise
    # the system location dialog covers the sign-in control during the test.
    adb("shell","pm","clear",PACKAGE)
    for permission in ("ACCESS_COARSE_LOCATION","ACCESS_FINE_LOCATION","ACCESS_BACKGROUND_LOCATION"):
        adb("shell","pm","grant",PACKAGE,"android.permission."+permission)

def go_home():
    adb("shell","am","force-stop",PACKAGE)
    adb("shell","am","start","-W","-n",PACKAGE+"/.MainActivity")
    wait_visible("Email Address", label="anonymous-welcome", seconds=40)
    print("PASS actual Android signed-out first screen and email-entry control")

def assert_no_private_screen(label):
    # After opening a protected deep link signed out, the Auth overlay must prevail.
    wait_visible("Email Address",label=label)
    print(f"PASS {label}: signed-out identity gate remains onscreen")

def native_link(uri,label):
    adb("shell","am","start","-W","-a","android.intent.action.VIEW",
        "-d",uri,"-p",PACKAGE)
    time.sleep(2)
    assert_no_private_screen(label)

def run():
    print("NATIVE_INTERACTION_MODE=anonymous_only")
    # Erase test emulator data ONLY, never a real identity or production Firestore.
    prepare_clean_fixture()
    go_home()
    # Real touchscreen and hardware keyboard controls, not source-only UI checks.
    first_edit("email-invalid")
    adb("shell","input","text","invalidemail")
    adb("shell","input","keyevent","KEYCODE_BACK")
    touch(["Continue"],"continue-invalid-email")
    wait_visible("Enter a valid email address",label="invalid-email-alert")
    print("PASS client-side invalid-email validation; no server account lookup")
    prepare_clean_fixture()
    go_home()
    first_edit("email-valid")
    adb("shell","input","text","qa@example.com")
    adb("shell","input","keyevent","KEYCODE_BACK")
    touch(["Continue"],"continue-valid-email")
    wait_visible("Welcome back",label="signin-password-stage")
    print("PASS real touch transition to password screen without signing in")
    touch(["Create an account"],"switch-to-create-account")
    wait_visible("Create your account",label="signup-entry")
    wait_visible("FULL NAME",label="signup-full-name")
    wait_visible("MOBILE NUMBER",label="signup-mobile")
    print("PASS real touch transition to Create Account and input labels, no account created")
    touch(["Already have an account"],"return-to-sign-in")
    wait_visible("Welcome back",label="signin-after-switch")
    touch(["Back"],"return-to-welcome")
    wait_visible("Email Address",label="welcome-after-back")
    # Direct and recruited are independent; referral click must NEVER bypass authentication.
    native_link("americanrider:///operator/qualify","operator-qualification-gated")
    native_link("americanrider:///operator/payouts","operator-money-gated")
    native_link("americanrider:///recruitment","recruiter-private-gated")
    native_link("americanrider:///join","direct-invite-gated")
    native_link("americanrider:///join?r=SIMTEST12345&role=traveler","traveler-invite-gated")
    native_link("americanrider:///join?r=SIMTEST12345&role=operator","operator-invite-gated")
    print("RESULT: PASS anonymous on-device tap+navigation suite; all findings backed by XML+PNG")
    print("NOT TESTED: authenticated Traveler/Operator booking, Apple/Google SSO, full payment, notification delivery or Recruiter bank payouts.")

if __name__=="__main__":
    try:
        run()
    except Exception as exc:
        print("RESULT: FAIL real Android touch suite:",str(exc))
        raise
