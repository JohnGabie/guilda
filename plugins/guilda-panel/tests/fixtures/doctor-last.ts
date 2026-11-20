// A .guilda/.doctor-last.json in the form of section 4h of the 0.3.0 spec. The test kit loads only code
// files, so the fixture is a module. An UNKNOWN line comes before the FAIL line.
export const DOCTOR_LAST = {
  at: '2026-11-20T09:55:00.000Z',
  lines: [
    { check: 'config', result: 'PASS', evidence: '.guilda/config.json parses' },
    { check: 'status line', result: 'UNKNOWN', evidence: 'no settings file' },
    { check: 'hooks live', result: 'FAIL', evidence: 'no SessionStart hook ran' },
  ],
}
