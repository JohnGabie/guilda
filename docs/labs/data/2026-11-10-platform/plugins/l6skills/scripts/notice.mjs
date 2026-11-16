// Lab hook: print one systemMessage. It makes no permission decision, so it never refuses.
const event = process.argv[2] || 'unknown';
let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  process.stdout.write(JSON.stringify({ systemMessage: `L6 notice from ${event}` }));
});
