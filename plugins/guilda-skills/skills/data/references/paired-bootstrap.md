# Paired bootstrap by question, standard library only

Use it when SciPy is not installed. It is the percentile bootstrap: it resamples question indices with
replacement and keeps the A and B values of a question together, as `scipy.stats.bootstrap(..., paired=True)` does
(S33 of the skill). SciPy's default method is BCa, which corrects bias and skew; with SciPy installed, prefer it.

Input: one row per run, with a question ID, an arm and a numeric value (1 or 0 for a pass, or tokens). Save the
script next to the analysis, not in the raw data folder, and run it with the raw file as an argument; it only reads
that file.

```python
#!/usr/bin/env python3
"""Paired bootstrap of the mean difference B - A, clustered by question.
Usage: python3 paired_bootstrap.py RAW.csv QUESTION_COL ARM_COL VALUE_COL ARM_A ARM_B"""
import csv, random, statistics, sys

RESAMPLES = 9999        # the SciPy default
CONFIDENCE = 0.95       # the SciPy default
SEED = 20261117         # fixed, so the report can be run again

raw, qcol, acol, vcol, arm_a, arm_b = sys.argv[1:7]
cells = {}
with open(raw, newline="") as f:
    for row in csv.DictReader(f):
        if row[vcol] == "":
            continue  # a missing value: report it in the exploration, never fill it in
        cells.setdefault(row[qcol], {}).setdefault(row[acol], []).append(float(row[vcol]))

pairs = [(statistics.mean(v[arm_a]), statistics.mean(v[arm_b]))
         for v in cells.values() if arm_a in v and arm_b in v]
diffs = [b - a for a, b in pairs]
n = len(diffs)
rng = random.Random(SEED)
means = sorted(statistics.mean(diffs[rng.randrange(n)] for _ in range(n)) for _ in range(RESAMPLES))
tail = (1 - CONFIDENCE) / 2
low, high = means[int(tail * RESAMPLES)], means[int((1 - tail) * RESAMPLES) - 1]
print(f"questions={n} mean_diff={statistics.mean(diffs):.4f} median_diff={statistics.median(diffs):.4f}")
print(f"{CONFIDENCE:.0%} paired bootstrap interval: [{low:.4f}, {high:.4f}]")
```

pass^k for one arm, from the same rows: the share of questions whose k runs all passed. A question with fewer than
k runs is reported apart, not counted as a pass.

```python
k = 3
full = [v[arm] for v in cells.values() if len(v.get(arm, [])) >= k]
pass_k = sum(all(x == 1 for x in runs[:k]) for runs in full) / len(full)
```
