/**
 * Demo microbench ops/sec for unit subjects.
 */
export async function collect(ctx) {
  const name = ctx.params?.export ?? "fn";
  return {
    observed: Number(process.env.DEMO_MICROBENCH_OPS ?? 120000),
    unit: "count",
    message: `microbench ${name} (demo)`,
  };
}
