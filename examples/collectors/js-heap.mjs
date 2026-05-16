/**
 * Demo JS heap collector (source.type: script).
 * Production: read performance.memory or CDP Performance.getMetrics.
 */
export async function collect(ctx) {
  const after = ctx.params?.after ?? "unknown";
  const mib = Number(process.env.DEMO_JS_HEAP_MIB ?? 42);
  return {
    observed: mib,
    unit: "MiB",
    message: `js_heap after=${after} (demo)`,
  };
}
