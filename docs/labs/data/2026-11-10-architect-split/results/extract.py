import json, sys, os, re
out, D = sys.argv[1], sys.argv[2]
order = json.load(open(f"{D}/order.json"))["runs"]
key = json.load(open(f"{D}/key.json"))
refsize = {f: os.path.getsize(f"{D}/arm-split/skills/architect/reference/{f}") for f in os.listdir(f"{D}/arm-split/skills/architect/reference")}
skillsize = {"one": os.path.getsize(f"{D}/arm-one/skills/architect/SKILL.md"), "split": os.path.getsize(f"{D}/arm-split/skills/architect/SKILL.md")}
rows = []; answers = {}
for r in order:
    rid = r["id"]; p = f"{out}/{rid}.jsonl"
    reads, skills, result = [], [], None
    for line in open(p):
        try: e = json.loads(line)
        except Exception: continue
        if e.get("type") == "assistant":
            for c in e["message"].get("content", []):
                if c.get("type") == "tool_use":
                    if c["name"] == "Read": reads.append(c["input"].get("file_path", ""))
                    if c["name"] == "Skill": skills.append(c["input"].get("skill", ""))
        if e.get("type") == "result": result = e
    meta = open(f"{out}/{rid}.meta").read()
    row = dict(id=rid, situation=r["situation"], arm=r["arm"], rep=r["rep"],
               exit=re.search(r"exit=(\d+)", meta).group(1), seconds=int(re.search(r"seconds=(\d+)", meta).group(1)))
    if result:
        mu = result.get("modelUsage", {})
        row["models"] = {m: dict(input=v.get("inputTokens", 0), cache_creation=v.get("cacheCreationInputTokens", 0), cache_read=v.get("cacheReadInputTokens", 0), output=v.get("outputTokens", 0)) for m, v in mu.items()}
        for k in ("input", "cache_creation", "cache_read", "output"):
            row[k] = sum(v[k] for v in row["models"].values())
        row["input_total"] = row["input"] + row["cache_creation"] + row["cache_read"]
        row["turns"] = result.get("num_turns"); row["cost_usd"] = result.get("total_cost_usd"); row["is_error"] = result.get("is_error")
        answers[rid] = result.get("result", "")
    else:
        row["no_result"] = True
    refs = [os.path.basename(x) for x in reads if "/reference/" in x]
    row["skill_calls"] = skills
    row["reference_reads"] = refs
    row["other_reads"] = [re.sub(r"^/tmp/tmp\.[^/]+", "<tmp>", x) for x in reads if "/reference/" not in x]
    row["correct_reference"] = key["reference"][r["situation"]]
    row["read_correct"] = key["reference"][r["situation"]] in refs if r["arm"] == "split" else None
    row["est_arch_tokens"] = (skillsize[r["arm"]] + sum(refsize.get(f, 0) for f in set(refs))) // 4
    rows.append(row)
json.dump(rows, open(sys.argv[3], "w"), indent=1)
json.dump(answers, open(sys.argv[4], "w"), indent=1)
