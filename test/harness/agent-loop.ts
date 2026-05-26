/**
 * Claude tool-use loop bound to an MCP client.
 *
 * Bridges two protocols: the Anthropic Messages API (which speaks
 * `tool_use` / `tool_result` content blocks) and MCP (which speaks
 * `tools/call` JSON-RPC). Each turn:
 *
 * 1. Send the conversation to Claude with the MCP server's tool list.
 * 2. If Claude emits `tool_use` blocks, execute them against the MCP
 *    client, append the results as a `user` turn carrying `tool_result`
 *    blocks, and loop.
 * 3. If Claude returns plain text (no tool_use), that's the final answer;
 *    return the accumulated outcome.
 *
 * Outcome carries the tool-call trace, the final assistant message, and
 * convenience helpers (`calledTool`, `calledInOrder`) so scenarios can
 * assert on agent behaviour without parsing message blocks themselves.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  Message,
  MessageCreateParams,
  MessageParam,
  Model,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const DEFAULT_MODEL: Model = (process.env.HARNESS_MODEL as Model) || 'claude-opus-4-7';
const DEFAULT_MAX_TURNS = 12;
// 4096 was too low: a code-gen turn writing two or three custom components can
// easily produce ~6k tokens of TSX + reasoning, and the agent silently hit
// `stop_reason: max_tokens` mid-response. Pitch-deck scenarios surfaced this.
const DEFAULT_MAX_TOKENS = 8192;

export type ToolCallEvent = {
  readonly turn: number;
  readonly toolUseId: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
  readonly isError: boolean;
  /** First text block of the tool's response, if any. */
  readonly resultText: string | undefined;
  /** Structured content from the MCP response, if any. */
  readonly resultStructured: Record<string, unknown> | undefined;
  readonly durationMs: number;
};

export type HarnessEvent =
  | { readonly type: 'turn-start'; readonly turn: number; readonly tMs: number }
  | {
      readonly type: 'assistant-text';
      readonly turn: number;
      readonly text: string;
      readonly tMs: number;
    }
  | {
      readonly type: 'tool-call';
      readonly turn: number;
      readonly toolUseId: string;
      readonly name: string;
      readonly input: Record<string, unknown>;
      readonly tMs: number;
    }
  | {
      readonly type: 'tool-result';
      readonly turn: number;
      readonly toolUseId: string;
      readonly name: string;
      readonly isError: boolean;
      readonly tMs: number;
    }
  | {
      readonly type: 'stop';
      readonly turn: number;
      readonly stopReason: string;
      readonly tMs: number;
    };

export type AgentOutcome = {
  readonly finalMessage: string;
  readonly stopReason: string;
  readonly turnCount: number;
  readonly toolCalls: ReadonlyArray<ToolCallEvent>;
  readonly events: ReadonlyArray<HarnessEvent>;
  /** Total tokens used across all turns (input + output, summed). */
  readonly tokens: { readonly input: number; readonly output: number };
  /** True iff the agent invoked the named tool at least once. */
  calledTool(name: string): boolean;
  /** True iff the agent invoked the named tools in this order (gaps allowed). */
  calledInOrder(names: ReadonlyArray<string>): boolean;
};

export type AgentLoopOptions = {
  readonly anthropic: Anthropic;
  readonly mcp: Client;
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly model?: Model;
  readonly maxTurns?: number;
  readonly maxTokens?: number;
};

/**
 * Run a single agent loop and return the outcome. Throws on Anthropic API
 * errors; tool-call errors are recorded in the outcome (the agent may
 * recover from them).
 */
export const runAgentLoop = async (options: AgentLoopOptions): Promise<AgentOutcome> => {
  const { anthropic, mcp, prompt } = options;
  const model = options.model ?? DEFAULT_MODEL;
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const start = Date.now();
  const tMs = (): number => Date.now() - start;

  const tools = await loadTools(mcp);
  const messages: MessageParam[] = [{ role: 'user', content: prompt }];
  const events: HarnessEvent[] = [];
  const toolCalls: ToolCallEvent[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let finalMessage = '';
  let stopReason = 'unknown';

  for (let turn = 1; turn <= maxTurns; turn++) {
    events.push({ type: 'turn-start', turn, tMs: tMs() });
    const request: MessageCreateParams = {
      model,
      max_tokens: maxTokens,
      tools,
      messages,
      ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
    };
    const response: Message = await anthropic.messages.create(request);
    tokensIn += response.usage.input_tokens;
    tokensOut += response.usage.output_tokens;
    stopReason = response.stop_reason ?? 'unknown';

    // Surface any assistant text we got along the way.
    for (const block of response.content) {
      if (block.type === 'text' && block.text.length > 0) {
        events.push({ type: 'assistant-text', turn, text: block.text, tMs: tMs() });
        finalMessage = block.text;
      }
    }

    if (response.stop_reason !== 'tool_use') {
      events.push({ type: 'stop', turn, stopReason, tMs: tMs() });
      return buildOutcome({
        finalMessage,
        stopReason,
        turnCount: turn,
        toolCalls,
        events,
        tokens: { input: tokensIn, output: tokensOut },
      });
    }

    // Execute each tool_use block and accumulate tool_result blocks for the
    // next turn.
    const toolUseBlocks = response.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: response.content });
    const toolResults: ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const input = (block.input ?? {}) as Record<string, unknown>;
      events.push({
        type: 'tool-call',
        turn,
        toolUseId: block.id,
        name: block.name,
        input,
        tMs: tMs(),
      });
      const t0 = Date.now();
      const result = await mcp.callTool({ name: block.name, arguments: input });
      const isError = result.isError === true;
      events.push({
        type: 'tool-result',
        turn,
        toolUseId: block.id,
        name: block.name,
        isError,
        tMs: tMs(),
      });
      const content = Array.isArray(result.content) ? result.content : [];
      const resultText = extractText(content);
      const structured =
        typeof result.structuredContent === 'object' && result.structuredContent !== null
          ? (result.structuredContent as Record<string, unknown>)
          : undefined;
      toolCalls.push({
        turn,
        toolUseId: block.id,
        name: block.name,
        input,
        isError,
        resultText,
        resultStructured: structured,
        durationMs: Date.now() - t0,
      });
      // Map MCP content blocks to Anthropic tool_result content blocks,
      // including images so the model can visually review slides_preview output.
      const anthropicContent = mcpContentToAnthropic(content);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: anthropicContent.length > 0 ? anthropicContent : [],
        is_error: isError,
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  // Hit the turn cap without a natural stop. Record and return what we have.
  stopReason = 'max_turns_reached';
  events.push({ type: 'stop', turn: maxTurns, stopReason, tMs: tMs() });
  return buildOutcome({
    finalMessage,
    stopReason,
    turnCount: maxTurns,
    toolCalls,
    events,
    tokens: { input: tokensIn, output: tokensOut },
  });
};

const buildOutcome = (base: {
  finalMessage: string;
  stopReason: string;
  turnCount: number;
  toolCalls: ToolCallEvent[];
  events: HarnessEvent[];
  tokens: { input: number; output: number };
}): AgentOutcome => ({
  ...base,
  calledTool: (name) => base.toolCalls.some((c) => c.name === name),
  calledInOrder: (names) => {
    let cursor = 0;
    for (const call of base.toolCalls) {
      if (names[cursor] === call.name) cursor += 1;
      if (cursor === names.length) return true;
    }
    return cursor === names.length;
  },
});

/** Convert MCP `tools/list` output to the Anthropic API tool shape. */
const loadTools = async (mcp: Client): Promise<Tool[]> => {
  const { tools } = await mcp.listTools();
  return tools.map((t) => ({
    name: t.name,
    description: t.description ?? '',
    input_schema: (t.inputSchema ?? { type: 'object' }) as Tool['input_schema'],
  }));
};

type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
const IMAGE_MEDIA_TYPES = new Set<string>(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const isImageMediaType = (s: string): s is ImageMediaType => IMAGE_MEDIA_TYPES.has(s);

/**
 * Convert MCP content blocks to Anthropic tool_result content blocks.
 * Handles text and image types — images are mapped to Anthropic's base64
 * source format so the model can visually review slides_preview output.
 */
const mcpContentToAnthropic = (
  content: ReadonlyArray<unknown>,
): Array<
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: ImageMediaType; data: string } }
> => {
  const out: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: ImageMediaType; data: string } }
  > = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null || !('type' in block)) continue;
    const b = block as Record<string, unknown>;
    if (b.type === 'text' && typeof b.text === 'string') {
      out.push({ type: 'text', text: b.text });
    } else if (
      b.type === 'image' &&
      typeof b.data === 'string' &&
      typeof b.mimeType === 'string' &&
      isImageMediaType(b.mimeType)
    ) {
      out.push({
        type: 'image',
        source: { type: 'base64', media_type: b.mimeType, data: b.data },
      });
    }
  }
  return out;
};

const extractText = (content: ReadonlyArray<unknown>): string | undefined => {
  for (const block of content) {
    if (
      typeof block === 'object' &&
      block !== null &&
      'type' in block &&
      (block as { type: unknown }).type === 'text' &&
      'text' in block &&
      typeof (block as { text: unknown }).text === 'string'
    ) {
      return (block as { text: string }).text;
    }
  }
  return undefined;
};
