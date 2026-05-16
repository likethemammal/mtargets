/**
 * Demo DOM node count collector.
 */
export async function collect(_ctx) {
  return {
    observed: Number(process.env.DEMO_DOM_NODES ?? 820),
    unit: "count",
    message: "dom_node_count (demo)",
  };
}
