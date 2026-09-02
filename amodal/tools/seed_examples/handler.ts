import type { CustomToolContext } from "../../_types/tool-context.js";
import { ensureExamplesSeeded, REQUESTS } from "../../_lib/demo-data.js";

/**
 * Durable tool behind the `seed` chat command (a regex trigger on this tool,
 * fired from the request path before the LLM) and the UI's first open, which
 * runs it through the direct-invoke lane when the requests store is empty.
 */
export default async function seed_examples(_params: Record<string, never>, ctx: CustomToolContext) {
  if (!ctx.callTool) {
    throw new Error(
      "seed_examples needs the composite context (ctx.callTool). " +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }

  const seeded = await ensureExamplesSeeded({
    callTool: (name, args) => ctx.callTool!(name, args),
    now: () => new Date(ctx.now ? ctx.now() : Date.now()),
  });
  ctx.emitReasoning?.(
    seeded > 0
      ? `Seeded ${seeded} demo request(s); the rest were already in the store.`
      : "All demo requests were already in the store; nothing to seed.",
  );

  const next = `Review one with e.g. \`review ${REQUESTS[0].request_id}\`.`;
  return {
    seeded,
    total: REQUESTS.length,
    message:
      seeded > 0
        ? `Loaded ${seeded} demo request${seeded === 1 ? "" : "s"} into the stores. ${next}`
        : `All ${REQUESTS.length} demo requests are already loaded. ${next}`,
  };
}
