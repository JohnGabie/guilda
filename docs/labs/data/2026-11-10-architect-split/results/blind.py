import json, sys, random, re
answers = json.load(open(sys.argv[1])); rows = json.load(open(sys.argv[2]))
sit = {r["id"]: r["situation"] for r in rows}
ids = sorted(answers); random.Random(4242).shuffle(ids)
labels = {}; blind = []
for i, rid in enumerate(ids):
    lab = f"X{i+1:02d}"; labels[lab] = rid
    t = answers[rid]
    t = re.sub(r"arm-(one|split)", "the-skill", t)
    t = re.sub(r"(/tmp/[^\s`)]*|reference/[a-z-]+\.md|\breference file\w*)", "<path>", t)
    blind.append({"label": lab, "situation": sit[rid], "answer": t})
json.dump(blind, open(sys.argv[3], "w"), indent=1)
json.dump(labels, open(sys.argv[4], "w"), indent=1)
