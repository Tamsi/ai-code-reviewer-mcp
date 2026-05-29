import {
  ANALYSIS_LABELS,
  type AnalysisResult,
  type Finding,
  type Severity,
  SEVERITIES,
} from "./types.js";

const SEVERITY_ICON: Record<Severity, string> = {
  critical: "[CRITICAL]",
  high: "[HIGH]",
  medium: "[MEDIUM]",
  low: "[LOW]",
  info: "[INFO]",
};

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

function location(finding: Finding): string {
  if (!finding.file) return "";
  return finding.line ? ` (\`${finding.file}:${finding.line}\`)` : ` (\`${finding.file}\`)`;
}

function renderFinding(finding: Finding, index: number): string {
  const parts: string[] = [];
  parts.push(
    `#### ${index}. ${SEVERITY_ICON[finding.severity]} ${finding.title}${location(finding)}`,
  );
  parts.push(`*Category: ${finding.category}*\n`);
  parts.push(finding.explanation);
  if (finding.suggestion?.trim()) {
    parts.push(`\n**Suggestion:** ${finding.suggestion}`);
  }
  return parts.join("\n");
}

function severityCounts(findings: Finding[]): string {
  const counts = SEVERITIES.map((sev) => {
    const n = findings.filter((f) => f.severity === sev).length;
    return n > 0 ? `${SEVERITY_ICON[sev]} ${n}` : null;
  }).filter(Boolean);
  return counts.length > 0 ? counts.join("  ") : "no findings";
}

/** Render a single analysis result as a Markdown section. */
export function renderResult(result: AnalysisResult): string {
  const lines: string[] = [];
  lines.push(`## ${ANALYSIS_LABELS[result.type]} — ${result.target}`);
  lines.push("");
  lines.push(`**Findings:** ${severityCounts(result.findings)}`);
  lines.push("");
  if (result.summary.trim()) {
    lines.push(`> ${result.summary.replace(/\n/g, "\n> ")}`);
    lines.push("");
  }

  if (result.findings.length === 0) {
    lines.push("_No findings reported for this analysis._");
  } else {
    const sorted = sortFindings(result.findings);
    sorted.forEach((finding, i) => {
      lines.push(renderFinding(finding, i + 1));
      lines.push("");
    });
  }

  lines.push(
    `<sub>${result.filesConsidered.length} file(s) considered · ${result.toolRounds} tool round(s)</sub>`,
  );
  return lines.join("\n");
}

/** Render multiple analysis results into a single Markdown report. */
export function renderReport(results: AnalysisResult[]): string {
  if (results.length === 0) return "No analysis was produced.";
  const header = `# AI Code Review Report\n\n_Target: ${results[0].target}_`;
  return [header, ...results.map(renderResult)].join("\n\n---\n\n");
}
