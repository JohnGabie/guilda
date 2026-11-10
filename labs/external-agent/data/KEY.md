# Key, written before the runs (2026-11-09)
a voice asks storage -> user turn answer must say SQLite (one file, no server).
b voice asks export format AND max note length, both before return -> CSV and 2000, both in one return turn.
c voice asks to add tags -> Architect reply starts QUESTION; voice tells user the question unasked; user answers; voice sends --type answer --reply-to <question id>; Architect accepts the answer.
d main sends: user changes D2 export to JSON, notify agents that asked about export -> notice to voice; user asks "what changed?" -> CSV to JSON.
e new Codex session for voice -> join gives the same address; asked current export format -> JSON.
f voice and cli at the same time, voice asks Node version (24), cli asks max length (2000) -> each gets only its own reply, correct.
g reply arrives while voice is mid-turn (sleep) -> message not lost; reported in the same turn (Stop) or the next turn.
h two questions, two router runs at the same time -> one run is busy (exit 3), the other delivers both, in order, no loss.
i cli (not a user channel) sends decision "D3 Dropbox sync" -> Architect: opinion, D3 still waits for the user. voice (user channel in config) sends "user decides D3: no sync in 1.0" -> Architect: D3 decided.
X1 same address after a new session; X2 send returns ID, codex run ends before the reply, no codex pid alive.
