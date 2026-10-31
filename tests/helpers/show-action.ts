import type { ShowAction, ShowState } from "@/lib/contracts";

type OptionalBinding<Action> = Action extends ShowAction
  ? Omit<Action, "roundId" | "previousRoundId"> &
      Partial<
        Pick<Action, Extract<keyof Action, "roundId" | "previousRoundId">>
      >
  : never;
export type FixtureAction = OptionalBinding<ShowAction>;

/** Fixtures emulate the UI's capture at intent creation, never at a later queue execution. */
export function captureFixtureAction(
  action: FixtureAction,
  show: ShowState,
): ShowAction {
  if (action.type === "open-round")
    return {
      ...action,
      previousRoundId:
        action.previousRoundId === undefined
          ? (show.round?.id ?? null)
          : action.previousRoundId,
    };
  if (action.type === "apply-weather")
    return {
      ...action,
      roundId:
        action.roundId === undefined
          ? (show.round?.id ?? null)
          : action.roundId,
    };
  if (
    ["close-round", "resolve-round", "apply-choice", "rehearsal-vote"].includes(
      action.type,
    )
  ) {
    const roundAction = action as Extract<FixtureAction, { roundId?: string }>;
    return {
      ...roundAction,
      roundId:
        roundAction.roundId ?? show.round?.id ?? "no-active-fixture-round",
    } as ShowAction;
  }
  return action as ShowAction;
}
