export const CallToolRequestSchema = 'call-tool';
export const ListToolsRequestSchema = 'list-tools';

export class McpError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const ErrorCode = {
  UNAUTHORIZED: 'unauthorized',
};
