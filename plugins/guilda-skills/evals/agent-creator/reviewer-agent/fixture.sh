#!/usr/bin/env bash
set -eu
mkdir -p .claude-plugin src agents
cat > .claude-plugin/plugin.json <<'JSON'
{ "name": "shop-tools", "version": "0.1.0", "description": "Small helpers for a shop backend." }
JSON
cat > src/orders.py <<'PY'
import sqlite3
import requests

def find_order(db_path, order_id):
    conn = sqlite3.connect(db_path)
    return conn.execute("SELECT * FROM orders WHERE id = " + order_id).fetchone()

def notify(url, payload):
    return requests.post(url, json=payload, timeout=None)
PY
printf "requests==2.31.0\n" > requirements.txt
