# Checks that each sentence of the one-file arm is in the split arm (core file plus reference files),
# and lists the text that only the split arm has. Run from this folder: python3 -I check-same-text.py
import re, glob
one = open('arm-one/skills/architect/SKILL.md').read()
files = ['arm-split/skills/architect/SKILL.md'] + sorted(glob.glob('arm-split/skills/architect/reference/*.md'))
split = ''.join(open(f).read() for f in files)
def sents(t):
    out = []
    for line in t.splitlines():
        line = re.sub(r'^\s*(\d+\.\s*\*\*[^*]+\*\*|- |\d+\.)\s*', '', line).strip()
        if line:
            out += [s.strip() for s in re.split(r'(?<=[.!?:)])\s+(?=[A-Z`"])', line)]
    return out
miss = [s for s in sents(one) if s not in split]
extra = [s for s in sents(split) if s not in one]
print('sentences of arm-one missing from arm-split:', len(miss)); [print('  ' + m) for m in miss]
print('text only in arm-split:', len(extra)); [print('  ' + m) for m in extra]
