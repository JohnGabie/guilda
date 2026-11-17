import { projectState, SETUP_NOTICE } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { resolveProjectDir, resolvePluginRoot, runHookMain } from '../lib/hook-io.mjs';
import { agentGroups, skillGroups, isGuildaSkill, mayLoad } from '../lib/groups.mjs';

// The skill that sets guilda up: R28 prints no notice for it.
const SETUP_SKILL = 'guilda:init';
// The name of the caller with no agent type in the refusal text.
const MAIN_SESSION = 'main session';
// A value that is not a short plain name never goes into a refusal text or a record, because the model writes it.
const SAFE_NAME = /^[A-Za-z0-9_.:-][A-Za-z0-9_.: -]{0,63}$/;
const UNREADABLE = '(unreadable name)';

const shown = (value) => (typeof value === 'string' && SAFE_NAME.test(value) ? value.trim() : UNREADABLE);

function deny(projectDir, skillName, reason) {
  appendViolation(projectDir, { rule: 'R30', level: 'law', source: 'pre-skill', action: `skill call refused: ${skillName}` });
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }) + '\n',
  );
  return 0;
}

// PreToolUse on the Skill tool. R30: an agent loads a guilda skill only when the skill is shared or has a group of
// the agent. R28: with no .guilda folder, a guilda skill call prints the set-up notice and is never refused.
// The skill is tool_input.skill (`<plugin>:<name>`); the agent type is the top-level agent_type, absent in the main
// session. A field inside tool_input never names the agent.
await runHookMain(async (input) => {
  const projectDir = resolveProjectDir(input);
  const toolInput = input.tool_input !== null && typeof input.tool_input === 'object' ? input.tool_input : {};
  const skill = toolInput.skill;
  const guilda = isGuildaSkill(skill);

  if (projectState(projectDir).state === 'none') {
    if (guilda === true && skill.trim().toLowerCase() !== SETUP_SKILL) {
      process.stdout.write(JSON.stringify({ systemMessage: SETUP_NOTICE }) + '\n');
    }
    return 0;
  }

  if (guilda === false) return 0;
  const skillName = shown(skill);
  const cannotRead = `R30: cannot read the groups of the skill ${skillName}. Add \`groups\` to its SKILL.md.`;
  // A skill value that is not a string cannot be told apart from a guilda skill: fail closed.
  if (guilda === null) return deny(projectDir, skillName, cannotRead);

  const pluginRoot = resolvePluginRoot();
  const { groups } = skillGroups(pluginRoot, skill);
  if (groups === null) return deny(projectDir, skillName, cannotRead);

  const hasType = Object.hasOwn(input, 'agent_type');
  const agentType = hasType ? input.agent_type : undefined;
  const agentName = hasType ? shown(agentType) : MAIN_SESSION;
  const agent = agentGroups(pluginRoot, agentType);
  if (agent === null) {
    return deny(projectDir, skillName, `R30: the agent ${agentName} has no group field. Add \`group\` to its agent definition.`);
  }
  if (mayLoad(agent, groups)) return 0;
  return deny(
    projectDir,
    skillName,
    `R30: the skill ${skillName} is not for the agent ${agentName}. Ask the Architect for a skill of your group.`,
  );
});
