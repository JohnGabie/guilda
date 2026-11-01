# QA knowledge

QA reads this file before each task. It serves the two QA phases (R22):

1. **Phase 1, the request.** Use part A. It tells how to record the evidence and how to drive a mobile app.
2. **Phase 2, around the change.** Use part B. It gives exploratory test techniques, oracles, usability heuristics and target-size rules.

Source rule: each item cites the page that was read. This file holds only confirmed items. An item that nobody read in its source is "not confirmed", and no agent rejects work because of it.
The project QA knowledge file holds the use of these items in the project.

Date of the source reads: 2026-10-28.

## Part A. Phase 1: the request

### A1. Record each criterion with evidence

Source: James Bach, "Exploratory Testing", <https://www.satisfice.com/exploratory-testing>.

- The page says that testing gathers and evaluates evidence, but never proves that the product works.
- So each result (`PASSED`, `FAILED`, `NOT VERIFIED`) has its evidence: a screenshot, log lines, or a command with its output.
- A criterion without evidence is `NOT VERIFIED`.

### A2. Drive a mobile app with `mobile-mcp`

Source: the `mobile-mcp` README, <https://github.com/mobile-next/mobile-mcp>.

- `mobile-mcp` is an MCP server that drives native apps on an Android emulator, a real Android device, an iOS simulator and a real iOS device.
- It reads the screen through the native accessibility tree. A screenshot with coordinates is the "only when needed" feature.
- `mobile_list_elements_on_screen` lists the screen elements with their coordinates and properties.
- `mobile_click_on_screen_at_coordinates` taps at x,y coordinates or on an element "by its ref".
- `mobile_batch_commands` runs several tools in sequence in one call, for example tap, type, tap. It can list the screen elements at the end.
- `mobile_open_url` opens http and https URLs in the device browser. Other schemes are blocked by default.
- `mobile_get_device_logs` collects the device log (logcat on Android).
- `mobile_list_crashes` and `mobile_get_crash` read the crash reports of the device.
- `mobile_save_screenshot` saves the screenshot to a file.
- `mobile_set_orientation` changes the screen orientation.

## Part B. Phase 2: around the change

### B1. Exploratory testing (James Bach)

Source: <https://www.satisfice.com/exploratory-testing>.

- Definition on the page: "Exploratory testing means performing tests while learning things that may influence the testing."
- No test is fully exploratory or fully scripted. The page treats the two as a continuum.
- Exploratory testing has structure. The structure comes from goals, skills, tools, limited time and the product itself.
- The explorer makes choices and is responsible for them.

### B2. Product elements of the HTSM (James Bach)

Source: Heuristic Test Strategy Model, version 6.0, 2024, by James Bach. PDF read at <https://developsense.com/htsm>. Satisfice page on the model: <https://www.satisfice.com/download/heuristic-test-strategy-model>.

The Satisfice page says that the HTSM has four areas: test techniques, project elements, product factors and quality criteria categories. The 6.0 PDF lists seven product elements:

| Element | Definition in the PDF |
|---|---|
| Structure | Everything that makes up the physical product. |
| Function | Everything that the product does. Includes error handling and security functions. |
| Data | Everything that the product processes and produces. Includes persistent data, cardinality (zero, one, many, maximum) and invalid data. |
| Interfaces | Every way to access the product. Includes user interfaces and system interfaces. |
| Platform | Everything that the product depends on outside the project. Includes the operating system and external components. |
| Operations | How the product will be used. Includes common use, disfavored use (careless, wrong, malicious) and extreme use. |
| Time | Every relation of the product to time. Includes fast or slow input, peaks, interruptions and concurrency. |

Quality criteria categories in the same PDF: Capability, Reliability, Usability, Charisma, Security, Scalability, Compatibility, Performance, Installability, Development. Under Usability, the PDF names Accessibility: the product meets accessibility standards and works with the accessibility features of the operating system.

### B3. Tours (James Whittaker)

Sources, on the archived blog of the author:

- "the touring test", 2009: <https://learn.microsoft.com/en-us/archive/blogs/james_whittaker/the-touring-test>
- "tour of the month: the landmark tour", 2009: <https://learn.microsoft.com/en-us/archive/blogs/james_whittaker/tour-of-the-month-the-landmark-tour>
- "tour of the month: the intellectual's tour", 2009: <https://learn.microsoft.com/en-us/archive/blogs/james_whittaker/tour-of-the-month-the-intellectuals-tour>

What the pages confirm:

- The author calls the tests *tours*, with the tourism metaphor. A walk with no direction is a bad way to learn a city.
- **Supermodel Tour**: look only at the interface and find surface bugs. The author recommends this tour for interface bugs.
- **Money Tour**: watch the sales demo and make variations of it as test cases.
- **Landmark Tour**: choose the main features (the ones that attract the user), shuffle their order and go from one to the next. Repeat with each feature used in a different way.
- **Skeptical customer tour** (a Landmark variation): do the Landmark tour and imagine a customer who asks "what if I want to do this?".
- **Intellectual's Tour**: ask the software hard questions. Which inputs get past the validation? Can every field of the form be wrong?
- **Arrogant American tour** (an Intellectual's variation): make obstacles on purpose and see how the software reacts.

### B4. HICCUPPS consistency oracles (Michael Bolton)

Source: "FEW HICCUPPS", Michael Bolton, 2012, <https://developsense.com/blog/2012/07/few-hiccupps>. The page says that the original list came from James Bach.

An oracle is the reference that shows that something is wrong. The page lists:

- **History**: the current version is consistent with the previous versions.
- **Image**: the system is consistent with the image that the organization wants to show.
- **Claims**: the system is consistent with what important people say about it, in writing or in conversation.
- **Comparable products**: the system is consistent with comparable products.
- **User desires**: the system is consistent with what a reasonable user wants.
- **Product**: each part of the system is consistent with similar parts of the same system.
- **Purpose**: the system is consistent with its explicit and implicit uses.
- **Statutes**: the system is consistent with the applicable laws and rules. The page later extends this to "Statutes and Standards".
- The page adds Familiarity, Explainability and World, which gives "(F)EW HICCUPPS".

### B5. The 10 usability heuristics (Jakob Nielsen)

Source: "10 Usability Heuristics for User Interface Design", Jakob Nielsen, Nielsen Norman Group, 1994, updated 2024, <https://www.nngroup.com/articles/ten-usability-heuristics/>.

| Heuristic | What the page says |
|---|---|
| 1. Visibility of system status | Keep the user informed with timely feedback. |
| 2. Match between the system and the real world | Use the language of the user, in a natural order. |
| 3. User control and freedom | Give a clear exit from unwanted actions. |
| 4. Consistency and standards | Keep words and actions uniform and follow the conventions of the platform. |
| 5. Error prevention | Remove error conditions or ask for confirmation before the action. |
| 6. Recognition rather than recall | Keep elements, actions and options visible. |
| 7. Flexibility and efficiency of use | Give shortcuts to experts without a cost to new users. |
| 8. Aesthetic and minimalist design | Remove irrelevant information so the essential stands out. |
| 9. Help users recognize, diagnose, and recover from errors | Describe the error in plain language, state the problem and suggest a solution. |
| 10. Help and documentation | Help is easy to search, focused on the task and short. |

### B6. Target size and contrast

- Android: "at least 48dp", with 8dp or more of space between targets. A 48x48dp target is about 9mm. Source: "Touch target size", Android Accessibility Help, <https://support.google.com/accessibility/android/answer/7101858>.
- Android: each interactive element has a touch area of at least 48dp x 48dp. Ready-made Material components in Jetpack Compose give this minimum. A custom element does not. Source: "Make apps more accessible", <https://developer.android.com/guide/topics/ui/accessibility/apps>.
- Android: text smaller than 18sp, or bold text smaller than 14sp, needs a contrast ratio of at least 4.5:1. Other text needs at least 3:1. Same source.
- Android: each interactive element has a description of its purpose for TalkBack. Same source.
- WCAG 2.2, criterion 2.5.8 Target Size (Minimum), level AA: the target is at least 24 by 24 CSS pixels. Exceptions: spacing, equivalent, inline in text, user agent control, essential. Source: <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>.
