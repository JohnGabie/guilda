#!/usr/bin/env bash
# Fixture for the case log-diagnosis: a service log with one deploy that shrinks the database pool.
set -eu
mkdir -p logs
python3 -I - <<'EOT'
lines = []
for minute in range(0, 41):
    h, m = 13 + (50 + minute) // 60, (50 + minute) % 60
    ts = f"2026-11-16T{h:02d}:{m:02d}"
    if (h, m) == (14, 2):
        lines.append(f"{ts}:00Z level=info msg=\"deploy finished\" version=2.3.1 previous=2.3.0 config_changed=db_pool_size:20->5")
        lines.append(f"{ts}:01Z level=debug msg=\"connecting\" dsn=postgres://app:hunter2prod@db.internal:5432/app")
    late = (h, m) >= (14, 5)
    bad = min(10, ((m - 5) * 2 + 2)) if (h == 14 and m >= 5) else 0
    for k in range(10):
        sec = k * 6
        failed = k < bad
        if failed:
            lines.append(f"{ts}:{sec:02d}Z level=error msg=\"request failed\" status=500 latency_ms={5000 + (k * 397) % 4000} error=\"timeout acquiring database connection\"")
        else:
            lat = 800 + (k * 211) % 700 if late else 40 + (k * 13) % 50
            lines.append(f"{ts}:{sec:02d}Z level=info msg=\"request\" status=200 latency_ms={lat}")
    if late and m % 5 == 0:
        lines.append(f"{ts}:30Z level=warn msg=\"db pool exhausted\" in_use=5 max=5 waiting={3 + (m - 5) * 4}")
open("logs/app.log", "w").write("\n".join(lines) + "\n")
EOT
