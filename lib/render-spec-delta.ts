import { RENDER_VIEW_ANGLE_LABELS } from "./render-angles";
import { STYLE_PRESET_MAP } from "./style-presets";
import type { RenderDesignSpecReport } from "./render-design-spec";
import type { StoredRender, StoredRenderCritique } from "./types";

export type RenderSpecDeltaStatus = "match" | "review" | "drift";

export type RenderSpecDeltaCheck = {
  id: string;
  title: string;
  detail: string;
  status: RenderSpecDeltaStatus;
  fix: string;
};

export type RenderSpecDeltaReport = {
  score: number;
  status: RenderSpecDeltaStatus;
  label: string;
  summary: string;
  checks: RenderSpecDeltaCheck[];
  suggestedFixes: string;
};

const SPEC_HEADING = "render-ready design spec:";

function getStyleLabel(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? style;
}

function normalize(value: string) {
  return value.toLowerCase();
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function critiqueText(critique?: StoredRenderCritique | null) {
  if (!critique) {
    return "";
  }

  return normalize([
    critique.summary,
    critique.suggestedFixes,
    ...critique.issues.flatMap((issue) => [issue.category, issue.detail])
  ].join(" "));
}

function hasCritiqueConcern(critique: string, terms: string[]) {
  return includesAny(critique, terms);
}

function getSpecPromptText(render: StoredRender) {
  const prompt = normalize(render.prompt);
  const specIndex = prompt.indexOf(SPEC_HEADING);
  return specIndex >= 0 ? prompt.slice(specIndex) : "";
}

function buildCheck(check: RenderSpecDeltaCheck) {
  return check;
}

function getStatus(score: number): RenderSpecDeltaStatus {
  if (score >= 86) return "match";
  if (score >= 70) return "review";
  return "drift";
}

function getLabel(status: RenderSpecDeltaStatus) {
  if (status === "match") return "Spec match";
  if (status === "review") return "Spec review";
  return "Spec drift";
}

export function buildRenderSpecDeltaRevision(report: RenderSpecDeltaReport) {
  return [
    `Spec-to-render delta (${report.score}/100): ${report.summary}`,
    report.suggestedFixes
  ].filter(Boolean).join(" ");
}

export function analyzeRenderSpecDelta(args: {
  render: StoredRender;
  designSpec: RenderDesignSpecReport;
}): RenderSpecDeltaReport {
  const prompt = normalize(args.render.prompt);
  const specPrompt = getSpecPromptText(args.render);
  const critique = critiqueText(args.render.latestCritique);
  const styleLabel = getStyleLabel(args.render.style);
  const viewLabel = RENDER_VIEW_ANGLE_LABELS[args.render.settings.viewAngle];
  const checks: RenderSpecDeltaCheck[] = [];
  const specWasEmbedded = specPrompt.length > 0;
  const specHasNoGarageConstraint = args.designSpec.constraints.some((constraint) =>
    normalize(constraint).includes("do not invent a garage")
  );
  const promptInventsGarage =
    specHasNoGarageConstraint &&
    includesAny(prompt, ["garage", "carport"]) &&
    !includesAny(prompt, ["do not invent a garage", "do not invent a garage or carport"]);
  const critiqueMentionsGarage = hasCritiqueConcern(critique, ["garage", "carport"]);
  const specMentionsWindowLogic = args.designSpec.roomWindowAssumptions.some((item) =>
    includesAny(normalize(item), ["window", "openings"])
  );
  const promptHasWindowSpec = specPrompt.includes("room/window assumption") && specPrompt.includes("window");
  const critiqueMentionsWindows = hasCritiqueConcern(critique, ["window", "glazing", "mullion", "facade rhythm"]);
  const specMentionsPorch = args.designSpec.constraints.some((constraint) =>
    includesAny(normalize(constraint), ["porch", "covered entry", "entry"])
  );
  const promptHasPorchSpec = specPrompt.includes("porch") || specPrompt.includes("covered entry");
  const critiqueMentionsPorch = hasCritiqueConcern(critique, ["porch", "entry", "roof massing", "arrival"]);
  const promptHasViewSpec =
    prompt.includes(viewLabel.toLowerCase()) ||
    specPrompt.includes(args.render.settings.viewAngle.replace(/-/g, " "));
  const critiqueMentionsCamera = hasCritiqueConcern(critique, ["camera", "view", "angle", "elevation", "perspective"]);
  const styleTerms = [
    styleLabel,
    args.render.settings.sidingMaterial,
    args.render.settings.roofStyle,
    args.render.settings.colorPalette
  ].map(normalize);
  const matchedStyleTerms = styleTerms.filter((term) => prompt.includes(term)).length;
  const critiqueMentionsMaterials = hasCritiqueConcern(critique, [
    "material",
    "siding",
    "roof",
    "style",
    "palette",
    "trim"
  ]);

  checks.push(
    buildCheck({
      id: "spec-embedded",
      title: specWasEmbedded ? "Spec is embedded in prompt" : "Spec missing from saved prompt",
      detail: specWasEmbedded
        ? "This render was generated with a render-ready design spec in the prompt."
        : "This render was likely generated before the design-spec layer, so a spec-matched regeneration is recommended.",
      status: specWasEmbedded ? "match" : "review",
      fix: "Regenerate this render using the current render-ready design spec before treating it as final."
    })
  );

  checks.push(
    buildCheck({
      id: "garage-control",
      title: promptInventsGarage || critiqueMentionsGarage ? "Garage/carport drift risk" : "Garage/carport controlled",
      detail:
        promptInventsGarage || critiqueMentionsGarage
          ? "The spec says not to invent a garage or the latest critique mentions garage/carport drift."
          : "Garage/carport constraints do not appear to conflict with this render.",
      status: promptInventsGarage || critiqueMentionsGarage ? "drift" : "match",
      fix: "Do not invent a garage or carport unless it is explicitly visible in the saved plan."
    })
  );

  checks.push(
    buildCheck({
      id: "window-rhythm",
      title: specMentionsWindowLogic && (!promptHasWindowSpec || critiqueMentionsWindows)
        ? "Window rhythm needs review"
        : "Window logic represented",
      detail:
        specMentionsWindowLogic && (!promptHasWindowSpec || critiqueMentionsWindows)
          ? "The render should be checked against room-aware window placement and facade rhythm assumptions."
          : "The saved prompt carries room/window assumptions for facade alignment.",
      status: specMentionsWindowLogic && (!promptHasWindowSpec || critiqueMentionsWindows) ? "review" : "match",
      fix: "Align window placement, sizing, and rhythm with bedrooms, living areas, and facade proportions from the floor plan."
    })
  );

  checks.push(
    buildCheck({
      id: "porch-entry",
      title: specMentionsPorch && (!promptHasPorchSpec || critiqueMentionsPorch)
        ? "Porch or entry drift"
        : "Entry/porch constraint aligned",
      detail:
        specMentionsPorch && (!promptHasPorchSpec || critiqueMentionsPorch)
          ? "The entry or porch should be regenerated to feel integrated with roof massing and arrival sequence."
          : "Entry and porch constraints are represented without obvious drift signals.",
      status: specMentionsPorch && (!promptHasPorchSpec || critiqueMentionsPorch) ? "review" : "match",
      fix: "Integrate the porch or entry with the roof massing, front door, and arrival path instead of treating it as an add-on."
    })
  );

  checks.push(
    buildCheck({
      id: "camera-angle",
      title: !promptHasViewSpec || critiqueMentionsCamera ? "Camera angle drift risk" : "Camera angle aligned",
      detail:
        !promptHasViewSpec || critiqueMentionsCamera
          ? "The saved render should be tightened back to the requested camera and elevation."
          : `The prompt carries the requested ${viewLabel} camera direction.`,
      status: !promptHasViewSpec || critiqueMentionsCamera ? "review" : "match",
      fix: `Keep the camera locked to ${viewLabel} and avoid drifting to another perspective or elevation.`
    })
  );

  checks.push(
    buildCheck({
      id: "style-materials",
      title: matchedStyleTerms < 3 || critiqueMentionsMaterials ? "Style/material drift risk" : "Style/materials aligned",
      detail:
        matchedStyleTerms < 3 || critiqueMentionsMaterials
          ? "Material, roof, palette, or style details need to be reinforced against the design spec."
          : `${styleLabel} material and form direction are represented in the saved prompt.`,
      status: matchedStyleTerms < 3 || critiqueMentionsMaterials ? "review" : "match",
      fix: `Preserve ${styleLabel} styling with ${args.render.settings.sidingMaterial} siding, ${args.render.settings.roofStyle} roof form, and ${args.render.settings.colorPalette} palette.`
    })
  );

  const driftCount = checks.filter((check) => check.status === "drift").length;
  const reviewCount = checks.filter((check) => check.status === "review").length;
  const score = Math.max(0, Math.round(100 - driftCount * 24 - reviewCount * 10));
  const status = getStatus(score);
  const openChecks = checks.filter((check) => check.status !== "match");
  const suggestedFixes = openChecks.map((check) => check.fix).join(" ");

  return {
    score,
    status,
    label: getLabel(status),
    summary:
      status === "match"
        ? "This render appears aligned with the current render-ready design spec."
        : status === "drift"
          ? `${driftCount} spec conflict${driftCount === 1 ? "" : "s"} should drive a targeted regeneration.`
          : `${reviewCount} spec item${reviewCount === 1 ? "" : "s"} should be checked before finalizing.`,
    checks,
    suggestedFixes
  };
}
