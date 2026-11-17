// A fake `claude -p --output-format stream-json` run: prints JSON events, then exits with the first argument.
const code = Number(process.argv[2] ?? 0);
const mode = process.argv[3] ?? 'ok';
const out = (o) => console.log(JSON.stringify(o));
out({ type: 'system', subtype: 'init' });
out({
  type: 'assistant',
  message: { model: 'fake-model-a', usage: { input_tokens: 10, cache_read_input_tokens: 5, cache_creation_input_tokens: 2, output_tokens: 7 } },
});
if (mode === 'limit') out({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour' } });
else out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } });
if (mode === 'ok') {
  out({
    type: 'result',
    usage: { input_tokens: 10, output_tokens: 7 },
    modelUsage: {
      'fake-model-a': { inputTokens: 12, outputTokens: 30, cacheReadInputTokens: 6, cacheCreationInputTokens: 3 },
      'fake-model-b': { inputTokens: 1, outputTokens: 2, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
    },
  });
}
process.exit(code);
