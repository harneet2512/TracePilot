function clean(value: string | undefined | null): string {
  return (value || "").trim();
}

export function normalizePriority(raw: string | undefined | null): "HIGH" | "MEDIUM" | "LOW" | "—" {
  const value = clean(raw).toLowerCase();
  if (!value) return "—";

  if (
    /(high|critical|blocker|at risk|risk|behind|tight|go\/no-go|blocked|delay|urgent)/.test(value)
  ) {
    return "HIGH";
  }
  if (/(medium|med|warning|pending|watch|caution|open|active|in progress|ongoing|unresolved)/.test(value)) {
    return "MEDIUM";
  }
  if (/(low|minor|on track|stable|resolved)/.test(value)) {
    return "LOW";
  }
  // Any non-empty status that doesn't match known patterns defaults to MEDIUM
  return "MEDIUM";
}

export function normalizeOwner(raw: string | undefined | null): string {
  const value = clean(raw);
  if (!value) return "—";
  if (value.length <= 1) return "—";
  return value;
}
