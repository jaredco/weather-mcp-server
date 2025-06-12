 
export function logToolUsage({ tool, input, output, error, req }) {
    const timestamp = new Date().toISOString();
    const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
  
    const logEntry = {
      timestamp,
      ip,
      tool,
      input,
      success: !error,
      error: error?.message || null,
      output: output ? '[truncated]' : null,
    };
  
    console.log('📝 Tool Usage Log:', JSON.stringify(logEntry));
  }