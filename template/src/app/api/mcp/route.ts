import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import config from '@payload-config'
import { getPayload } from 'payload'

import { createMcpServer } from '@/mcp/server'

const deny = (status: number, message: string) =>
  Response.json(
    { error: message },
    { headers: status === 401 ? { 'WWW-Authenticate': 'Bearer' } : undefined, status },
  )

export async function POST(request: Request) {
  const key = request.headers.get('authorization')?.match(/^Bearer ([\w-]{16,200})$/)?.[1]
  if (!key) return deny(401, 'Add your site key as a Bearer token.')

  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({
    headers: new Headers({ Authorization: `users API-Key ${key}` }),
  })
  if (!user) return deny(401, 'That site key is not valid.')
  if (!user.roles?.includes('admin')) return deny(403, 'Only the site owner can use this.')

  const url = new URL(request.url)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const protocol = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')
  const baseUrl = forwardedHost ? `${protocol}://${forwardedHost}` : url.origin

  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  })
  await createMcpServer(payload, user, baseUrl).connect(transport)
  return transport.handleRequest(request)
}

// Each request stands alone, so there is no session to open or close.
const notAllowed = () => deny(405, 'Use POST.')
export const DELETE = notAllowed
export const GET = notAllowed
