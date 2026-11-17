# A stub of analyze-token-usage.py: it prints the recorded output form of the installed version.
import pathlib
import sys

sys.stdout.write((pathlib.Path(__file__).parent / "analyzer-output.txt").read_text())
