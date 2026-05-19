import { jsonrepair } from 'jsonrepair';
import agentChat from './agentChat.js';

// Default safety caps. The route can override these but they're tuned for
// the YouTutorAI tutor loop and should be left alone unless you know why.
//
// MAX_TOOL_ROUNDS: hard ceiling on tool-call rounds per turn. 10 covers the
// "list page → find text → draw → read q → grade student answer → respond"
// chain; 6 was too tight when both subjects needed their own lookup.
//
// TOOL_SPAM_THRESHOLD: after this many CONSECUTIVE rounds where Brain made
// tool calls but emitted no text, drop the tools so it must answer in text.
// Counts consecutive silent rounds, so a one-line lead-in like "Let me
// check…" resets the counter — only the runaway pattern fires. 3 catches
// obvious spam without false-positives on legitimate chains.
export const MAX_TOOL_ROUNDS = 10;
export const TOOL_SPAM_THRESHOLD = 3;

// Drives one Brain turn end-to-end: streams the chat completion, accumulates
// tool-call arguments, dispatches them via the caller-supplied function, and
// loops until Brain emits a final text answer (or we hit a safety cap).
//
// The loop owns:
//   - argument parsing (with jsonrepair salvage)
//   - the tool-spam detector that flips `forceTextOnly` on after N silent rounds
//   - the empty-stop reminder that nudges Brain to answer when it stops with
//     nothing to say
//   - the round cap
//   - abort propagation (returns `interrupted: true` instead of throwing)
//
// The caller (`dispatchTool`) owns:
//   - knowing what each tool name means
//   - calling the right service (OCR / vision / snap)
//   - emitting any tool-specific SSE events (lookup-start / lookup / tool)
//   - mutating `call.args` in-place if needed (e.g. snapping a bbox)
//   - returning `{ result, progress }`. `result` is what Brain sees as the
//     tool message; `progress: true` means Brain got something actionable
//     out of the call (a real bbox, an answer, a successful annotation) and
//     the round should not count against the spam detector even if there
//     was no narration alongside. Without this signal, a successful OCR
//     match would trip the detector right before Brain could call
//     draw_annotation with the bbox it just earned.
//
// On return:
//   - `messages` has been appended with every assistant tool_calls turn and
//     every tool result, in the right order for a follow-up call
//   - `allToolCalls` is the audit log to persist on session_message.tool_calls
export default async function runBrainTurn({
  baseUrl,
  apiKey,
  model,
  messages,
  tools,
  signal,
  log,
  logFields = {},
  dispatchTool,
  onToken,
  idleTimeoutMs,
  maxToolRounds = MAX_TOOL_ROUNDS,
  toolSpamThreshold = TOOL_SPAM_THRESHOLD
}) {
  if (typeof dispatchTool !== 'function') {
    throw new Error('runBrainTurn requires a dispatchTool function');
  }

  let assistantContent = '';
  let promptTokens = null;
  let completionTokens = null;
  let interrupted = false;
  let error = null;
  const allToolCalls = [];

  let hitRoundCap = false;
  let emptyStopRecovery = false;
  let forceTextOnly = false;
  let consecutiveSilentToolRounds = 0;

  const hasTools = Array.isArray(tools) && tools.length > 0;

  try {
    let round = 0;
    for (; round < maxToolRounds; round += 1) {
      if (
        !forceTextOnly &&
        hasTools &&
        consecutiveSilentToolRounds >= toolSpamThreshold
      ) {
        forceTextOnly = true;
        log?.warn(
          { ...logFields, round, consecutiveSilentToolRounds },
          'Brain is in a tool-spam loop with no text — disabling tools and forcing a text reply'
        );
        messages.push({
          role: 'user',
          content:
            "You've called tools several times in a row without writing anything to the " +
            'student. Answer the student now in plain text using what you already learned ' +
            'from earlier tool calls. Do not call any more tools. Skip draw_annotation ' +
            "entirely if you do not have a confirmed bbox — the student's answer matters " +
            'more than a mark on the page.'
        });
      }

      const toolCallAccum = new Map();
      let assistantContentThisRound = '';
      let reasoningThisRound = '';
      let finishReason = null;

      for await (const chunk of agentChat({
        baseUrl,
        apiKey,
        model,
        messages,
        tools: forceTextOnly ? undefined : tools,
        signal,
        idleTimeoutMs
      })) {
        if (chunk.delta) {
          assistantContentThisRound += chunk.delta;
          assistantContent += chunk.delta;
          onToken?.(chunk.delta);
        }
        if (chunk.reasoning) {
          reasoningThisRound += chunk.reasoning;
        }
        if (chunk.toolCallChunks) {
          for (const tc of chunk.toolCallChunks) {
            const idx = tc.index ?? 0;
            let acc = toolCallAccum.get(idx);
            if (!acc) {
              acc = { id: tc.id || `call_${idx}`, name: '', argsRaw: '' };
              toolCallAccum.set(idx, acc);
            }
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name = tc.function.name;
            if (typeof tc.function?.arguments === 'string') {
              acc.argsRaw += tc.function.arguments;
            }
          }
        }
        if (chunk.finishReason) finishReason = chunk.finishReason;
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
          completionTokens = chunk.usage.completion_tokens ?? completionTokens;
        }
      }

      const pendingCalls = [];
      for (const acc of toolCallAccum.values()) {
        if (!acc.name) {
          log?.warn(
            { ...logFields, accId: acc.id, argsRaw: acc.argsRaw },
            'Tool call accumulator has args but no function name — dropping'
          );
          continue;
        }
        let args = {};
        let parseError = null;
        if (acc.argsRaw) {
          try {
            args = JSON.parse(acc.argsRaw);
          } catch (strictErr) {
            // Brain (deepseek-v4-flash) sometimes streams malformed JSON for
            // tool-call args — unterminated strings, trailing commas, missing
            // braces. Try jsonrepair before giving up; recovers most cases
            // without burning a round.
            try {
              args = JSON.parse(jsonrepair(acc.argsRaw));
              log?.warn(
                { ...logFields, name: acc.name, argsRaw: acc.argsRaw, strictErr: strictErr.message },
                'Tool call arguments needed jsonrepair to parse'
              );
            } catch (repairErr) {
              log?.warn(
                {
                  ...logFields,
                  name: acc.name,
                  argsRaw: acc.argsRaw,
                  strictErr: strictErr.message,
                  repairErr: repairErr.message
                },
                'Tool call arguments unsalvageable — feeding error back to Brain to retry'
              );
              parseError = strictErr.message;
              args = {};
            }
          }
        }
        pendingCalls.push({ id: acc.id, name: acc.name, args, parseError });
      }

      log?.info(
        {
          ...logFields,
          round,
          finishReason,
          contentChars: assistantContentThisRound.length,
          reasoningChars: reasoningThisRound.length,
          reasoningPreview: reasoningThisRound.slice(0, 400),
          toolCalls: pendingCalls.map((c) => ({ name: c.name, args: c.args }))
        },
        'Brain round complete'
      );

      if (pendingCalls.length === 0) {
        if (assistantContentThisRound.length === 0 && !emptyStopRecovery) {
          emptyStopRecovery = true;
          log?.warn(
            { ...logFields, round },
            'Brain stopped with no content and no tool calls — injecting forced answer reminder'
          );
          messages.push({
            role: 'user',
            content:
              "You haven't answered yet — please write your reply to the student now in plain " +
              'text. Use what you already learned from earlier tool calls; do not call any more ' +
              'tools. Skip draw_annotation if you do not have a bbox.'
          });
          continue;
        }
        break;
      }

      messages.push({
        role: 'assistant',
        content: assistantContentThisRound,
        tool_calls: pendingCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args) }
        }))
      });

      let anyToolProgress = false;
      for (const call of pendingCalls) {
        let toolResult;
        if (call.parseError) {
          toolResult = {
            error:
              `Your previous ${call.name} tool call had malformed JSON arguments ` +
              `(parser said: ${call.parseError}). Please call ${call.name} again with ` +
              `valid JSON containing every required field.`
          };
        } else {
          const dispatched = await dispatchTool(call);
          toolResult = dispatched.result;
          if (dispatched.progress) anyToolProgress = true;
        }

        allToolCalls.push({
          id: call.id,
          name: call.name,
          args: call.args,
          result: toolResult
        });

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(toolResult)
        });
      }

      // Reset the silent-rounds counter when Brain talked OR when at least
      // one tool call actually produced something useful this round. Without
      // the progress check, a successful OCR match (no text, but it earned
      // a bbox) would tick the counter and could trip forceTextOnly right
      // before the next round's draw_annotation.
      if (assistantContentThisRound.length > 0 || anyToolProgress) {
        consecutiveSilentToolRounds = 0;
      } else if (pendingCalls.length > 0) {
        consecutiveSilentToolRounds += 1;
      }
    }
    if (round >= maxToolRounds) {
      hitRoundCap = true;
      log?.warn(
        { ...logFields, maxRounds: maxToolRounds },
        'Brain hit the tool-call round cap without emitting a final answer — aborting'
      );
    }
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      interrupted = true;
    } else {
      error = err;
    }
  }

  return {
    assistantContent,
    allToolCalls,
    promptTokens,
    completionTokens,
    hitRoundCap,
    interrupted,
    error
  };
}
