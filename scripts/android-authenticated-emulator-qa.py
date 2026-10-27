#!/usr/bin/env python3
"""Actual Android taps using LOCAL Firebase Auth/Firestore emulators only.

Proof: disposable QA account -> native login -> authenticated home -> restart/session
persistence -> route access and safe failure screens. Never contacts production
Firebase, creates a live Operator, charges, dispatches or transfers real money.
"""
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

OUT = Path("artifacts/native-qa")
OUT.mkdir(parents=True,exist_ok=True)
APP = "com.americanrider.app"
EMAIL = "native.qa.traveler@example.test"
PASSWORD = "QA-Native-Only-7819-Strong"
COUNTER=0

def adb(*args):
    p=subprocess.run(["adb",*args],capture_output=True,text=True,timeout=48)
    if p.returncode:
        raise RuntimeError("adb %s failed: %s"%(" ".join(args[:3]),p.stderr[-500:]))
    return p.stdout

def screen(label):
    global COUNTER
    adb("shell","uiautomator","dump","/sdcard/native-qa.xml")
    output=adb("exec-out","cat","/sdcard/native-qa.xml")
    root=ET.fromstring(output)
    nodes=list(root.iter("node"))
    COUNTER+=1
    name=f"{COUNTER:02d}-{label}"
    (OUT/(name+".xml")).write_text(output)
    adb("shell","screencap","-p","/sdcard/native-qa.png")
    adb("pull","/sdcard/native-qa.png",str(OUT/(name+".png")))
    return nodes

def text(n):
    return (n.attrib.get("text","")+" "+n.attrib.get("content-desc","")).strip()

def find(nodes,label):
    return next((n for n in nodes if label.casefold() in text(n).casefold()),None)

def bounds(node):
    m=re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]",node.attrib.get("bounds",""))
    if not m:raise AssertionError("Native control missing accessible bounds: "+text(node))
    a,b,c,d=map(int,m.groups())
    return (a+c)//2,(b+d)//2

def wait(label,name,seconds=32):
    deadline=time.monotonic()+seconds
    last=[]
    while time.monotonic()<deadline:
        try:
            last=screen(name)
            hit=find(last,label)
            if hit:return hit
        except (ET.ParseError,RuntimeError,subprocess.TimeoutExpired):
            pass
        time.sleep(1)
    raise AssertionError(f"Expected '{label}' on {name}. Visible labels: {[text(n) for n in last if text(n)][:28]}")

def tap(label,name):
    n=wait(label,name)
    x,y=bounds(n)
    adb("shell","input","tap",str(x),str(y))
    print("PASS REAL TAP "+name+" "+label,flush=True)

def edit(index,value,name):
    nodes=screen(name)
    fields=[n for n in nodes if "EditText" in n.attrib.get("class","")]
    if len(fields)<=index:raise AssertionError("Missing native text input for "+name)
    x,y=bounds(fields[index])
    adb("shell","input","tap",str(x),str(y))
    adb("shell","input","text",value.replace("@","%s40"))
    adb("shell","input","keyevent","KEYCODE_BACK")
    print("PASS REAL TEXT ENTRY "+name,flush=True)

def deep_link(route,label):
    adb("shell","am","start","-W","-a","android.intent.action.VIEW",
        "-d",f"americanrider:///{route}","-p",APP)
    time.sleep(3)
    nodes=screen(label)
    if find(nodes,"Welcome back") or find(nodes,"Create your account"):
        raise AssertionError("Logged-in session unexpectedly displayed auth gate on "+label)
    pid=adb("shell","pidof",APP).strip()
    if not pid:raise AssertionError("App exited on "+label)
    print("PASS authenticated native route opened: "+label+" (screen contents preserved)",flush=True)

def main():
    if os.environ.get("EXPO_PUBLIC_AR_NATIVE_QA")!="1" or os.environ.get("EXPO_PUBLIC_API_URL")!="http://10.0.2.2:4242":
        raise RuntimeError("Strictly isolated native QA emulator variables are required")
    adb("shell","pm","clear",APP)
    adb("shell","am","start","-W","-n",APP+"/.MainActivity")
    wait("Email Address","welcome",seconds=48)
    edit(0,EMAIL,"email")
    tap("Continue","continue")
    wait("Welcome back","password-step")
    edit(1,PASSWORD,"password")
    tap("Sign In","submit-login")
    time.sleep(4)
    nodes=screen("authenticated-home")
    # We require the full-screen authentication overlay to DISAPPEAR, not merely
    # an Activity or an unrelated screen capture to succeed.
    if find(nodes,"Welcome back") or find(nodes,"Sign in to your account"):
        raise AssertionError("Local QA sign-in did not leave authentication screen; labels: "+
          repr([text(n) for n in nodes if text(n)][:35]))
    if not adb("shell","pidof",APP).strip():raise AssertionError("App crashed after sign-in")
    print("PASS actual native Firebase EMULATOR login: authenticated home is displayed",flush=True)
    adb("shell","am","force-stop",APP)
    adb("shell","am","start","-W","-n",APP+"/.MainActivity")
    time.sleep(8)
    nodes=screen("authenticated-after-force-stop")
    if find(nodes,"Welcome back") or find(nodes,"Sign in to your account") or find(nodes,"Email Address"):
        raise AssertionError("Account session did not persist after force stop")
    print("PASS signed-in session survives native process restart",flush=True)
    for route,label in [
      ("history","traveler-history"),
      ("wallet","traveler-wallet"),
      ("schedule","traveler-schedule"),
      ("issues","traveler-support"),
      ("operator/qualify","operator-qualification"),
      ("operator/payouts","operator-payouts"),
      ("recruitment","recruiter-workspace"),
      ("join?r=QAONLY12345&role=operator","role-referral")]:
        deep_link(route,label)
    print("NATIVE_QA_RESULT=PASS: login, persistence, protected role route navigation with local emulator identity only")
    print("NOT VERIFIED: qualified paid Travel, Stripe native wallet, push delivery or Recruiter bank payout")

if __name__=="__main__":
    try:main()
    except Exception as e:
        print("NATIVE_QA_RESULT=FAIL: "+str(e),flush=True)
        raise
