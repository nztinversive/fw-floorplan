import { RENDER_VIEW_ANGLE_LABELS } from "./render-angles";
import { STYLE_PRESET_MAP } from "./style-presets";
import type { StoredRender } from "./types";

export type DesignDNATraitKey =
  | "style"
  | "sidingMaterial"
  | "roofStyle"
  | "colorPalette"
  | "landscaping"
  | "viewAngle"
  | "timeOfDay"
  | "season";

export type DesignDNATrait = {
  key: DesignDNATraitKey;
  label: string;
  value: string;
  count: number;
  confidence: number;
};

export type DesignDNADriftRender = {
  renderId: string;
  label: string;
  score: number;
  driftTraits: Array<{
    label: string;
    expected: string;
    actual: string;
  }>;
};

export type DesignDNAReport = {
  status: "ready" | "empty";
  sourceCount: number;
  renderCount: number;
  traits: DesignDNATrait[];
  strengths: string[];
  dnaText: string;
  summary: string;
  driftRenders: DesignDNADriftRender[];
};

const TRAIT_LABELS: Record<DesignDNATraitKey, string> = {
  style: "Style",
  sidingMaterial: "Siding",
  roofStyle: "Roof",
  colorPalette: "Palette",
  landscaping: "Landscape",
  viewAngle: "Camera",
  timeOfDay: "Light",
  season: "Season"
};

const TRAIT_KEYS: DesignDNATraitKey[] = [
  "style",
  "sidingMaterial",
  "roofStyle",
  "colorPalette",
  "landscaping",
  "viewAngle",
  "timeOfDay",
  "season"
];

function getStyleLabel(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? style;
}

function formatRenderLabel(render: StoredRender) {
  return `${getStyleLabel(render.style)} ${RENDER_VIEW_ANGLE_LABELS[render.settings.viewAngle]}`;
}

function getTraitValue(render: StoredRender, key: DesignDNATraitKey) {
  if (key === "style") {
    return getStyleLabel(render.style);
  }

  if (key === "viewAngle") {
    return RENDER_VIEW_ANGLE_LABELS[render.settings.viewAngle];
  }

  return render.settings[key];
}

function getDominantTrait(renders: StoredRender[], key: DesignDNATraitKey): DesignDNATrait | null {
  const counts = new Map<string, number>();

  for (const render of renders) {
    const value = getTraitValue(render, key);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const dominant = [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  })[0];

  if (!dominant) {
    return null;
  }

  return {
    key,
    label: TRAIT_LABELS[key],
    value: dominant[0],
    count: dominant[1],
    confidence: Math.round((dominant[1] / renders.length) * 100)
  };
}

function getStrengthSignals(renders: StoredRender[]) {
  const signals = new Map<string, number>();

  for (const render of renders) {
    for (const critique of render.critiqueHistory ?? []) {
      for (const issue of critique.issues) {
        if (issue.severity !== "strength") {
          continue;
        }

        const signal = issue.detail.trim();
        if (!signal) {
          continue;
        }

        signals.set(signal, (signals.get(signal) ?? 0) + 1);
      }
    }
  }

  return [...signals.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([signal]) => signal)
    .slice(0, 3);
}

function scoreRenderAgainstDNA(render: StoredRender, traits: DesignDNATrait[]) {
  if (traits.length === 0) {
    return null;
  }

  const driftTraits = traits
    .map((trait) => {
      const actual = getTraitValue(render, trait.key);
      if (actual === trait.value) {
        return null;
      }

      return {
        label: trait.label,
        expected: trait.value,
        actual
      };
    })
    .filter(Boolean) as DesignDNADriftRender["driftTraits"];
  const matchingTraits = traits.length - driftTraits.length;

  return {
    score: Math.round((matchingTraits / traits.length) * 100),
    driftTraits
  };
}

function buildDNAText(traits: DesignDNATrait[], strengths: string[]) {
  const traitLines = traits.map((trait) => `${trait.label}: ${trait.value}`);
  const strengthLines = strengths.map((strength) => `Strength: ${strength}`);

  return [
    "Project Design DNA:",
    ...traitLines,
    ...strengthLines,
    "Use this as the standing design baseline. Preserve these decisions unless a render review explicitly asks to change them."
  ].join("\n");
}

export function buildDesignDNARegenerationRevision(args: {
  dnaText: string;
  driftRender: DesignDNADriftRender;
}) {
  const driftSummary = args.driftRender.driftTraits
    .map((trait) => `${trait.label} should return to ${trait.expected} instead of ${trait.actual}`)
    .join("; ");

  return [
    `Regenerate ${args.driftRender.label} back to Project Design DNA.`,
    args.dnaText,
    driftSummary ? `Fix these DNA mismatches: ${driftSummary}.` : null,
    "Preserve the project DNA and only change the mismatched traits needed to bring this render back in line."
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildProjectDesignDNAReport(args: { renders: StoredRender[] }): DesignDNAReport {
  const sourceRenders = args.renders.filter((render) => render.isFavorite && render.imageUrl);

  if (sourceRenders.length === 0) {
    return {
      status: "empty",
      sourceCount: 0,
      renderCount: args.renders.length,
      traits: [],
      strengths: [],
      dnaText: "",
      summary: "Favorite at least one strong render to create reusable project design DNA.",
      driftRenders: []
    };
  }

  const traits = TRAIT_KEYS
    .map((key) => getDominantTrait(sourceRenders, key))
    .filter(Boolean) as DesignDNATrait[];
  const strengths = getStrengthSignals(sourceRenders);
  const dnaText = buildDNAText(traits, strengths);
  const driftRenders = args.renders
    .filter((render) => render.imageUrl && !render.isFavorite)
    .map((render) => {
      const score = scoreRenderAgainstDNA(render, traits);
      if (!score || score.score >= 100) {
        return null;
      }

      return {
        renderId: render.id,
        label: formatRenderLabel(render),
        score: score.score,
        driftTraits: score.driftTraits.slice(0, 4)
      };
    })
    .filter(Boolean)
    .sort((left, right) => left!.score - right!.score)
    .slice(0, 3) as DesignDNADriftRender[];

  const averageConfidence = Math.round(
    traits.reduce((total, trait) => total + trait.confidence, 0) / Math.max(traits.length, 1)
  );

  return {
    status: "ready",
    sourceCount: sourceRenders.length,
    renderCount: args.renders.length,
    traits,
    strengths,
    dnaText,
    summary: `${sourceRenders.length} favorite render${sourceRenders.length === 1 ? "" : "s"} define a ${averageConfidence}% confidence design baseline.`,
    driftRenders
  };
}
