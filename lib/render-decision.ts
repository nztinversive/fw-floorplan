import { RENDER_VIEW_ANGLE_LABELS } from "./render-angles";
import type { DesignDNAReport, DesignDNATraitKey } from "./design-dna";
import type { RenderQualityReport } from "./render-quality";
import { STYLE_PRESET_MAP } from "./style-presets";
import type { StoredRender } from "./types";

export type RenderDecisionCandidate = {
  renderId: string;
  label: "A" | "B";
  name: string;
  totalScore: number;
  qaScore: number;
  dnaScore: number;
  critiqueScore: number;
  favoriteScore: number;
  lineageScore: number;
  reasons: string[];
};

export type RenderDecisionReport = {
  recommendation: "use-a" | "use-b" | "needs-another-pass";
  summary: string;
  margin: number;
  winner?: RenderDecisionCandidate;
  weaker?: RenderDecisionCandidate;
  candidates: [RenderDecisionCandidate, RenderDecisionCandidate];
};

type RenderDecisionInput = {
  renders: [StoredRender, StoredRender];
  qualityByRenderId: Record<string, RenderQualityReport | undefined>;
  designDNA: DesignDNAReport;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getStyleLabel(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? style;
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

function getDNAMatchScore(render: StoredRender, designDNA: DesignDNAReport) {
  if (designDNA.status !== "ready" || designDNA.traits.length === 0) {
    return 100;
  }

  const matches = designDNA.traits.filter((trait) => getTraitValue(render, trait.key) === trait.value).length;
  return Math.round((matches / designDNA.traits.length) * 100);
}

function getCritiqueScore(render: StoredRender) {
  return render.latestCritique?.score ?? 50;
}

function getLineageScore(render: StoredRender, qualityByRenderId: Record<string, RenderQualityReport | undefined>) {
  if (!render.parentRenderId) {
    return 0;
  }

  const parentScore = qualityByRenderId[render.parentRenderId]?.score;
  const childScore = qualityByRenderId[render.id]?.score;
  if (parentScore === undefined || childScore === undefined) {
    return 0;
  }

  return clamp((childScore - parentScore) * 0.4, 0, 12);
}

function getCandidate(args: {
  render: StoredRender;
  label: "A" | "B";
  qualityByRenderId: Record<string, RenderQualityReport | undefined>;
  designDNA: DesignDNAReport;
}): RenderDecisionCandidate {
  const qualityReport = args.qualityByRenderId[args.render.id];
  const qaScore = qualityReport?.score ?? 50;
  const dnaScore = getDNAMatchScore(args.render, args.designDNA);
  const critiqueScore = getCritiqueScore(args.render);
  const favoriteScore = args.render.isFavorite ? 100 : 0;
  const lineageScore = getLineageScore(args.render, args.qualityByRenderId);
  const totalScore = Math.round(
    clamp(
      qaScore * 0.45 +
      dnaScore * 0.2 +
      critiqueScore * 0.15 +
      favoriteScore * 0.08 +
      lineageScore,
      0,
      100
    )
  );
  const reasons = [
    `${qaScore}/100 QA`,
    `${dnaScore}% DNA match`,
    args.render.latestCritique ? `${critiqueScore}/100 critique` : "no critique yet",
    args.render.isFavorite ? "already favorited" : null,
    lineageScore > 0 ? `+${Math.round(lineageScore)} lineage improvement` : null
  ].filter(Boolean) as string[];

  return {
    renderId: args.render.id,
    label: args.label,
    name: `${getStyleLabel(args.render.style)} ${RENDER_VIEW_ANGLE_LABELS[args.render.settings.viewAngle]}`,
    totalScore,
    qaScore,
    dnaScore,
    critiqueScore,
    favoriteScore,
    lineageScore,
    reasons
  };
}

export function analyzeRenderDecision(args: RenderDecisionInput): RenderDecisionReport {
  const candidates: [RenderDecisionCandidate, RenderDecisionCandidate] = [
    getCandidate({
      render: args.renders[0],
      label: "A",
      qualityByRenderId: args.qualityByRenderId,
      designDNA: args.designDNA
    }),
    getCandidate({
      render: args.renders[1],
      label: "B",
      qualityByRenderId: args.qualityByRenderId,
      designDNA: args.designDNA
    })
  ];
  const [left, right] = candidates;
  const winner = left.totalScore >= right.totalScore ? left : right;
  const weaker = winner.renderId === left.renderId ? right : left;
  const margin = winner.totalScore - weaker.totalScore;

  if (margin < 4 || winner.totalScore < 70) {
    return {
      recommendation: "needs-another-pass",
      summary:
        margin < 4
          ? "These renders are too close to call. Run another pass or use critique before choosing."
          : "Neither render is strong enough yet. Regenerate the weaker option before selecting a winner.",
      margin,
      weaker,
      candidates
    };
  }

  return {
    recommendation: winner.label === "A" ? "use-a" : "use-b",
    summary: `${winner.label} wins by ${margin} points: ${winner.reasons.slice(0, 3).join(", ")}.`,
    margin,
    winner,
    weaker,
    candidates
  };
}
