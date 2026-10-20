import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'
function server() {
  const mcp = new McpServer({ name: 'toolbox-fixture', version: '1.0.0' }, { instructions: 'TOOLBOX_PRIVATE_INSTRUCTIONS' })
  mcp.registerTool('ping', { description: 'Return pong', inputSchema: z.object({}) }, async () => ({ content: [{ type: 'text', text: 'pong' }] }))
  mcp.registerTool('crash', { description: 'Crash after reply', inputSchema: z.object({}) }, async () => {
    setTimeout(() => process.exit(7), 25)
    return { content: [{ type: 'text', text: 'crashing' }] }
  })
  mcp.registerResource('memo', 'memo://private', { description: 'Private resource' }, async () => ({ contents: [{ uri: 'memo://private', text: 'private memo' }] }))
  return mcp
}
serveStdio(server)
