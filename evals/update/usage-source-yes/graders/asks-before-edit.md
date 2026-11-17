---
type: regex
target: trace
pattern: '\{"type":"assistant","message":\{[^\n]*"type":"text","text":"(?:[^"\\]|\\.)*usage\.source(?:[^"\\]|\\.)*\?[\s\S]*\{"type":"assistant","message":\{[^\n]*"name":"Edit","input":\{[^\n]*config\.json'
weight: 1
---

An assistant reply asks the usage.source question before the Edit of .guilda/config.json (the order of S41).
