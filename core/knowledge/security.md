# Security knowledge

Security reads this file before each review. The Architect reads it during a Security consultation.

Source rule: each item cites the official page that was read. Text in quotes is a copy of the page. This file holds only confirmed items.
An item that nobody read in its source is "not confirmed". Security never rejects work because of a not confirmed item (SEC2). Security records it as a note.
The project security knowledge file holds the use of these items in the project.

Date of the source reads: 2026-10-28.

## 1. OWASP Top 10 2025

Links:
- List: https://top10.owasp.org/2025/
- Introduction: https://top10.owasp.org/2025/0x00_2025-Introduction/
- A01: https://top10.owasp.org/2025/A01_2025-Broken_Access_Control/
- A07: https://top10.owasp.org/2025/A07_2025-Authentication_Failures/
- A10: https://top10.owasp.org/2025/A10_2025-Mishandling_of_Exceptional_Conditions/

What the source says:
- The 10 categories: A01 Broken Access Control; A02 Security Misconfiguration; A03 Software Supply Chain Failures; A04 Cryptographic Failures; A05 Injection; A06 Insecure Design; A07 Authentication Failures; A08 Software or Data Integrity Failures; A09 Security Logging and Alerting Failures; A10 Mishandling of Exceptional Conditions.
- The introduction says: "There are two new categories and one consolidation in the Top Ten for 2025."
- SSRF is now in A01: "Server-Side Request Forgery (SSRF) has been rolled into this category."
- A03 is "an expansion of A06:2021-Vulnerable and Outdated Components".
- A10 "is a new category for 2025".
- A01, prevention: "Except for public resources, deny by default." The control must "enforce record ownership". A01 lists IDOR: to view or edit the account of another user "by providing its unique identifier".
- A01, prevention: log access control failures and rate limit API calls.
- A07, prevention: "Limit or increasingly delay failed login attempts but be careful not to create a denial of service scenario." "Use a server-side, secure, built-in session manager that generates a new random session ID with high entropy after login." "Session identifiers should not be in the URL, be securely stored in a secure cookie, and invalidated after logout, idle, and absolute timeouts."
- A10, prevention: have a global exception handler. In an interrupted transaction, roll back all parts ("failing closed").

## 2. OWASP ASVS 5.0

Links:
- Official page: https://asvs.dev/
- Chapter text (official OWASP repository): https://github.com/OWASP/ASVS/tree/master/5.0/en

Read note: the root of `asvs.dev` was read. The chapter pages on `asvs.dev` refused access (HTTP 403). The chapter text below was read in the official `OWASP/ASVS` repository on GitHub, folder `5.0/en`.

What the source says:
- Version: "The latest stable version is version 5.0.0 (dated May 2025)."
- Chapters V1 to V17. Among them: V6 Authentication, V7 Session Management, V8 Authorization, V14 Data Protection, V16 Security Logging and Error Handling.
- Levels (file `0x03-What-is-the-ASVS.md`): "The ASVS defines three security verification levels". About level 2: "Most applications should be striving to achieve this level of security." The organization chooses the level "depending on the sensitivity of the application".
- 8.2.2 (level 1): access to data is limited to users with explicit permission on that item, against IDOR and BOLA.
- 8.3.1 (level 1): the authorization rule runs in a trusted service layer, not in a control that the client can change, such as JavaScript in the browser.
- 6.1.1 (level 1): the documentation defines rate limits and anti-automation against credential stuffing and brute force.
- 14.2.1 (level 1): sensitive data goes only in the HTTP body or headers. The URL and the query string carry no sensitive data.
- 14.2.3 (level 2): sensitive data does not go to untrusted third parties, such as trackers.
- 14.3.3 (level 2): browser storage (localStorage, sessionStorage, IndexedDB, cookies) holds no sensitive data, except session tokens.
- 16.2.5 (level 2): logs of sensitive data follow the protection level of that data. Credentials and payment data can be forbidden in logs.
- 16.5.1 (level 2): an unexpected error returns a generic message, with no stack trace, query, key or token.
- 16.5.3 (level 2): the application fails securely, with no "fail-open".

## 3. OWASP Webhook Security Cheat Sheet

Link: https://cheatsheetseries.owasp.org/cheatsheets/Webhook_Security_Cheat_Sheet.html

What the source says:
- A webhook with no authentication of its own is "a public, unauthenticated POST handler".
- HTTPS: "Require HTTPS on every webhook endpoint and reject plain HTTP."
- Signature: "Supply the raw request body before your framework parses it." Compare the HMAC with a constant-time function. "Never use ==".
- Missing or wrong signature: "Return 401 when the signature is missing or does not match, and do not say why."
- Secret: keep it in a secrets manager, never in the code. "Redact secrets and signature header values from logs and error responses." One secret for each webhook.
- Compromised secret: "revoke the old secret immediately and replace it".
- Extra authentication: the table names "Static bearer token or API key" for simple integrations, kept in the secrets manager and rotated like a signing secret. IP allowlist: "Extra layer only."
- Replay: "A captured delivery carries a valid signature, so signature verification alone does not stop repeated processing."
- Idempotency: "After verifying the delivery, persist processed event IDs and skip repeats". Keep this record for the full retry period of the sender.
- A duplicate that was already processed: return 200 and do not repeat the effect.
- Order: "Do not assume in-order delivery." Fetch the current state of the object from the API of the sender when an event can be stale.
- Response: confirm fast and process through an asynchronous queue. Return 200 only after the event is stored or processed.
- Input: a body size limit, the expected Content-Type, schema validation.
- Method: accept only POST. Other methods get 405.
- CSRF: exempt only the webhook route, and only after the verification is in place.
- Logs: "Do not log full request bodies (they often contain personal data), signing secrets, or Authorization and signature header values".
- Tests: a missing signature returns 401. The same event delivered two times is processed one time. A body that is too large returns 400 or 413.

## 4. OWASP Top 10 for LLM Applications 2025

Links:
- List: https://genai.owasp.org/llm-top-10/
- LLM01: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- LLM02: https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/
- LLM05: https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/
- LLM06: https://genai.owasp.org/llmrisk/llm062025-excessive-agency/
- LLM07: https://genai.owasp.org/llmrisk/llm072025-system-prompt-leakage/
- LLM09: https://genai.owasp.org/llmrisk/llm092025-misinformation/
- LLM10: https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/

What the source says:
- The 10 entries: LLM01 Prompt Injection; LLM02 Sensitive Information Disclosure; LLM03 Supply Chain; LLM04 Data and Model Poisoning; LLM05 Improper Output Handling; LLM06 Excessive Agency; LLM07 System Prompt Leakage; LLM08 Vector and Embedding Weaknesses; LLM09 Misinformation; LLM10 Unbounded Consumption.
- LLM01: "A Prompt Injection Vulnerability occurs when user prompts alter the LLM's behavior or output in unintended ways." Mitigations: define the output format and validate it with deterministic code; least privilege; human approval for high-risk actions ("human-in-the-loop"); separate and mark untrusted external content.
- LLM02: sensitive information includes "personal identifiable information (PII), financial details, health records". Mitigation: "Limit access to sensitive data based on the principle of least privilege."
- LLM05: model output with no handling "can result in XSS and CSRF in web browsers". Mitigation: "Encode model output back to users to mitigate undesired code execution by JavaScript or Markdown." Use parameterized queries for database operations with model output.
- LLM06: "Implement authorization in downstream systems rather than relying on an LLM to decide if an action is allowed or not." Require human approval for high-impact actions.
- LLM07: put no sensitive data (keys, database names, roles, permissions) in the system prompt. Critical controls such as authorization must not depend on the model.
- LLM09: an unsupported claim is "especially harmful in sensitive contexts such as healthcare". Mitigation: automatic validation of important outputs and human oversight.
- LLM10: "Denial of Wallet" is an attack on the pay-per-use cost of the AI service. The listed mitigations include "Rate Limiting", "Timeouts and Throttling" and "Input Validation".

## 5. OWASP MASVS

Links:
- Official page: https://mas.owasp.org/MASVS/
- MASVS-STORAGE-1: https://mas.owasp.org/MASVS/controls/MASVS-STORAGE-1/
- MASVS-STORAGE-2: https://mas.owasp.org/MASVS/controls/MASVS-STORAGE-2/
- MASVS-NETWORK-1: https://mas.owasp.org/MASVS/controls/MASVS-NETWORK-1/
- MASVS-AUTH-1: https://mas.owasp.org/MASVS/controls/MASVS-AUTH-1/
- MASVS-PLATFORM-1: https://mas.owasp.org/MASVS/controls/MASVS-PLATFORM-1/
- MASVS-PRIVACY-1: https://mas.owasp.org/MASVS/controls/MASVS-PRIVACY-1/

Read note: the `MASVS/` page gives the groups and their descriptions. The text of each control was read on the page of that control, listed above.

What the source says:
- Eight control groups: MASVS-STORAGE ("Secure storage of sensitive data on a device"), MASVS-CRYPTO, MASVS-AUTH, MASVS-NETWORK ("Secure network communication between the mobile app and remote endpoints"), MASVS-PLATFORM, MASVS-CODE, MASVS-RESILIENCE, MASVS-PRIVACY.
- MASVS-STORAGE-1: "The app securely stores sensitive data."
- MASVS-STORAGE-2: "The app prevents leakage of sensitive data." The control page says that sensitive data is exposed by accident, "typically as a side-effect of using certain APIs, system capabilities such as backups or logs". The related weaknesses include "MASWE-0005: Insertion of Sensitive Data into Logs" and "MASWE-0006: Sensitive Data Not Excluded From Backup".
- MASVS-NETWORK-1: "The app secures all network traffic according to the current best practices."
- MASVS-AUTH-1: the enforcement of authentication and authorization "must be on the remote endpoint".
- MASVS-PLATFORM-1: "The app uses IPC mechanisms securely." The related weaknesses name insecure deep links and misuse of the clipboard.
- MASVS-PRIVACY-1: "The app minimizes access to sensitive data and resources."
