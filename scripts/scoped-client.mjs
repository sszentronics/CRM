// Seed scripts write with the service role, which has no signed-in workspace. This wraps a Supabase client so every
// insert names one. The default is Trading Labs, the first workspace (see the workspaces migration).
export const TRADING_LABS_WORKSPACE = "00000000-0000-4000-8000-000000000001";

const WRITES = new Set(["insert", "upsert"]);

function stamp(rows, workspaceId) {
  return Array.isArray(rows) ? rows.map((r) => ({ workspace_id: workspaceId, ...r })) : { workspace_id: workspaceId, ...rows };
}

export function scoped(db, workspaceId = TRADING_LABS_WORKSPACE) {
  return new Proxy(db, {
    get(target, prop) {
      if (prop !== "from") {
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (table) => {
        const query = target.from(table);
        if (table === "workspaces") return query;
        return new Proxy(query, {
          get(q, p) {
            const value = Reflect.get(q, p, q);
            if (typeof value !== "function") return value;
            if (WRITES.has(p)) return (rows, ...rest) => value.call(q, stamp(rows, workspaceId), ...rest);
            return value.bind(q);
          },
        });
      };
    },
  });
}
