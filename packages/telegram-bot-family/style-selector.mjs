import { getBotPackage } from "./index.mjs";

export const STYLE_QUESTIONS = Object.freeze([
  { id: "energy_after_busy_day", axis: "EI", left: "E", right: "I", prompt: "Recharge by talking or by spending quiet time?" },
  { id: "energy_process_ideas", axis: "EI", left: "E", right: "I", prompt: "Develop ideas aloud or privately first?" },
  { id: "energy_new_group", axis: "EI", left: "E", right: "I", prompt: "Engage early or observe before joining?" },
  { id: "information_evidence", axis: "NS", left: "N", right: "S", prompt: "Start with patterns or concrete examples?" },
  { id: "information_future", axis: "NS", left: "N", right: "S", prompt: "Explore possibilities or current constraints first?" },
  { id: "information_explain", axis: "NS", left: "N", right: "S", prompt: "Prefer the big picture or ordered steps?" },
  { id: "decision_disagreement", axis: "TF", left: "T", right: "F", prompt: "Prioritize consistency or values and human impact?" },
  { id: "decision_feedback", axis: "TF", left: "T", right: "F", prompt: "Prefer direct critique or context-sensitive critique?" },
  { id: "decision_tradeoff", axis: "TF", left: "T", right: "F", prompt: "Lead with analysis or stakeholder priorities?" },
  { id: "structure_work", axis: "PJ", left: "P", right: "J", prompt: "Keep options open or lock a plan early?" },
  { id: "structure_deadline", axis: "PJ", left: "P", right: "J", prompt: "Work in adaptive sprints or a scheduled sequence?" },
  { id: "structure_change", axis: "PJ", left: "P", right: "J", prompt: "Adapt as facts change or preserve a stable structure?" },
]);

export function selectPersonalityStyle({ consent = false, answers = {} } = {}) {
  if (consent !== true) {
    return { ok: false, errors: ["style_selection_consent_required"], classification: null };
  }

  const scores = { E: 0, I: 0, N: 0, S: 0, T: 0, F: 0, P: 0, J: 0 };
  const errors = [];
  for (const question of STYLE_QUESTIONS) {
    const answer = answers[question.id];
    if (answer !== "left" && answer !== "right") {
      errors.push(`answer_required:${question.id}`);
      continue;
    }
    scores[answer === "left" ? question.left : question.right] += 1;
  }
  if (errors.length > 0) return { ok: false, errors, classification: null };

  const pairs = [["E", "I"], ["N", "S"], ["T", "F"], ["P", "J"]];
  const ambiguousAxes = pairs.filter(([left, right]) => scores[left] === scores[right]).map((pair) => pair.join(""));
  if (ambiguousAxes.length > 0) {
    return { ok: false, errors: ambiguousAxes.map((axis) => `axis_ambiguous:${axis}`), classification: null, scores };
  }

  const styleCode = pairs.map(([left, right]) => scores[left] > scores[right] ? left : right).join("");
  const profile = getBotPackage(styleCode.toLowerCase());
  return {
    ok: Boolean(profile),
    errors: profile ? [] : ["style_package_missing"],
    classification: profile ? {
      styleCode,
      profileId: profile.id,
      displayName: profile.displayName,
      status: "self_reflection_style_not_diagnosis",
      userMayOverride: true,
    } : null,
    scores,
  };
}
