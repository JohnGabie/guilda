#!/usr/bin/env bash
# Fixture: an invoice reading feature where the accuracy and token count are unknown.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p docs/superpowers/specs src
cat > docs/superpowers/specs/2026-11-10-invoices.md <<'MD'
# Invoice reading spec

@decided About 600 supplier invoices arrive each month as scanned PDFs, 1 to 3 pages each.
@decided The feature reads 6 fields: supplier, date, number, total, tax and currency. A person confirms each result.
@decided At least 95 percent of the totals must be right before the feature goes live.
@open Whether a model can read these scans at that accuracy, and how many tokens one invoice uses. Nobody has measured it.
MD
printf "export function readInvoice(pdfPath) { throw new Error('todo'); }\n" > src/invoice.js
git add .
git commit -q -m "docs: the invoice reading spec"
