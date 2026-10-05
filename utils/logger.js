const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  upstreamRequests: 0,
  cacheHits: 0,
  quotaFailures: 0,
  byTool: {},
  byQueryType: {}
};

export function recordUsage({ tool, queryType, success, cacheHit = false, upstreamRequest = false, error }) {
  const completed = success !== undefined || Boolean(error);
  if (completed) metrics.totalRequests += 1;
  if (success) metrics.successfulRequests += 1;
  if (error) metrics.failedRequests += 1;
  if (upstreamRequest) metrics.upstreamRequests += 1;
  if (cacheHit) metrics.cacheHits += 1;
  if (error?.code === 'QUOTA_EXHAUSTED') metrics.quotaFailures += 1;
  if (completed && tool) metrics.byTool[tool] = (metrics.byTool[tool] || 0) + 1;
  if (completed && queryType) metrics.byQueryType[queryType] = (metrics.byQueryType[queryType] || 0) + 1;
}

export function logToolUsage({ tool, input, output, error }) {
  // Never log location, client IP, the full request body, or provider payloads.
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: 'weathertrax.tool',
    tool,
    query_type: input?.query_type || 'planning',
    success: !error,
    output: Boolean(output),
    error_code: error?.code || null
  }));
}

export function getUsageMetrics() {
  return { generated_at: new Date().toISOString(), ...metrics };
}
