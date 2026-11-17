#!/usr/bin/env bash
# Fixture: a booking API with a log that shows a pool of 10 connections running out at 09:00.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p docs/superpowers/specs logs
cat > docs/superpowers/specs/2026-11-10-booking.md <<'MD'
# Booking spec

@decided A booking API on one VPS with 2 vCPU and 4 GB of memory, and a PostgreSQL on the same machine.
@decided 200 users log in between 08:50 and 09:10 every weekday.
@open Why the API is slow and returns errors at 09:00.
MD
{
  for i in 1 2 3; do echo "2026-11-09T08:4$i:11Z INFO  GET /bookings 200 41ms pool=3/10"; done
  for i in 1 2 3 4; do echo "2026-11-09T09:0$i:02Z WARN  GET /bookings 200 2310ms pool=10/10 waiting=37"; done
  for i in 1 2 3; do echo "2026-11-09T09:0$i:40Z ERROR timeout acquiring database connection after 5000ms pool=10/10"; done
  for i in 1 2 3; do echo "2026-11-09T09:2$i:11Z INFO  GET /bookings 200 38ms pool=2/10"; done
} > logs/app.log
echo "2026-11-09T09:03:00Z cpu=38% mem=61% load=0.9" > logs/host.log
git add .
git commit -q -m "docs: the booking spec and logs"
