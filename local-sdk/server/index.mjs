import http from 'http';

export class Server {
  constructor(meta, { capabilities }) {
    this.meta = meta;
    this.capabilities = capabilities;
    this.handlers = {};
  }

  setRequestHandler(schema, handler) {
    this.handlers[schema] = handler;
  }

  async handle(request, context) {
    if (request.type === 'list_tools') {
      const handler = this.handlers['list_tools'];
      return await handler(request, context);
    }

    if (request.type === 'call-tool') {
      const tool = this.capabilities.tools[request.tool_id];
      if (!tool) {
        throw new Error(`Tool not found: ${request.tool_id}`);
      }

      return {
        output: await tool.handler(request.input, context)
      };
    }

    throw new Error(`Unsupported request type: ${request.type}`);
  }
}

export class HttpServerTransport {
  constructor(config) {
    this.config = config;
  }

  attachTo(server) {
    const httpServer = http.createServer(async (req, res) => {
      console.log(`🟢 Incoming ${req.method} request: ${req.url}`);

      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const json = JSON.parse(body);
            console.log(`📥 Parsed JSON:`, json);
            const response = await server.handle(json, { headers: req.headers });
            console.log(`📤 Responding with:`, response);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          } catch (err) {
            console.error(`❌ Error handling request:`, err);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Server error', details: err.message }));
          }
        });
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ status: "MCP server mock running" }));
      }
    });

    httpServer.listen(this.config.port, '0.0.0.0', () => {
      console.log(`✅ MCP mock server running at http://0.0.0.0:${this.config.port}`);
    });
  }
}
