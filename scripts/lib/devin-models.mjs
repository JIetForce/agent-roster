// `devin models list` prints families at column 0 and their models indented by
// two spaces, each ending in a bracketed context/price summary. Alias lines are
// indented the same way but carry no bracket, which is what separates them.
const MODEL_LINE = /^ {2}(\S+)\s{2,}(.+?)\s*\[([^\]]*)\]\s*$/;

export function parseModelCatalog(text) {
  const catalog = new Map();
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = line.match(MODEL_LINE);
    if (!m) continue;
    const [, slug, label, meta] = m;
    catalog.set(slug, { label: label.trim(), free: /\bFree\b/.test(meta) });
  }
  return catalog;
}

// Every model slug this repository pins, as `${tool}.${role-or-class} -> slug`.
export function pinnedModels(config) {
  const pins = [];
  for (const [tool, toolCfg] of Object.entries(config.tools ?? {})) {
    for (const [cls, cfg] of Object.entries(toolCfg)) {
      if (cls === "role_overrides") continue;
      if (cfg?.model) pins.push({ tool, where: cls, model: cfg.model });
    }
    for (const [role, cfg] of Object.entries(toolCfg.role_overrides ?? {})) {
      if (cfg?.model) pins.push({ tool, where: role, model: cfg.model });
    }
  }
  return pins;
}
