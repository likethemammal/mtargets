/**
 * Demo rAF FPS / long-frame collector for animation subjects.
 */
export async function collect(ctx) {
  const query = ctx.query ?? "animation_fps";
  if (query === "long_frames") {
    return {
      observed: Number(process.env.DEMO_LONG_FRAMES ?? 2),
      unit: "count",
      message: `frames over ${ctx.params?.budgetMs ?? 16.7}ms (demo)`,
    };
  }
  return {
    observed: Number(process.env.DEMO_FPS ?? 58),
    unit: "1",
    message: `animation_fps durationMs=${ctx.params?.durationMs ?? 3000} (demo)`,
  };
}
