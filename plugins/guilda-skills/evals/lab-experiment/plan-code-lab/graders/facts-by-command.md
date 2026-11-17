---
type: llm
weight: 1
---

The plan in your answer (the same text as lab/plan.md) lists at least 4 adoption facts of the package (from: license, last release date, last commit or activity, number of maintainers, known vulnerabilities, a similar popular name, indirect dependencies) and gives a command or tool that will collect each one (for example npm view, gh api, osv-scanner --offline, deps.dev). It says the facts are collected by command and not taken from memory, and it states no value of these facts as already known (no version number, no license, no maintainer count written as a fact). FAIL if fewer than 4 facts have a command, or one of these values is written as known.
