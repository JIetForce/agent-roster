// Where every supported harness looks for agent definitions and skills, and how
// to tell a genuine duplicate from the same definition reached by two paths.
//
// This module is the single copy of the discovery matrix. `doctor-agents.mjs`
// reports it and the test suite exercises it; neither restates it.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";

// Which tools scan which project paths for AGENT definitions.
export const AGENT_PATHS = {
  ".claude/agents": ["claude", "devin", "cursor"],
  ".agents/agents": ["antigravity", "devin"],
  ".agent/agents": ["antigravity"],
  ".devin/agents": ["devin"],
  ".cursor/agents": ["cursor"],
  ".codex/agents": ["codex", "cursor"],
};

// Which tools scan which project paths for SKILLS. `.agents/skills` is the
// neutral path third-party installers write to before symlinking it into each
// tool's own directory — it is a convention to live with, not a defect.
export const SKILL_PATHS = {
  ".claude/skills": ["claude", "devin"],
  ".agents/skills": ["antigravity", "devin"],
  ".agent/skills": ["antigravity"],
  ".devin/skills": ["devin"],
  ".codex/skills": ["codex"],
};

// Paths a tool reads only for cross-tool compatibility, and which a
// higher-precedence path of its own shadows.
export const SHADOWED = {
  cursor: { by: ".cursor/agents", shadows: [".claude/agents", ".codex/agents"] },
};

// Devin can be told to stop importing another tool's config. A path the
// operator has already switched off is not a source, so honour it here —
// otherwise the doctor reports a problem that is already solved.
const DEVIN_IMPORTS = {
  claude: [".claude/agents", ".claude/skills"],
  cursor: [".cursor/agents"],
};

// Directories this repository owns as SOURCE. The dot-drop check below must
// never mistake `agents/skills` for `.agents/skills` that lost its leading dot.
const ROSTER_SOURCE_DIRS = new Set(["agents/roles", "agents/skills"]);

const DEFINITION_EXTENSIONS = [".md", ".toml"];

const realOrSelf = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

export function suppressed(root = ".") {
  const configPath = join(root, ".devin/config.json");
  if (!existsSync(configPath)) return {};
  let importsFrom;
  try {
    importsFrom = JSON.parse(readFileSync(configPath, "utf8")).read_config_from ?? {};
  } catch {
    return {};
  }
  const devin = Object.entries(importsFrom)
    .filter(([, enabled]) => enabled === false)
    .flatMap(([tool]) => DEVIN_IMPORTS[tool] ?? []);
  return devin.length ? { devin } : {};
}

// Every definition a tool would discover under `dir`, as name → the real path
// it resolves to.
//
// Resolving is the whole point. The ecosystem's convention is one real copy
// under a neutral path with a symlink into each tool's directory, so a name
// reachable by two paths that land on one inode is one definition. Counting
// directories cannot tell that apart from two rival copies; comparing resolved
// targets can.
//
// Both layouts in use are handled: a flat `<name>.md` / `<name>.toml`, and a
// directory `<name>/` holding `agent.md` or `SKILL.md`.
export function definitionsAt(dir, root = ".") {
  const abs = join(root, dir);
  if (!existsSync(abs)) return new Map();
  const found = new Map();
  let entries;
  try {
    entries = readdirSync(abs);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const path = join(abs, entry);
    let stat;
    try {
      stat = statSync(path); // follows symlinks; throws on a broken one
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      found.set(entry, realOrSelf(path));
      continue;
    }
    const ext = DEFINITION_EXTENSIONS.find((e) => entry.endsWith(e));
    if (ext) found.set(entry.slice(0, -ext.length), realOrSelf(path));
  }
  return found;
}

// Per tool: which directories it actually reads here, how many definitions that
// yields, and every name that resolves to more than one definition.
export function auditCollisions(matrix, root = ".") {
  const off = suppressed(root);
  const sourcesByTool = {};
  for (const [path, tools] of Object.entries(matrix)) {
    if (!existsSync(join(root, path))) continue;
    for (const tool of tools) (sourcesByTool[tool] ??= []).push(path);
  }

  const results = [];
  for (const [tool, paths] of Object.entries(sourcesByTool)) {
    const shadow = SHADOWED[tool];
    let sources = paths.filter((p) => !(off[tool] ?? []).includes(p));
    if (shadow && sources.includes(shadow.by)) {
      sources = sources.filter((p) => !shadow.shadows.includes(p));
    }

    // name → (resolved target → the path we discovered it by)
    const seen = new Map();
    for (const dir of sources) {
      for (const [name, target] of definitionsAt(dir, root)) {
        const targets = seen.get(name) ?? new Map();
        if (!targets.has(target)) targets.set(target, join(dir, name));
        seen.set(name, targets);
      }
    }

    results.push({
      tool,
      sources,
      count: seen.size,
      collisions: [...seen]
        .filter(([, targets]) => targets.size > 1)
        .map(([name, targets]) => ({ name, paths: [...targets.values()].sort() }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  return results.sort((a, b) => a.tool.localeCompare(b.tool));
}

// A harness directory that lost its leading dot — `agent/skills` for
// `.agent/skills`. No tool reads it, so no discovery check will ever mention
// it, and it is therefore the quietest way for an installer to leave a second
// divergent copy of a definition in the repository. Installers do produce
// these: the shadcn CLI wrote 15 files to `agent/skills/shadcn` in a project
// this roster was adopted into.
export function strayPaths(matrix, root = ".") {
  const known = new Set(Object.keys(matrix));
  const stray = [];
  for (const path of known) {
    if (!path.startsWith(".")) continue;
    const undotted = path.slice(1);
    if (known.has(undotted) || ROSTER_SOURCE_DIRS.has(undotted)) continue;
    if (existsSync(join(root, undotted))) stray.push({ path: undotted, meant: path });
  }
  return stray.sort((a, b) => a.path.localeCompare(b.path));
}
