// Node module hook: ให้ src/config/supabase.js ชี้ไปที่ tests/fake-supabase.ts (เหมือน vi.mock ในเทสต์)
// ใช้กับ tests/e2e/server.ts เท่านั้น
const fake = new URL("../fake-supabase.ts", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier.endsWith("/config/supabase.js") && context.parentURL?.includes("/src/")) {
    return { url: fake, shortCircuit: true };
  }
  return next(specifier, context);
}
