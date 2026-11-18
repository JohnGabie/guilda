# lab-experimenter-runs-with-criteria

Known limit: the shell of an eval session is read-only. A run that writes a file or a folder can fail for that reason
and not because of the agent. The grader accepts the raw output of each run in the report when the folder could not be written.
No product change covers this limit.
