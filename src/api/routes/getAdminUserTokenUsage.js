import { asc, eq, sql } from 'drizzle-orm';
import { withTx } from '../db/index.js';
import { llmUsage, user } from '../db/schema.js';

// GET /api/admin/user/:id/token-usage
//
// Aggregated llm_usage for one user, bucketed per day per
// (purpose, model). The frontend reshapes this into either a
// "by purpose" or "by model" stacked-column chart without
// re-querying.
//
// The aggregation runs against llm_usage (the per-call source of
// truth, not the convenience caches on session_message / vision_
// extraction) so the totals match billing exactly. See
// docs/db-schema.md for the relationship between these tables.
export default function getAdminUserTokenUsage(fastify) {
  fastify.get('/api/admin/user/:id/token-usage', async (request, reply) => {
    const { id: targetUserId } = request.params;
    if (!targetUserId) {
      reply.code(400);
      return { error: 'Missing user id' };
    }

    const result = await withTx(async (tx) => {
      const [target] = await tx
        .select({ id: user.id, name: user.name, role: user.role })
        .from(user)
        .where(eq(user.id, targetUserId))
        .limit(1);
      if (!target) return { kind: 'notFound' };

      const dayExpr = sql`date_trunc('day', ${llmUsage.createdAt})`;
      const rows = await tx
        .select({
          date: dayExpr.as('date'),
          purpose: llmUsage.purpose,
          model: llmUsage.model,
          inputTokens: sql`COALESCE(SUM(${llmUsage.inputTokens}), 0)::int`.as('input_tokens'),
          outputTokens: sql`COALESCE(SUM(${llmUsage.outputTokens}), 0)::int`.as('output_tokens'),
          reasoningTokens: sql`COALESCE(SUM(${llmUsage.reasoningTokens}), 0)::int`.as('reasoning_tokens'),
          cacheReadTokens: sql`COALESCE(SUM(${llmUsage.cacheReadTokens}), 0)::int`.as('cache_read_tokens'),
          cacheWriteTokens: sql`COALESCE(SUM(${llmUsage.cacheWriteTokens}), 0)::int`.as('cache_write_tokens'),
          totalTokens: sql`COALESCE(SUM(${llmUsage.totalTokens}), 0)::int`.as('total_tokens'),
          costUsd: sql`COALESCE(SUM(${llmUsage.costUsd}), 0)`.as('cost_usd'),
          calls: sql`COUNT(*)::int`.as('calls')
        })
        .from(llmUsage)
        .where(eq(llmUsage.userId, targetUserId))
        .groupBy(dayExpr, llmUsage.purpose, llmUsage.model)
        .orderBy(asc(dayExpr), asc(llmUsage.purpose), asc(llmUsage.model));

      return { kind: 'ok', target, rows };
    });

    if (result.kind === 'notFound') {
      reply.code(404);
      return { error: 'User not found' };
    }

    return {
      user: { id: result.target.id, name: result.target.name, role: result.target.role },
      days: result.rows.map((r) => ({
        date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
        purpose: r.purpose,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        reasoningTokens: r.reasoningTokens,
        cacheReadTokens: r.cacheReadTokens,
        cacheWriteTokens: r.cacheWriteTokens,
        totalTokens: r.totalTokens,
        costUsd: r.costUsd == null ? null : Number(r.costUsd),
        calls: r.calls
      }))
    };
  });
}
