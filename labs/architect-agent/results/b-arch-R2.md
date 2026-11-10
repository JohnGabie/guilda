A tag follows D5 (`@decided`):

- It is lowercase.
- It is 20 characters or fewer.
- It has no spaces.

If a tag breaks a rule, `add` and `tag` reject it with a clear error and save nothing (S4). The same validation function checks tags for both commands.

D5 does not restrict other characters, such as commas or `;`. That is why the `export` proposal (D17) separates tags in the CSV with a space, which a tag can never contain.

SUMMARY: Tag rules (D5, decided): lowercase, 20 characters or fewer, no spaces.
Invalid tags are rejected in `add` and `tag` with nothing saved (S4).
Other characters are not restricted, which is why the CSV export proposes a space as the tag separator.