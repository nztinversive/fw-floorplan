export const RENDER_REVIEW_ISSUES = [
  {
    key: "entry_unclear",
    label: "Entry unclear",
    feedback: "make the entry sequence clearer and easier to read"
  },
  {
    key: "wrong_roofline",
    label: "Wrong roofline",
    feedback: "correct the roofline so it better matches the floor plan massing"
  },
  {
    key: "porch_too_small",
    label: "Porch too small",
    feedback: "increase the porch depth and make the covered entry more intentional"
  },
  {
    key: "windows_off",
    label: "Windows off",
    feedback: "align window placement and proportions more believably with the plan"
  },
  {
    key: "too_stylized",
    label: "Too stylized",
    feedback: "make the architecture more realistic, buildable, and residential"
  },
  {
    key: "materials_wrong",
    label: "Materials wrong",
    feedback: "revise the exterior materials to better match the selected style and brief"
  }
] as const;

export type RenderReviewIssueKey = (typeof RENDER_REVIEW_ISSUES)[number]["key"];

export function getRenderReviewIssueLabel(issueKey: string) {
  return RENDER_REVIEW_ISSUES.find((issue) => issue.key === issueKey)?.label ?? issueKey;
}

export function getRenderReviewIssueFeedback(issueKey: string) {
  return RENDER_REVIEW_ISSUES.find((issue) => issue.key === issueKey)?.feedback ?? issueKey;
}

export function formatRenderReviewFeedback(args: { issueKeys: string[]; notes: string }) {
  const issueFeedback = args.issueKeys.map(getRenderReviewIssueFeedback);
  const notes = args.notes.trim();

  if (issueFeedback.length > 0 && notes) {
    return `${issueFeedback.join("; ")}; reviewer notes: ${notes}`;
  }

  if (issueFeedback.length > 0) {
    return issueFeedback.join("; ");
  }

  return notes;
}
