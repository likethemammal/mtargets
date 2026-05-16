/**
 * Example queue-depth collector for source.type: script.
 * Real deployments would query Redis / DB / API.
 *
 * @param {object} ctx
 * @param {string} ctx.indicatorId
 * @param {string|object} [ctx.query]
 * @param {Record<string, unknown>} [ctx.params]
 */
export async function collect(ctx) {
  const args = ctx.params?.args ?? [];
  const queueIdx = args.indexOf("--queue");
  const queue = queueIdx >= 0 ? args[queueIdx + 1] : "default";

  // Demo: deterministic fake depth. Replace with real fetch.
  const demoDepth = Number(process.env.DEMO_QUEUE_DEPTH ?? 18);

  return {
    observed: demoDepth,
    unit: "count",
    message: `queue=${queue} (demo collector)`,
  };
}
