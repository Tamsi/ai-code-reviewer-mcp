import { z } from "zod";

/** The kinds of analysis the reviewer can perform. */
export const ANALYSIS_TYPES = [
  "review",
  "bugs",
  "security",
  "performance",
  "tech_debt",
  "tests",
] as const;

export type AnalysisType = (typeof ANALYSIS_TYPES)[number];

export const ANALYSIS_LABELS: Record<AnalysisType, string> = {
  review: "Code Review",
  bugs: "Potential Bugs",
  security: "Security",
  performance: "Performance",
  tech_debt: "Technical Debt",
  tests: "Missing Tests",
};

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** A single finding produced by the model. Validated with zod after generation. */
export const FindingSchema = z.object({
  severity: z.enum(SEVERITIES),
  category: z.string().min(1),
  file: z.string().nullable().optional(),
  line: z.number().int().nullable().optional(),
  title: z.string().min(1),
  explanation: z.string().min(1),
  suggestion: z.string().default(""),
});

export type Finding = z.infer<typeof FindingSchema>;

/** Expected JSON shape returned by the LLM for an analysis. */
export const AnalysisOutputSchema = z.object({
  summary: z.string().default(""),
  findings: z.array(FindingSchema).default([]),
});

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

export interface AnalysisResult extends AnalysisOutput {
  type: AnalysisType;
  target: string;
  /** Files actually included in the model context. */
  filesConsidered: string[];
  toolRounds: number;
}
