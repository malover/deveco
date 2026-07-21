import llmBasicText from "./cases/llm-basic-text.case"
import planModeEnter from "./cases/plan-mode-enter.case"
import projectCreateDefaultApi from "./cases/project-create-default-api.case"
import configThirdPartyModels from "./cases/config-third-party-models.case"
import configThirdPartyModelRequest from "./cases/config-third-party-model-request.case"
import skillErrorInvalidImport from "./cases/skill-error-invalid-import.case"
import skillErrorTypeMismatch from "./cases/skill-error-type-mismatch.case"
import skillErrorSyntaxBracket from "./cases/skill-error-syntax-bracket.case"
import skillErrorCheckDisable from "./cases/skill-error-check-disable.case"
import skillGrammarDiffQuery from "./cases/skill-grammar-diff-query.case"
import skillGrammarClassDef from "./cases/skill-grammar-class-def.case"
import skillGrammarTsToArkts from "./cases/skill-grammar-ts-to-arkts.case"
import skillArkuiBasicComponent from "./cases/skill-arkui-basic-component.case"
import skillArkuiComplexLayout from "./cases/skill-arkui-complex-layout.case"
import skillDevecoCreateHelloWorld from "./cases/skill-deveco-create-hello-world.case"
import skillDevecoApi17Fallback from "./cases/skill-deveco-api17-fallback.case"
import globalCustomSkill from "./cases/global-custom-skill.case"
import projectCustomSkill from "./cases/project-custom-skill.case"
import configLocalMcp from "./cases/config-local-mcp.case"
import configRemoteMcp from "./cases/config-remote-mcp.case"
import mcpListServers from "./cases/mcp-list-servers.case"
import startAppDeploy from "./cases/start-app-deploy.case"
import hdcLogListDevices from "./cases/hdc-log-list-devices.case"
import incrementalDevBuildProject from "./cases/incremental-dev-build-project.case"
import commandExecution from "./cases/command-execution.case"
import arktsCheckEts from "./cases/arkts-check-ets.case"
import switchCwdBuild from "./cases/switch-cwd-build.case"
import switchCwdProjectBuild from "./cases/switch-cwd-project-build.case"
import buildProject from "./cases/build-project.case"
import buildFailureCheck from "./cases/build-failure-check.case"
import planToBuild from "./cases/plan-to-build.case"
import buildModeBuiltinTools from "./cases/build-mode-builtin-tools.case"
import planModeBuiltinTools from "./cases/plan-mode-builtin-tools.case"
import upgradeCommand from "./cases/upgrade-command.case"
import authListProviders from "./cases/auth-list-providers.case"
import modelsList from "./cases/models-list.case"
import agentList from "./cases/agent-list.case"
import agentCreate from "./cases/agent-create.case"
import sessionList from "./cases/session-list.case"
import acpStartup from "./cases/acp-startup.case"
import devecoTuiStart from "./cases/deveco-tui-start.case"
import type { LiveTestCase } from "./types"

export const cases: LiveTestCase[] = [
  llmBasicText,
  planModeEnter,
  projectCreateDefaultApi,
  configThirdPartyModels,
  configThirdPartyModelRequest,
  skillErrorInvalidImport,
  skillErrorTypeMismatch,
  skillErrorSyntaxBracket,
  skillErrorCheckDisable,
  skillGrammarDiffQuery,
  skillGrammarClassDef,
  skillGrammarTsToArkts,
  skillArkuiBasicComponent,
  skillArkuiComplexLayout,
  skillDevecoCreateHelloWorld,
  skillDevecoApi17Fallback,
  globalCustomSkill,
  projectCustomSkill,
  configLocalMcp,
  configRemoteMcp,
  mcpListServers,
  startAppDeploy,
  hdcLogListDevices,
  incrementalDevBuildProject,
  commandExecution,
  arktsCheckEts,
  switchCwdBuild,
  switchCwdProjectBuild,
  buildProject,
  buildFailureCheck,
  planToBuild,
  buildModeBuiltinTools,
  planModeBuiltinTools,
  upgradeCommand,
  authListProviders,
  modelsList,
  agentList,
  agentCreate,
  sessionList,
  acpStartup,
  devecoTuiStart,
]

export function getCaseByID(id: string) {
  return cases.find((item) => item.id === id)
}
