/**
 * Demo long-task collector.
 */
export async function collect(ctx) {
  if (ctx.query === "long_task_blocking_ms") {
    return {
      observed: Number(process.env.DEMO_LONG_TASK_BLOCKING_MS ?? 120),
      unit: "ms",
      message: "long_task_blocking_ms (demo)",
    };
  }
  return {
    observed: Number(process.env.DEMO_LONG_TASK_COUNT ?? 3),
    unit: "count",
    message: "long_task_count (demo)",
  };
}
