/**
 * The one list of tools this server exposes, grouped for display.
 *
 * `tools.ts` derives `TOOL_NAMES` from it and a test checks that exactly these
 * tools are registered; the home page renders the groups.
 */
export interface ToolGroup {
	title: string;
	description: string;
	tools: readonly string[];
}

export const TOOL_GROUPS: readonly ToolGroup[] = [
	{
		title: "Workouts",
		description:
			"Browse history, log new sessions, fix mistakes, and sync changes.",
		tools: [
			"get_workouts",
			"get_workout",
			"create_workout",
			"update_workout",
			"get_workouts_count",
			"get_workout_events",
		],
	},
	{
		title: "Routines",
		description:
			"Read and build training programs, including rep ranges and rest times.",
		tools: ["get_routines", "get_routine", "create_routine", "update_routine"],
	},
	{
		title: "Exercises",
		description:
			"Look up Hevy's exercise library, add custom exercises, track progress per lift.",
		tools: [
			"get_exercise_templates",
			"get_exercise_template",
			"create_exercise_template",
			"get_exercise_history",
		],
	},
	{
		title: "Folders",
		description: "Keep routines organised.",
		tools: [
			"get_routine_folders",
			"get_routine_folder",
			"create_routine_folder",
		],
	},
];

export const TOOL_NAMES: readonly string[] = TOOL_GROUPS.flatMap(
	(group) => group.tools,
);
