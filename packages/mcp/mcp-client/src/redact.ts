import type { Config } from './index.ts'

/**
 * Remove configured transport credentials and URL query values from an MCP failure before reporting it.
 * @param error Failure returned by the transport or server.
 * @param config Server configuration containing values that must be redacted.
 * @param includeName Whether to retain the error class name in the diagnostic.
 * @returns A diagnostic with credential values removed.
 */
export function sanitizeMcpError(error: unknown, config: Config, includeName = true): string {
  const values = config.transport === 'stdio' ? Object.values(config.env) : Object.values(config.headers)
  if (config.transport === 'streamable-http') {
    try { values.push(...new URL(config.url).searchParams.values()) } catch { /* Invalid URLs are reported without echoing them. */ }
  }
  values.push(...values.filter(value => /^Bearer\s+/i.test(value)).map(value => value.replace(/^Bearer\s+/i, '')))
  let message = error instanceof Error ? (includeName ? `${error.name}: ${error.message}` : error.message) : 'MCP request failed'
  for (const value of values.filter(Boolean).sort((a, b) => b.length - a.length)) {
    for (const candidate of [value, encodeURIComponent(value), encodeURI(value)]) message = message.split(candidate).join('[REDACTED]')
  }
  return message.replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/gi, '$1?[REDACTED]').slice(0, 1000)
}
