/**
 * Demo layout thrash counter.
 */
export async function collect(_ctx) {
  return {
    observed: Number(process.env.DEMO_LAYOUT_THRASH ?? 1),
    unit: "count",
    message: "layout_thrash_count (demo)",
  };
}
