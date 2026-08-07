/**
 * Sync docs/guide + docs/reference → website/src/content/docs for Starlight.
 * Adds frontmatter and rewrites internal links for the docs site.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(root, "website", "src", "content", "docs");

const sections: Array<{ from: string; to: string }> = [
  { from: path.join(root, "docs", "guide"), to: path.join(outRoot, "guides") },
  {
    from: path.join(root, "docs", "reference"),
    to: path.join(outRoot, "reference"),
  },
];

function titleFromBody(body: string, fallback: string): string {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

function rewriteLinks(content: string, section: "guides" | "reference"): string {
  let c = content;
  // Cross-doc links
  c = c.replace(/\]\(\.\.\/guide\/([^)#]+?)(?:\.md)?\)/g, "](/guides/$1/)");
  c = c.replace(/\]\(\.\.\/reference\/([^)#]+?)(?:\.md)?\)/g, "](/reference/$1/)");
  c = c.replace(
    /\]\((subjects|validate|consumers|integrations|catalog|product-layers|product-schema)(?:\.md)?\)/g,
    "](/guides/$1/)",
  );
  c = c.replace(
    /\]\((spec|schema|advanced)(?:\.md)?\)/g,
    "](/reference/$1/)",
  );
  // Same-folder relative in reference/guide
  if (section === "reference") {
    c = c.replace(/\]\(\.\/?(spec|schema|advanced)(?:\.md)?\)/g, "](/reference/$1/)");
  }
  if (section === "guides") {
    c = c.replace(
      /\]\(\.\/?(subjects|validate|consumers|integrations|catalog|product-layers|product-schema)(?:\.md)?\)/g,
      "](/guides/$1/)",
    );
  }
  // Repo paths (examples/schema/scripts) — keep as monospace path hints
  c = c.replace(
    /\[([^\]]+)\]\(\.\.\/\.\.\/(examples|schema|scripts)\/([^)]+)\)/g,
    "`$2/$3`",
  );
  c = c.replace(/\[`?([^\]`]+)`?\]\(\.\.\/\.\.\/(examples|schema|scripts)\/([^)]+)\)/g, "`$2/$3`");
  return c;
}

async function syncSection(
  fromDir: string,
  toDir: string,
  section: "guides" | "reference",
): Promise<void> {
  await rm(toDir, { recursive: true, force: true });
  await mkdir(toDir, { recursive: true });
  const files = (await readdir(fromDir)).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const raw = await readFile(path.join(fromDir, file), "utf8");
    const slug = file.replace(/\.md$/, "");
    const title = titleFromBody(raw, slug);
    // Drop leading H1 — Starlight uses frontmatter title
    const body = raw.replace(/^#\s+.+\n+/, "");
    const rewritten = rewriteLinks(body, section);
    const out = `---\ntitle: ${JSON.stringify(title)}\n---\n\n${rewritten}`;
    await writeFile(path.join(toDir, file), out, "utf8");
    console.log(`synced ${section}/${file}`);
  }
}

for (const s of sections) {
  const section = path.basename(s.to) as "guides" | "reference";
  await syncSection(s.from, s.to, section);
}

console.log("Starlight content synced from docs/");
