const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "..", "lib", "supabase", "url.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandboxModule = { exports: {} };
const sandbox = { module: sandboxModule, exports: sandboxModule.exports, process: { env: {} }, URL };
vm.runInNewContext(compiled, sandbox, { filename: sourcePath });
const normalize = sandboxModule.exports.getSupabaseProjectUrl;

const valid = [
  ["https://project.supabase.co", "https://project.supabase.co"],
  ["https://project.supabase.co/rest/v1/", "https://project.supabase.co"],
  ["https://project.supabase.co/rest/v1", "https://project.supabase.co"],
  ["http://localhost:54321/", "http://localhost:54321"],
];
for (const [input, expected] of valid) {
  const actual = normalize(input);
  if (actual !== expected) throw new Error(`URL normalization failed for ${input}: got ${actual}`);
}
const invalid = ["", "not-a-url", "http://project.supabase.co", "https://project.supabase.co/rest/v1/tables", "https://user:pass@project.supabase.co", "https://project.supabase.co?x=1"];
for (const input of invalid) {
  let rejected = false;
  try { normalize(input); } catch { rejected = true; }
  if (!rejected) throw new Error(`Expected URL to be rejected: ${input}`);
}
console.log(`Supabase URL tests passed (${valid.length} accepted, ${invalid.length} rejected).`);
