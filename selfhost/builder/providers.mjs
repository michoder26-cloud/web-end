// Provider adapters. Every adapter takes the same neutral conversation and tool list and returns the
// same shape, so the Studio never depends on one company:
//   chat({ system, messages, tools, signal }) → { text, toolCalls: [{ id, name, arguments }], usage: { input, output }, stop }
// Neutral messages: { role: 'user', text } | { role: 'assistant', text, toolCalls } | { role: 'tool', toolCallId, name, text }
//
// 'openai' speaks the OpenAI-compatible Chat Completions API, which OpenAI, OpenRouter, Groq, Mistral,
// DeepSeek, Google Gemini (its /v1beta/openai endpoint), LM Studio, vLLM and llama.cpp servers accept.
// 'ollama' is the same API on this computer, with no key. 'anthropic' speaks the Messages API.
// No adapter ever falls back to another provider: if the chosen one fails, the run stops and says why.

export const providerKinds = {
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', key: true, label: 'Anthropic (Claude)', local: false },
  ollama: { baseUrl: 'http://127.0.0.1:11434/v1', key: false, label: 'Ollama (on this computer)', local: true },
  openai: { baseUrl: 'https://api.openai.com/v1', key: true, label: 'OpenAI-compatible (OpenAI, OpenRouter, Gemini, Groq, LM Studio…)', local: false },
}

export class ProviderError extends Error {
  constructor(message, { retryable = false, status = 0 } = {}) {
    super(message)
    this.retryable = retryable
    this.status = status
  }
}

const trimSlash = (url) => url.replace(/\/+$/, '')

async function post(url, headers, body, signal) {
  let response
  try {
    response = await fetch(url, { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers }, method: 'POST', signal })
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') throw new ProviderError('The AI took too long to answer, so the Studio stopped waiting.', { retryable: true })
    throw new ProviderError(`Could not reach the AI service at ${new URL(url).host}: ${error.cause?.code ?? error.message}`, { retryable: true })
  }
  const text = await response.text()
  if (!response.ok) {
    let detail = text.slice(0, 300)
    try {
      const parsed = JSON.parse(text)
      detail = parsed.error?.message ?? parsed.message ?? detail
    } catch {
      // Not JSON: keep the start of the text.
    }
    const retryable = response.status === 429 || response.status >= 500
    const hint = response.status === 401 || response.status === 403 ? ' Check the API key in Settings.' : response.status === 404 ? ' Check the model name and the address in Settings.' : ''
    throw new ProviderError(`The AI service answered ${response.status}: ${detail}${hint}`, { retryable, status: response.status })
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new ProviderError('The AI service sent an answer that is not JSON.')
  }
}

/** JSON Schemas from MCP tools, cleaned for providers that are strict about schema keywords. */
const cleanSchema = (schema) => {
  if (!schema || typeof schema !== 'object') return { properties: {}, type: 'object' }
  const copy = JSON.parse(JSON.stringify(schema))
  delete copy.$schema
  if (copy.type !== 'object') return { properties: { value: copy }, type: 'object' }
  copy.properties ??= {}
  return copy
}

function openaiAdapter({ apiKey, baseUrl, model, kind }) {
  const url = `${trimSlash(baseUrl || providerKinds[kind].baseUrl)}/chat/completions`
  return {
    kind,
    model,
    async chat({ maxTokens = 4096, messages, signal, system, tools }) {
      const wire = [{ content: system, role: 'system' }]
      for (const message of messages) {
        if (message.role === 'user') wire.push({ content: message.text, role: 'user' })
        else if (message.role === 'assistant')
          wire.push({
            content: message.text || null,
            role: 'assistant',
            ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map((call) => ({ function: { arguments: JSON.stringify(call.arguments ?? {}), name: call.name }, id: call.id, type: 'function' })) } : {}),
          })
        else if (message.role === 'tool') wire.push({ content: message.text, role: 'tool', tool_call_id: message.toolCallId })
      }
      const body = {
        max_tokens: maxTokens,
        messages: wire,
        model,
        ...(tools.length ? { tool_choice: 'auto', tools: tools.map((tool) => ({ function: { description: tool.description.slice(0, 1024), name: tool.name, parameters: cleanSchema(tool.inputSchema) }, type: 'function' })) } : {}),
      }
      const data = await post(url, apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, body, signal)
      const choice = data.choices?.[0]
      if (!choice) throw new ProviderError('The AI service sent no answer.')
      const toolCalls = (choice.message?.tool_calls ?? []).map((call, index) => {
        let parsed = {}
        try {
          parsed = typeof call.function?.arguments === 'string' ? JSON.parse(call.function.arguments || '{}') : (call.function?.arguments ?? {})
        } catch {
          parsed = { __invalid_json: String(call.function?.arguments).slice(0, 500) }
        }
        return { arguments: parsed, id: call.id || `call_${Date.now()}_${index}`, name: call.function?.name ?? '' }
      })
      return {
        stop: choice.finish_reason ?? '',
        text: typeof choice.message?.content === 'string' ? choice.message.content : '',
        toolCalls,
        usage: { input: Number(data.usage?.prompt_tokens ?? 0), output: Number(data.usage?.completion_tokens ?? 0) },
      }
    },
  }
}

function anthropicAdapter({ apiKey, baseUrl, model }) {
  const url = `${trimSlash(baseUrl || providerKinds.anthropic.baseUrl)}/messages`
  return {
    kind: 'anthropic',
    model,
    async chat({ maxTokens = 4096, messages, signal, system, tools }) {
      const wire = []
      const push = (role, block) => {
        const last = wire.at(-1)
        if (last?.role === role) last.content.push(block)
        else wire.push({ content: [block], role })
      }
      for (const message of messages) {
        if (message.role === 'user') push('user', { text: message.text, type: 'text' })
        else if (message.role === 'assistant') {
          if (message.text) push('assistant', { text: message.text, type: 'text' })
          for (const call of message.toolCalls ?? []) push('assistant', { id: call.id, input: call.arguments ?? {}, name: call.name, type: 'tool_use' })
        } else if (message.role === 'tool') push('user', { content: message.text, is_error: Boolean(message.isError), tool_use_id: message.toolCallId, type: 'tool_result' })
      }
      const body = {
        max_tokens: maxTokens,
        messages: wire,
        model,
        system,
        ...(tools.length ? { tools: tools.map((tool) => ({ description: tool.description.slice(0, 1024), input_schema: cleanSchema(tool.inputSchema), name: tool.name })) } : {}),
      }
      const data = await post(url, { 'anthropic-version': '2023-06-01', 'x-api-key': apiKey }, body, signal)
      const content = data.content ?? []
      return {
        stop: data.stop_reason ?? '',
        text: content.filter((block) => block.type === 'text').map((block) => block.text).join('\n'),
        toolCalls: content.filter((block) => block.type === 'tool_use').map((block) => ({ arguments: block.input ?? {}, id: block.id, name: block.name })),
        usage: { input: Number(data.usage?.input_tokens ?? 0), output: Number(data.usage?.output_tokens ?? 0) },
      }
    },
  }
}

export function makeProvider({ apiKey = '', baseUrl = '', kind, model }) {
  if (!providerKinds[kind]) throw new ProviderError(`Unknown AI provider "${kind}".`)
  if (!model) throw new ProviderError('Choose a model in Settings first.')
  if (providerKinds[kind].key && !apiKey && !baseUrl) throw new ProviderError('Add an API key in Settings first, or choose Ollama to use a model on this computer.')
  return kind === 'anthropic' ? anthropicAdapter({ apiKey, baseUrl, model }) : openaiAdapter({ apiKey, baseUrl, kind, model })
}

/**
 * Checks what a provider and model can really do, instead of trusting that "compatible" means the same:
 * it must answer, and it must call a tool when asked to.
 */
export async function probeProvider(provider) {
  const started = Date.now()
  const tool = { description: 'Reports that the connection works.', inputSchema: { properties: { ok: { type: 'boolean' } }, required: ['ok'], type: 'object' }, name: 'report_connection' }
  const answer = await provider.chat({
    maxTokens: 200,
    messages: [{ role: 'user', text: 'Call the report_connection tool with ok set to true. Do not write anything else.' }],
    signal: AbortSignal.timeout(60_000),
    system: 'You are testing a connection.',
    tools: [tool],
  })
  const called = answer.toolCalls.some((call) => call.name === 'report_connection')
  return { answers: true, milliseconds: Date.now() - started, toolCalling: called, usage: answer.usage }
}
