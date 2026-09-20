import type { Draft } from "./domain.js";
import type { Extraction } from "./extraction.js";

export type IntakeView = {
  id: string;
  checkpoint: string;
  stage: "clarify" | "review" | "complete" | "retry";
  source: string;
  extraction?: {
    result: Extraction;
    model: string;
    inputTokens: number;
    outputTokens: number;
  };
  draft?: Partial<Draft>;
  issues: string[];
  invoiceId?: string;
};
