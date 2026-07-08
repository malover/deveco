# Live E2E Test Cases

This document is the case map for live end-to-end tests. These tests may use the real local Huawei DevEco login and call the real LLM provider.

| ID                           | Name                         | Category | Priority | Requirements                                 | Code                                       |
| ---------------------------- | ---------------------------- | -------- | -------- | -------------------------------------------- | ------------------------------------------ |
| `LLM_BASIC_TEXT`             | 真实登录态下普通消息返回文本 | `llm`    | `P0`     | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/llm-basic-text.case.ts`             |
| `PLAN_MODE_ENTER`            | 切换到plan模式               | `slash`  | `P0`     | `huawei-auth`, `real-llm`                    | `cases/plan-mode-enter.case.ts`            |
| `PROJECT_CREATE_DEFAULT_API` | 参数完整，无自定义apiLevel   | `skill`  | `P0`     | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/project-create-default-api.case.ts` |
| `START_APP_DEPLOY`           | start_app推包启动            | `cli`    | `P0`     | `huawei-auth`, `deveco-provider`, `deveco-home` | `cases/start-app-deploy.case.ts` |
| `HDC_LOG_LIST_DEVICES`       | hdc_log设备列表              | `cli`    | `P1`     | `huawei-auth`, `deveco-provider`, `deveco-home` | `cases/hdc-log-list-devices.case.ts` |
| `COMMAND_EXECUTION`          | 指令执行                     | `llm`    | `P1`     | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/command-execution.case.ts` |
| `CONFIG_THIRD_PARTY_MODELS`  | 在deveco.jsonc中配置三方模型 | `cli`    | `P1`     | `huawei-auth`                                | `cases/config-third-party-models.case.ts`  |
| `CONFIG_THIRD_PARTY_MODEL_REQUEST` | 全局配置三方模型并发起请求 | `llm` | `P1` | `real-llm` | `cases/config-third-party-model-request.case.ts` |
| `GLOBAL_CUSTOM_SKILL`        | 添加本地全局自定义 skill     | `skill`  | `P0`     | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/global-custom-skill.case.ts`        |
| `PROJECT_CUSTOM_SKILL`       | 创建项目级 skill             | `skill`  | `P0`     | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/project-custom-skill.case.ts`       |
| `CONFIG_LOCAL_MCP`           | 配置本地 MCP                 | `llm`    | `P0`     | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/config-local-mcp.case.ts`           |
| `CONFIG_REMOTE_MCP`          | 配置远端 MCP                 | `llm`    | `P0`     | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/config-remote-mcp.case.ts`          |
| `SKILL_ERROR_INVALID_IMPORT` | 无效引用修复 | `skill` | `P1` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/skill-error-invalid-import.case.ts` |
| `SKILL_ERROR_TYPE_MISMATCH` | 类型错误修复 | `skill` | `P1` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/skill-error-type-mismatch.case.ts` |
| `SKILL_ERROR_SYNTAX_BRACKET` | 语法错误修复 | `skill` | `P1` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/skill-error-syntax-bracket.case.ts` |
| `SKILL_ERROR_DISABLE_CHECK` | 关闭ArkTS类型检查 | `skill` | `P1` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/skill-error-check-disable.case.ts` |
| `SKILL_GRAMMAR_DIFF_QUERY` | 差异点查询 | `skill` | `P1` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/skill-grammar-diff-query.case.ts` |
| `SKILL_GRAMMAR_CLASS_DEF` | 正确语法查询 | `skill` | `P1` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/skill-grammar-class-def.case.ts` |
| `SKILL_GRAMMAR_TS_TO_ARKTS` | 错误代码修复 | `skill` | `P1` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/skill-grammar-ts-to-arkts.case.ts` |
| `SKILL_ARKUI_BASIC_COMPONENT` | 基础组件使用 | `skill` | `P1` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/skill-arkui-basic-component.case.ts` |
| `SKILL_ARKUI_COMPLEX_LAYOUT` | 复杂布局实现 | `skill` | `P1` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/skill-arkui-complex-layout.case.ts` |
| `SKILL_DEVECO_CREATE_HELLO_WORLD` | 0-1构建项目 | `skill` | `P1` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/skill-deveco-create-hello-world.case.ts` |
| `SKILL_DEVECO_API17_FALLBACK` | SDK选择推荐 | `skill` | `P1` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/skill-deveco-api17-fallback.case.ts` |
| `INCREMENTAL_DEV_BUILD_PROJECT` | 增量开发触发build_project | `skill` | `P1` | `huawei-auth`, `real-llm`, `deveco-provider`, `deveco-home` | `cases/incremental-dev-build-project.case.ts` |
| `ARKTS_CHECK_ETS` | 指定ets文件进行语法检查check_ets_files | `cli` | `P0` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/arkts-check-ets.case.ts` |
| `SWITCH_CWD_BUILD` | 指定目录不存在项目代码构建switch_cwd | `cli` | `P0` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/switch-cwd-build.case.ts` |
| `SWITCH_CWD_PROJECT_BUILD` | 支持指定目录项目代码构建switch_cwd | `cli` | `P0` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/switch-cwd-project-build.case.ts` |
| `BUILD_PROJECT` | 支持鸿蒙项目代码构建build project | `cli` | `P0` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/build-project.case.ts` |
| `BUILD_FAILURE_CHECK` | 编译构建结果检查 | `cli` | `P0` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/build-failure-check.case.ts` |
| `PLAN_TO_BUILD` | 制定需求计划后跳转到build模式构建 | `slash` | `P0` | `huawei-auth`, `real-llm`, `deveco-provider` | `cases/plan-to-build.case.ts` |

## LLM_BASIC_TEXT

Purpose:

Verify that the source CLI can read the local Huawei DevEco OAuth credential, inject the DevEco provider, send a normal prompt, and receive real LLM text.

Steps:

1. Create a temporary workspace.
2. Run `deveco run --format json --dir <tmp>`.
3. Send `Reply with exactly this text and nothing else: LIVE_TEST_OK`.
4. Parse JSON-line events from stdout.
5. Collect the text events and session id.

Expected result:

1. The process exits with code `0`.
2. At least one `text` event is emitted.
3. The received text contains `LIVE_TEST_OK`.

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## START_APP_DEPLOY

Purpose:

Verify that a minimal HarmonyOS project template can be built into local debug artifacts with `build_project`, deployed with `start_app`, and observed as installed on a running or startable HarmonyOS emulator.

Steps:

1. Create a temporary workspace.
2. Generate a minimal project from the built-in `deveco-create-project/application` template.
3. Run `deveco debug agent build --tool build_project --params '{"build_mode":"debug"}'` from the generated project.
4. Run `deveco debug agent build --tool start_app --params '{"module":"entry","target":"default","ability":"EntryAbility","hvd":"<first emulator target>"}'` when an emulator is already connected; otherwise omit `hvd` and let `start_app` start an available emulator.
5. Run `hdc -t <target> shell bm dump -n com.example.livee2estartapp` against the running emulator target observed after `start_app`.
6. Verify the package query output contains the expected bundle name.

Expected result:

1. The project template is copied successfully and reports `verified: true`.
2. `build_project` exits with code `0` and does not return a failure marker.
3. `start_app` exits with code `0` and does not return a failure marker.
4. `bm dump` confirms `com.example.livee2estartapp` is installed on the emulator target.

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco installation, auth, and config files are read-only and are not cleaned or modified by this case. If `start_app` starts an emulator, the case does not stop it.

## HDC_LOG_LIST_DEVICES

Purpose:

Verify that the `hdc_log` tool can be invoked through the debug agent with `list_devices`, and that it handles both connected-device and no-device states.

Steps:

1. Discover the local DevEco Studio installation.
2. Build the same real-user DevEco environment used by other DevEco tool live e2e cases.
3. Run `deveco debug agent build --tool hdc_log --params '{"action":"list_devices"}'`.
4. Parse the debug tool JSON output.
5. Verify `tool`, `input.action`, `result.metadata.deviceCount`, and the expected title/output for either connected devices or no devices.

Expected result:

1. The command exits with code `0`.
2. The debug result is for `hdc_log` with `action: "list_devices"`.
3. `metadata.deviceCount` is a non-negative number.
4. No-device output returns `No Devices`; connected-device output returns `Connected Devices`.

Cleanup:

This case does not create a temporary project. The user's real DevEco installation, auth/config, and device state are read-only and are not cleaned or modified.

## COMMAND_EXECUTION

Purpose:

Verify that when the user asks to globally install fastify from a project directory, the CLI executes an npm global install command through the bash tool.

Steps:

1. Create a temporary project workspace and minimal `package.json`.
2. Point npm global prefix and cache to directories inside the temporary workspace.
3. Run `deveco run --format json --dir <tmp> --dangerously-skip-permissions`.
4. Send a prompt instructing the agent to run only `npm install -g fastify` without `sudo`.
5. Parse JSON-line events from stdout.
6. Verify a completed bash tool event executed `npm install -g fastify`, `npm install --global fastify`, `npm i -g fastify`, or a Windows `npm.cmd` equivalent.

Expected result:

1. The process exits with code `0`.
2. A completed bash tool event is emitted.
3. The bash command globally installs `fastify` with npm and does not use `sudo`.

Cleanup:

The temporary project workspace, npm prefix, and npm cache are deleted after execution. The user's real DevEco auth/config and global npm environment are not modified.

## SKILL_ERROR_INVALID_IMPORT

Purpose:

Verify that selecting the arkts-error-fixes skill via /skill and inputting code with an unimported router module produces a fix that includes `import router from 'ohos.router'`.

Steps:

1. Create a temporary workspace.
2. Run `deveco run --format json --dir <tmp> --command arkts-error-fixes` with code referencing `router.pushUrl` without importing the router module.
3. Parse JSON-line events from stdout.
4. Verify text events contain `import`, `router`, and `ohos.router`.

Expected result:

1. At least one text event is emitted.
2. The response contains `import router` and `ohos.router` fix suggestion.

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## SKILL_ERROR_TYPE_MISMATCH

Purpose:

Verify that selecting the arkts-error-fixes skill via /skill and inputting code with a type error (`let num: number = "hello"`) produces a type or value fix suggestion.

Steps:

1. Create a temporary workspace.
2. Run `deveco run --format json --dir <tmp> --command arkts-error-fixes` with `let num: number = "hello"`.
3. Parse JSON-line events from stdout.
4. Verify text events contain type fix suggestion (string/number/类型).

Expected result:

1. At least one text event is emitted.
2. The response contains a type correction suggestion mentioning string or number.

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## SKILL_ERROR_SYNTAX_BRACKET

Purpose:

Verify that selecting the arkts-error-fixes skill via /skill and inputting component code with a missing closing brace produces a fix that identifies the missing `}`.

Steps:

1. Create a temporary workspace.
2. Run `deveco run --format json --dir <tmp> --command arkts-error-fixes` with component code missing a closing `}`.
3. Parse JSON-line events from stdout.
4. Verify text events mention the missing `}` bracket.

Expected result:

1. At least one text event is emitted.
2. The response identifies the missing closing brace and provides a fix.

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## SKILL_ERROR_DISABLE_CHECK

Purpose:

Verify that asking whether ArkTS type checking can be disabled to preserve dynamic property assignment loads the ArkTS error-fix guidance and returns a recommendation that type checking should not or cannot be disabled for that purpose.

Steps:

1. Create a temporary workspace.
2. Run `deveco run --format json --dir <tmp>` with a question about preserving `obj[dynamicKey] = value` by disabling type checking.
3. Parse JSON-line events from stdout.
4. Verify text events contain cannot-disable guidance such as `不能`, `不可`, `不建议`, or `无法关闭`.

Expected result:

1. At least one `text` event is emitted.
2. The response recommends against disabling ArkTS type checking or states that it cannot be disabled for this pattern.

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## SKILL_GRAMMAR_DIFF_QUERY

Purpose:

Verify that selecting the arkts-grammar-standards skill via /skill and asking about ArkTS vs TS function declaration differences returns a clear difference explanation (e.g., mandatory type declarations).

Steps:

1. Create a temporary workspace.
2. Run `deveco run --format json --dir <tmp> --command arkts-grammar-standards` with the question "ArkTS和TS在函数声明上有什么不同？".
3. Parse JSON-line events from stdout.
4. Verify text events contain type declaration and function difference explanations.

Expected result:

1. At least one text event is emitted.
2. The response mentions type declarations and function differences.

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## PROJECT_CUSTOM_SKILL

Purpose:

Verify that a custom skill under a project's `.agents/skills` directory is visible and executable only inside that project and does not leak into another project.

Steps:

1. Create an isolated temporary user home, project A, and project B.
2. Write `.agents/skills/live-e2e-project-skill/SKILL.md` under project A.
3. Run `deveco debug skill` in both projects.
4. Run `deveco run --command live-e2e-project-skill --format json` in project B.
5. Run the same command in project A with a real LLM request.
6. Parse JSON-line events from both command executions.

Expected result:

1. Project A's skill list contains the custom skill with the expected description and project-local location.
2. Project B's skill list does not contain the custom skill.
3. Running the command in project B exits with a non-zero code and emits an `error` event.
4. Running the command in project A exits with code `0` and the model response contains `PROJECT_SKILL_OK`.

Cleanup:

The temporary user home and both projects are deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## SKILL_GRAMMAR_CLASS_DEF

Purpose:

Verify that selecting the arkts-grammar-standards skill via /skill and asking how to define a class in ArkTS returns a code snippet containing `class` and key point explanations.

Steps:

1. Create a temporary workspace.
2. Run `deveco run --format json --dir <tmp> --command arkts-grammar-standards` with the question "ArkTS中如何定义一个类？".
3. Parse JSON-line events from stdout.
4. Verify text events contain `class` keyword and ArkTS code.

Expected result:

1. At least one text event is emitted.
2. The response contains `class` keyword and ArkTS code snippet.

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## SKILL_GRAMMAR_TS_TO_ARKTS

Purpose:

Verify that selecting the arkts-grammar-standards skill via /skill and providing TypeScript code returns equivalent ArkTS code.

Steps:

1. Create a temporary workspace.
2. Run `deveco run --format json --dir <tmp> --command arkts-grammar-standards` with a TS-to-ArkTS conversion request.
3. Parse JSON-line events from stdout.
4. Verify text events contain ArkTS equivalent code.

Expected result:

1. At least one text event is emitted.
2. The response contains ArkTS code with type declarations, class, or function.

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## SKILL_ARKUI_BASIC_COMPONENT

Purpose:

Verify that selecting the arkui-knowledge skill via /skill and asking how to create a Text component with red font color returns code containing `Text('你好').fontColor(Color.Red)` or equivalent.

Steps:

1. Copy arkui-knowledge skill from opencode config to deveco data directory if not already present.
2. Create a temporary workspace.
3. Run `deveco run --format json --dir <tmp> --command arkui-knowledge` with the question about Text component with red font color.
4. Parse JSON-line events from stdout.
5. Verify text events contain `Text(`, `fontColor`, and red color reference.
6. Clean up copied skill and temporary workspace.

Expected result:

1. At least one text event is emitted.
2. The response contains `Text(`, `fontColor`, and `Color.Red` or `red`.

Cleanup:

The temporary workspace and any copied skill files are deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## SKILL_ARKUI_COMPLEX_LAYOUT

Purpose:

Verify that selecting the arkui-knowledge skill via /skill and requesting a vertical layout with an image and a button returns a complete example using `Column`, `Image`, and `Button` components.

Steps:

1. Copy arkui-knowledge skill from opencode config to deveco data directory if not already present.
2. Create a temporary workspace.
3. Run `deveco run --format json --dir <tmp> --command arkui-knowledge` with a layout request.
4. Parse JSON-line events from stdout.
5. Verify text events contain `Column`, `Image`, and `Button` components.
6. Clean up copied skill and temporary workspace.

Expected result:

1. At least one text event is emitted.
2. The response contains `Column`, `Image`, and `Button` in a complete layout example.

Cleanup:

The temporary workspace and any copied skill files are deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## SKILL_DEVECO_CREATE_HELLO_WORLD

Purpose:

Verify that selecting the deveco-create-project skill via /skill and requesting a hello world project with compilation loads the create-project skill, copies the initial project template, calls build_project, and fixes any build issues until compilation succeeds.

Steps:

1. Create a temporary workspace.
2. Run `deveco run --format json --dir <tmp> --command deveco-create-project` with the prompt "帮我生成一个hello world工程，并完成编译".
3. Parse JSON-line events from stdout (tolerating truncated lines).
4. Find the `bash` tool event that ran `copy-template` with `status: "completed"` and `verified: true`.
5. Verify `build-profile.json5` exists on disk at the `projectRoot`.
6. Find `build_project` tool events and verify build was attempted.
7. Verify build succeeded or errors were fixed.

Expected result:

1. `copy-template` script executed successfully with `verified: true`.
2. `build-profile.json5` exists in the project directory.
3. `build_project` was called and build succeeded or was fixed.

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## ARKTS_CHECK_ETS

Purpose:

Verify that the `check_ets_files` tool can perform ArkTS static syntax checking on a specified .ets file. Based on the HarmonyOS project template, construct an erroneous .ets file (using `any` type, violating the `arkts-no-any-unknown` rule), invoke the tool, and verify that diagnostic results are returned.

Steps:

1. Create a temporary workspace and copy the HarmonyOS project template.
2. Overwrite `entry/src/main/ets/pages/Index.ets` with an erroneous version that uses the `any` type.
3. Run `deveco run --format json --dir <tmp>` with a prompt instructing the agent to use `check_ets_files` to check the file.
4. Parse JSON-line events from stdout.
5. Verify the agent's text response contains diagnostic-related keywords.

Expected result:

1. The process exits with code `0`.
2. At least one `text` event is emitted.
3. The received text contains diagnostic keywords (错误/error/诊断/diagnostic/警告/warning).

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## SWITCH_CWD_BUILD

Purpose:

Verify that `switch_cwd` can switch to a directory that contains no HarmonyOS project, and `build_project` reports that no project exists.

Steps:

1. Create an empty temporary workspace (no `build-profile.json5`, no `oh-package.json5`, no `entry/` directory).
2. Run `deveco run --format json --dir <tmp>` with a prompt instructing the agent to first use `switch_cwd` to switch to the empty directory, then use `build_project` to compile.
3. Parse JSON-line events from stdout.
4. Verify the agent's text response mentions the switch and indicates no project / build failure.

Expected result:

1. The process exits with code `0`.
2. At least one `text` event is emitted.
3. The received text mentions the switch (切换/switch) and indicates no project or build failure (无工程/失败/error).

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## SWITCH_CWD_PROJECT_BUILD

Purpose:

Verify that `switch_cwd` can switch to a directory containing a valid HarmonyOS project, and `build_project` completes the compilation build successfully.

Steps:

1. Create a temporary workspace and copy the HarmonyOS project template to it.
2. Run `deveco run --format json --dir <tmp>` with a prompt instructing the agent to first use `switch_cwd` to switch to the project directory, then use `build_project` to compile.
3. Parse JSON-line events from stdout.
4. Verify the agent's text response mentions the switch and indicates build success (no failure keywords).

Expected result:

1. The process exits with code `0`.
2. At least one `text` event is emitted.
3. The received text mentions the switch (切换/switch) and indicates success (成功/success/完成/complete) with no failure keywords (失败/fail/报错/异常).

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## BUILD_PROJECT

Purpose:

Verify that the `build_project` tool can compile and build a HarmonyOS project. The user inputs "帮我用build project工具构建当前项目工程" and the agent calls `build_project` to successfully complete the build and return build results.

Steps:

1. Create a temporary workspace and copy the HarmonyOS project template to it.
2. Run `deveco run --format json --dir <tmp>` with the prompt "帮我用build project工具构建当前项目工程".
3. Parse JSON-line events from stdout.
4. Verify the agent's text response indicates build success with no failure keywords.

Expected result:

1. The process exits with code `0`.
2. At least one `text` event is emitted.
3. The received text contains success keywords (成功/success/完成/complete) and no failure keywords (失败/fail/报错/异常).

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## BUILD_FAILURE_CHECK

Purpose:

Verify that `build_project` returns failure check results when building a project with compilation errors. The project's `Index.ets` is overwritten with a version containing `any` type usage and a type mismatch, causing ArkTS compilation failure.

Steps:

1. Create a temporary workspace and copy the HarmonyOS project template to it.
2. Overwrite `entry/src/main/ets/pages/Index.ets` with an erroneous version (uses `any` type, type mismatch).
3. Run `deveco run --format json --dir <tmp>` with the prompt "帮我用build project工具构建当前项目工程".
4. Parse JSON-line events from stdout.
5. Verify the agent's text response contains build failure keywords.

Expected result:

1. The process exits with code `0`.
2. At least one `text` event is emitted.
3. The received text contains failure keywords (失败/fail/错误/error/报错/异常).

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## SKILL_DEVECO_API17_FALLBACK

Purpose:

Verify that selecting the deveco-create-project skill (supporting API18-22) via /skill and specifying API17 for project creation, the system recognizes API17 is not in the supported range, queries the SDK directory for a corresponding version, and if not found defaults to API22.

Steps:

1. Create a temporary workspace.
2. Run `deveco run --format json --dir <tmp> --command deveco-create-project` with the prompt specifying API 17.
3. Parse JSON-line events from stdout (tolerating truncated lines).
4. Find the `bash` tool event that ran `copy-template`.
5. Parse the `copy-template` output and verify API level info.
6. If API17 was rejected, verify the system fell back to SDK default or API22.
7. Verify `build-profile.json5` exists on disk at the `projectRoot`.

Expected result:

1. `copy-template` script was executed.
2. If API17 was out of range, the system fell back to SDK default or API22.
3. `build-profile.json5` exists in the project directory.

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## PLAN_TO_BUILD

Purpose:

Verify that a refactoring plan created in plan mode can be accepted, causing a switch to build mode where refactoring begins. Uses a two-run approach: first run creates the plan in `--agent plan` mode, second run continues the session with `--session <id> --agent build` to start refactoring.

Steps:

1. Create a temporary workspace and copy the HarmonyOS project template to it.
2. Step 1: Run `deveco run --agent plan --format json --dir <tmp>` with prompt "请帮我制定一下重构计划". Parse events and extract session ID.
3. Step 2: Run `deveco run --session <id> --agent build --format json --dir <tmp>` with prompt "接受重构计划，开始重构". Parse events.
4. Verify step 1 returned plan content, step 2 shows build mode refactoring activity.

Expected result:

1. Both steps exit with code `0`.
2. Step 1 emits at least one `text` event with plan-related content (计划/plan/重构/refactor).
3. Step 2 emits at least one `text` event with refactoring activity (重构/开始/修改/实现/完成).
4. The `--agent plan` → `--agent build` switch via `--session` demonstrates plan-to-build mode transition.

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## CONFIG_THIRD_PARTY_MODELS

Purpose:

Verify that third-party models configured in deveco.jsonc at different hierarchy levels (global `~/.deveco`, project root, project `.deveco`) are correctly visible via `deveco models`: all levels are visible inside the project that defines them, while only the global level is visible in a different project.

Steps:

1. Create a temporary user home directory and write `.deveco/deveco.jsonc` with third-party model A.
2. Create a temporary project A workspace and write `deveco.jsonc` at the project root with third-party model B.
3. Write `.deveco/deveco.jsonc` inside project A with third-party model C.
4. Create a temporary project B workspace with no project-level config.
5. Run `deveco models` in project A root directory.
6. Run `deveco models` in project B root directory.

Expected result:

1. Step 5 output contains models A, B, and C (in `provider/model` format).
2. Step 6 output contains only model A; it does NOT contain model B or model C.

Cleanup:

All temporary directories (temp home, temp config home, project A, project B) are deleted after execution. The user's real auth and config files are not modified.

## CONFIG_THIRD_PARTY_MODEL_REQUEST

Purpose:

Verify that a third-party model loaded from the common live E2E configuration is visible in `/models` after being added to the global config, and that the model can complete a request.

Steps:

1. Read the common live E2E configuration file.
2. Require exactly one configured third-party provider/model in `live-e2e.config.json`.
3. Create isolated temporary global-config and workspace directories.
4. Write the configured third-party model to the temporary global `deveco.jsonc`.
5. Run `deveco models` and verify the configured model is listed.
6. Run `deveco run --model <configured-provider>/<configured-model> --format json`.
7. Parse the JSON-line response events.

Expected result:

1. `deveco models` lists the configured third-party model.
2. The model request exits with code `0`.
3. At least one non-empty text event is returned.

Cleanup:

The temporary global-config and workspace directories are deleted. The user's real auth and config files are neither read nor modified.

## CONFIG_LOCAL_MCP

Purpose:

Verify that local MCP servers configured in global and project-level `deveco.jsonc` files are visible in the correct project scopes and can be called from a real LLM request.

Steps:

1. Create a temporary global configuration directory, project A, and project B.
2. Configure `live-e2e-global-mcp` in the global `deveco.jsonc`.
3. Configure `live-e2e-project-mcp` in project A's `deveco.jsonc`.
4. Run `deveco mcp list` in projects A and B.
5. Run a real LLM request in project A that calls both MCP tools.
6. Parse JSON-line events and verify both tool calls and their outputs.

Expected result:

1. Project A lists both MCP servers as connected.
2. Project B lists the global MCP as connected and does not list project A's MCP.
3. The global MCP tool completes and returns `GLOBAL_MCP_TOOL_OK`.
4. The project MCP tool completes and returns `PROJECT_MCP_TOOL_OK`.
5. The model response contains `LOCAL_MCP_OK`.

Cleanup:

The temporary global configuration directory and both projects are deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## CONFIG_REMOTE_MCP

Purpose:

Verify that remote MCP servers configured in global and project-level `deveco.jsonc` files are visible in the correct project scopes and can be called from a real LLM request.

Steps:

1. Start two local StreamableHTTP MCP test servers.
2. Create a temporary global configuration directory, project A, and project B.
3. Configure the global remote MCP server with the runtime URL from `DEVECO_LIVE_E2E_GLOBAL_REMOTE_MCP_URL`.
4. Configure the project remote MCP server with the runtime URL from `DEVECO_LIVE_E2E_PROJECT_REMOTE_MCP_URL`.
5. Run `deveco mcp list` in projects A and B.
6. Run a real LLM request in project A that calls both remote MCP tools.
7. Parse JSON-line events and verify both tool calls and their outputs.

Expected result:

1. Project A lists both remote MCP servers as connected.
2. Project B lists the global remote MCP as connected and does not list project A's remote MCP.
3. The global remote MCP tool completes and returns `GLOBAL_REMOTE_MCP_TOOL_OK`.
4. The project remote MCP tool completes and returns `PROJECT_REMOTE_MCP_TOOL_OK`.
5. The model response contains `REMOTE_MCP_OK`.

Cleanup:

The temporary global configuration directory and both projects are deleted, and the local StreamableHTTP MCP test servers are stopped. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## PLAN_MODE_ENTER

Purpose:

Verify that switching to plan mode via --agent plan parameter works correctly, sends a mode confirmation request, and receives real LLM response confirming plan mode.

Steps:

1. Create a temporary workspace.
2. Run `deveco run --agent plan --format json --dir <tmp>`.
3. Send `你是什么模式？`.
4. Parse JSON-line events from stdout.
5. Verify agent switching events and text responses.

Expected result:

1. The process exits with code `0`.
2. At least one `text` event is emitted.
3. The received text contains plan-related keywords (计划, plan).
4. Agent switching events may be present.

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## GLOBAL_CUSTOM_SKILL

Purpose:

Verify that a custom skill added under the local user's `~/.agents/skills` directory is available in the `/skills` browser and can be sent as a slash-command request to the real LLM provider.

Steps:

1. Create isolated temporary user-home and workspace directories.
2. Write `~/.agents/skills/live-e2e-global-skill/SKILL.md` under the temporary user home.
3. Run `deveco debug skill` and verify the command data used by `/skills` contains the custom skill.
4. Run `deveco run --command live-e2e-global-skill --format json --dir <tmp>` with a real LLM request.
5. Parse JSON-line events and collect the text response.

Expected result:

1. The skill listing exits with code `0` and contains the custom skill's name, description, and user-home location.
2. The skill request exits with code `0`.
3. At least one `text` event is emitted.
4. The received text contains `GLOBAL_SKILL_OK`, as required by the custom skill.

Cleanup:

The temporary user home and workspace are deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## PROJECT_CREATE_DEFAULT_API

Purpose:

Verify that the source CLI can create a HarmonyOS project from a natural-language prompt without specifying a custom apiLevel. The system should auto-detect the SDK apiLevel, create the project, emit complete output, generate `build-profile.json5`, and switch the session cwd to the new project directory.

Steps:

1. Create a temporary workspace.
2. Run `deveco run --format json --dir <tmp>`.
3. Send the prompt: "请在当前工作目录从0到1生成一个名为HelloWorld的鸿蒙应用，提供一个简洁的HelloWorld页面，最后完成编译并尝试运行，如受环境限制请明确说明原因".
4. Parse JSON-line events from stdout (tolerating truncated lines from a process killed mid-stream).
5. Find the `bash` tool event that ran `copy-template` with `status: "completed"`, and verify the command does not contain `--api-level`.
6. Parse the `copy-template` output JSON and verify it contains complete project info (`projectRoot`, `appName`, `bundleName`, `apiLevel`, `source`).
7. Verify `source` is `sdk_pkg` (auto-detected) and `verified` is `true`.
8. Verify `build-profile.json5` exists on disk at the `projectRoot`.
9. Verify cwd was switched: either the `copy-template` output contains `Session directory auto-switched` or a `switch_cwd` tool event with `status: "completed"` exists.

Expected result:

1. A completed `copy-template` bash tool event is found, with `verified: true` in the output.
2. The output contains complete project info including `projectRoot`, `appName`, `bundleName`, `apiLevel`, and `source`.
3. `build-profile.json5` exists in the project directory.
4. cwd was switched (auto-switch message or `switch_cwd` tool event).

Cleanup:

The temporary workspace is deleted after execution. The user's real DevEco auth and config files are read-only and are not cleaned or modified by this case.

## INCREMENTAL_DEV_BUILD_PROJECT

Purpose:

验证在已有鸿蒙工程上进行增量开发：先使用 copy-template 生成最小工程，然后通过 AI 对话创建"我的"页面并增量添加"清除缓存"菜单项，最后直接调用 build_project 验证工程可编译通过。

Steps:

1. 创建临时工作目录。
2. 使用内置 copy-template 脚本生成最小 HarmonyOS 工程。
3. 在工程目录下运行 `deveco run --format json --dir <projectRoot>`，发送组合 prompt：先添加"我的"页面，再在"我的"页面里添加"清除缓存"菜单项。
4. 解析 stdout 中的 JSON line events。
5. 验证相关页面文件存在代码修改（包含"清除缓存"相关代码）。
6. 直接调用 `deveco debug agent build --tool build_project --params '{"build_mode":"debug"}'`。
7. 验证编译通过且无 failure marker。

Expected result:

1. 相关页面文件被修改，包含"清除缓存"相关代码。
2. build_project 工具执行完成。
3. 编译通过，无编译失败信号。

Cleanup:

临时工作目录在执行结束后删除。真实 auth/config 只读不清理。
