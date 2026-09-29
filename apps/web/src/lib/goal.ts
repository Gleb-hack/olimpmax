/** The pupil's goal as request parameters: the server then adds `goalMatch` (why the olympiad suits the goal) to every card. */
export type GoalKeys = { universities: string[]; directions: string[] };
export const hasGoal = (goal: GoalKeys) => goal.universities.length > 0 || goal.directions.length > 0;
export function withGoal(query: URLSearchParams, goal: GoalKeys) {
  if (goal.universities.length) query.set('goalUniversities', goal.universities.join(','));
  if (goal.directions.length) query.set('goalDirections', goal.directions.join(','));
  return query;
}
export const goalQuery = (goal: GoalKeys) => withGoal(new URLSearchParams(), goal).toString();
