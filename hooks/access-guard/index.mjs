/**
 * access-guard: the access policy's hard rules, enforced at the platform
 * layer for every writer.
 *
 * `review_request` clamps the recommendation and `decide_request` refuses a
 * blocked grant, both in code. But the chat agent holds rw store tools, and
 * any future tool could regress the rule. A hook sees and may block EVERY
 * tool call regardless of who made it, so it's the right place to make the
 * invariant true platform-wide, not just inside one handler.
 *
 * Fires on `preToolUse` for `store__requests__set` (rows carrying
 * `status: "granted"` or `recommendation: "grant"`), `store__reviews__set`
 * (rows carrying `recommendation: "grant"`), and `store__entitlements__set`
 * (rows carrying `status: "active"`, which is the grant itself). It
 * resolves the person and the role, then checks two rules: no
 * segregation-of-duties conflict with a role the person already holds, and
 * (for a request) no window longer than the limit for the role's
 * sensitivity. A rule it cannot evaluate because the rows are not there yet
 * (fresh stores, where the seeding run cannot read back its own writes)
 * passes: the handlers already enforced it in code. Fail-closed: if a store
 * read throws, the manifest's `failPolicy: "closed"` turns the failure into
 * a block.
 *
 * Shipped as `.mjs` so the runtime's hook loader can import it directly.
 * Exports `createHook(config) => {run}`.
 *
 * @typedef {{ toolName: string, args: Record<string, unknown> }} PreToolUsePayload
 * @typedef {{ get(store: string, key: string): Promise<Record<string, unknown> | null>,
 *             query(store: string, filter?: Record<string, unknown>): Promise<Array<Record<string, unknown>>> }} HookStoreReader
 * @typedef {{ store?: HookStoreReader, log(message: string): void }} HookContext
 * @typedef {{ action: 'allow' } | { action: 'block', reason: string }} HookDecision
 */

/**
 * @param {Record<string, unknown>} config
 */
export function createHook(config) {
  const guardedTools = Array.isArray(config.guardedTools)
    ? config.guardedTools
    : ["store__requests__set", "store__reviews__set", "store__entitlements__set"];
  const privilegedMax = num(config.privilegedMaxDays, 30);
  const standardMax = num(config.standardMaxDays, 365);
  const privileged = new Set(Array.isArray(config.privilegedRoles) ? config.privilegedRoles : []);
  const pairs = Array.isArray(config.sodPairs) ? config.sodPairs : [];
  const conflictsOf = (role) => pairs.filter((p) => p.includes(role)).map(([a, b]) => (a === role ? b : a));

  return {
    /**
     * @param {string} point
     * @param {PreToolUsePayload} payload
     * @param {HookContext} ctx
     * @returns {Promise<HookDecision>}
     */
    async run(point, payload, ctx) {
      if (point !== "preToolUse") return { action: "allow" };
      const toolName = (payload && payload.toolName) || "";
      if (!guardedTools.includes(toolName)) return { action: "allow" };

      const value = payload.args && typeof payload.args === "object" ? payload.args.value : undefined;
      const row = value && typeof value === "object" ? /** @type {Record<string, unknown>} */ (value) : undefined;
      if (!row) return { action: "allow" };
      const isGrant =
        toolName === "store__entitlements__set"
          ? row.status === "active"
          : row.status === "granted" || row.recommendation === "grant";
      if (!isGrant) return { action: "allow" };
      if (!ctx.store) return { action: "block", reason: "Cannot verify the access policy for this grant." };

      // A requests row carries the request, an entitlements row the grant; a reviews row points at a request.
      const subject =
        toolName === "store__reviews__set"
          ? typeof row.request_id === "string"
            ? await ctx.store.get("requests", row.request_id)
            : null
          : row;
      if (!subject) return { action: "allow" };

      const id = String(subject.request_id ?? subject.entitlement_id ?? "");
      const person = String(subject.requester ?? subject.person ?? "");
      const role = String(subject.role_id ?? "");
      if (!person || !role) return { action: "allow" };

      const held = await ctx.store.query("entitlements", { person });
      const conflicts = conflictsOf(role);
      const clash = (held ?? []).find((e) => e.status === "active" && e.role_id !== role && conflicts.includes(String(e.role_id)));
      if (clash) return block(ctx, toolName, id, `${role} conflicts with ${clash.role_id}, which ${person} already holds`);

      if (toolName !== "store__entitlements__set") {
        const days = daysBetween(String(subject.start_date), String(subject.end_date));
        const max = privileged.has(role) ? privilegedMax : standardMax;
        if (Number.isFinite(days) && days > max) {
          return block(ctx, toolName, id, `${days} days is over the ${max}-day limit for ${privileged.has(role) ? "privileged" : "standard"} roles`);
        }
      }
      return { action: "allow" };
    },
  };
}

function block(ctx, toolName, id, why) {
  ctx.log(`access-guard: blocked ${toolName} for ${id} (${why})`);
  return {
    action: "block",
    reason: `${id} cannot be granted: ${why}. Resolve it or choose another recommendation.`,
  };
}

const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const daysBetween = (start, end) => Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
