import type { StoredRender, StoredRenderCritiqueIssue } from "./types";

export type RenderVisualQAFix = {
  id: string;
  label: string;
  instruction: string;
  severity: StoredRenderCritiqueIssue["severity"];
};

type VisualQATarget = {
  id: string;
  label: string;
  terms: string[];
  instruction: string;
};

const VISUAL_QA_TARGETS: VisualQATarget[] = [
  {
    id: "floor-plan-fidelity",
    label: "Fix plan fidelity",
    terms: ["floor", "plan", "room", "bedroom", "kitchen", "living", "door", "window", "facade rhythm"],
    instruction:
      "Regenerate with stricter floor-plan fidelity: align rooms, doors, window rhythm, and visible facade cues to the saved plan instead of inventing unsupported elements."
  },
  {
    id: "design-spec",
    label: "Match design spec",
    terms: ["spec", "brief", "constraint", "garage", "carport", "porch", "entry", "must include", "avoid"],
    instruction:
      "Regenerate to match the render-ready design spec exactly, preserving must-have constraints and removing unsupported garage, carport, porch, or entry inventions."
  },
  {
    id: "camera-angle",
    label: "Correct camera",
    terms: ["camera", "angle", "view", "perspective", "elevation", "aerial"],
    instruction:
      "Regenerate with the requested camera angle locked, keeping the home framed clearly without drifting to a different elevation or perspective."
  },
  {
    id: "materials-style",
    label: "Fix materials",
    terms: ["material", "siding", "roof", "trim", "palette", "style", "craftsman", "farmhouse", "modern", "contemporary"],
    instruction:
      "Regenerate with stronger material and style fidelity: preserve the selected exterior style, siding, roof form, palette, trim logic, and realistic buildable transitions."
  },
  {
    id: "client-polish",
    label: "Improve polish",
    terms: ["polish", "quality", "lighting", "landscape", "curb", "realism", "proportion", "massing", "presentation"],
    instruction:
      "Regenerate for client-ready polish with better massing, entry hierarchy, lighting, landscaping, proportions, and photorealistic presentation quality."
  }
];

const FALLBACK_FIX: VisualQATarget = {
  id: "visual-qa-general",
  label: "Fix visual QA",
  terms: [],
  instruction:
    "Regenerate from the visual QA findings, fixing the visible issues while preserving the strongest parts of this render."
};

function normalize(value: string) {
  return value.toLowerCase();
}

function getIssueText(issue: StoredRenderCritiqueIssue) {
  return normalize(`${issue.category} ${issue.detail}`);
}

function getTargetForIssue(issue: StoredRenderCritiqueIssue) {
  const issueText = getIssueText(issue);
  return VISUAL_QA_TARGETS.find((target) => target.terms.some((term) => issueText.includes(term))) ?? FALLBACK_FIX;
}

function severityRank(severity: StoredRenderCritiqueIssue["severity"]) {
  if (severity === "major") return 0;
  if (severity === "minor") return 1;
  return 2;
}

export function getRenderVisualQAFixes(render: StoredRender): RenderVisualQAFix[] {
  const critique = render.latestCritique;
  if (!critique) {
    return [];
  }

  const issueFixes = critique.issues
    .filter((issue) => issue.severity !== "strength")
    .sort((left, right) => severityRank(left.severity) - severityRank(right.severity))
    .map((issue) => {
      const target = getTargetForIssue(issue);
      return {
        id: target.id,
        label: target.label,
        instruction: `${target.instruction} Visual QA finding: ${issue.detail}`,
        severity: issue.severity
      };
    });
  const dedupedFixes = new Map<string, RenderVisualQAFix>();

  for (const fix of issueFixes) {
    if (!dedupedFixes.has(fix.id)) {
      dedupedFixes.set(fix.id, fix);
    }
  }

  if (dedupedFixes.size === 0 && critique.suggestedFixes.trim()) {
    dedupedFixes.set(FALLBACK_FIX.id, {
      id: FALLBACK_FIX.id,
      label: FALLBACK_FIX.label,
      instruction: `${FALLBACK_FIX.instruction} ${critique.suggestedFixes.trim()}`,
      severity: critique.recommendation === "regenerate" ? "major" : "minor"
    });
  }

  return [...dedupedFixes.values()].slice(0, 4);
}

export function buildRenderVisualQARevision(fix: RenderVisualQAFix) {
  return `Image-based visual QA targeted fix (${fix.label}): ${fix.instruction}`;
}
