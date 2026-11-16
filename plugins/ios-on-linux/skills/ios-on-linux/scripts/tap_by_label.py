#!/usr/bin/env python3
"""Print the centre "x,y" (points) of the first element whose label matches, from `mobilecli dump ui`.

usage: tap_by_label.py LABEL [--device UDID] [--type Button] [--contains]
Exits 1 if nothing matches. Feed the output to `mobilecli io tap`.
"""
import argparse, glob, json, os, shutil, subprocess, sys

def mobilecli():
    found = shutil.which("mobilecli")
    if found:
        return found
    hits = glob.glob(os.path.expanduser(
        "~/.npm-global/lib/node_modules/@mobilenext/mobile-mcp/node_modules/@mobilenext/mobilecli-linux-*/mobilecli-linux-*"))
    if hits:
        return hits[0]
    sys.exit("mobilecli not found")

def first_ios_device(mc):
    out = subprocess.run([mc, "devices"], capture_output=True, text=True, timeout=60).stdout
    for d in json.loads(out)["data"]["devices"]:
        if d.get("platform") == "ios":
            return d["id"]
    sys.exit("no iOS device")

def walk(node):
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("label")
    ap.add_argument("--device")
    ap.add_argument("--type", help="element type, e.g. Button (default: any)")
    ap.add_argument("--contains", action="store_true", help="substring match, case-insensitive")
    a = ap.parse_args()
    mc = mobilecli()
    dev = a.device or first_ios_device(mc)
    out = subprocess.run([mc, "dump", "ui", "--device", dev], capture_output=True, text=True, timeout=60).stdout
    tree = json.loads(out)
    want = a.label.lower()
    candidates = []
    for n in walk(tree):
        label, rect = n.get("label"), n.get("rect")
        if not isinstance(label, str) or not rect or not rect.get("width"):
            continue
        ok = want in label.lower() if a.contains else label == a.label
        if ok and (not a.type or n.get("type") == a.type):
            candidates.append(n)
    if not candidates:
        sys.exit(1)
    # prefer buttons, they are the tappable container around the text
    candidates.sort(key=lambda n: n.get("type") != "Button")
    r = candidates[0]["rect"]
    print(f"{r['x'] + r['width'] // 2},{r['y'] + r['height'] // 2}")

if __name__ == "__main__":
    main()
