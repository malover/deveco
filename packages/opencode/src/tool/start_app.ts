/*
 * Copyright (c) 2026 Huawei Device Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import path from "path"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { getSessionCwd } from "./lib/session-cwd"
import {
  buildDevecoCliRunArgs,
  buildDevecoCliStartAppCommands,
  devecoCliListContainsTarget,
  runBundledDevecoCli,
} from "./lib/deveco-cli"

const Parameters = Schema.Struct({
  ability: Schema.optional(Schema.NullOr(Schema.String)).annotate({
    description: "要启动的 Ability 名称（如 'EntryAbility'）。如果不指定，则由 devecocli 从 module.json5 中读取。",
  }),
  hvd: Schema.optional(Schema.NullOr(Schema.String)).annotate({
    description: "目标设备的名称或序列号（例如 127.0.0.1:5555）。如果不提供，系统将列出所有可用设备供选择。",
  }),
  module: Schema.optional(Schema.NullOr(Schema.String)).annotate({
    description: "要启动的模块名称（如 'entry'）。如果不指定，则由 devecocli 自动选择唯一可运行模块。",
  }),
  target: Schema.optional(Schema.NullOr(Schema.String)).annotate({
    description: "构建目标（如 'default'）。指定后将与模块组合为 module@target。",
  }),
})

type CliResult = Awaited<ReturnType<typeof runBundledDevecoCli>>
type StartAppInput = Schema.Schema.Type<typeof Parameters>
type CliRunner = (args: string[], cwd: string) => Promise<CliResult>
export type RecordedResult = { command: string; result: CliResult }

interface StartAppMetadata {
  commands: string[]
  exitCodes: number[]
}

function resolveProjectRoot(sessionID: string | undefined, fallback: string) {
  const sessionDir = sessionID ? getSessionCwd(sessionID) : undefined
  return path.resolve(sessionDir ?? fallback)
}

function resultOutput(result: CliResult) {
  if (result.stdout && result.stderr) return `${result.stderr}${result.stdout}`
  return result.stdout || result.stderr
}

function commandText(args: string[]) {
  return `devecocli ${args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(" ")}`
}

const DISCOVERY_COMMANDS = new Set(["devecocli device list", "devecocli emulator list"])

export function formatStartAppResults(results: RecordedResult[]) {
  const emulatorStarted = results.some(
    ({ command, result }) => command.startsWith("devecocli emulator start ") && result.exitCode === 0,
  )
  const visible = emulatorStarted
    ? results.filter(({ command }) => !DISCOVERY_COMMANDS.has(command))
    : results
  return visible.map(({ command, result }) => `$ ${command}\n${resultOutput(result)}`.trimEnd()).join('\n\n');
}

export async function runStartAppWorkflow(
  args: StartAppInput,
  cwd: string,
  runner: CliRunner = runBundledDevecoCli,
): Promise<RecordedResult[]> {
  const results: RecordedResult[] = []
  const invoke = async (cliArgs: string[]) => {
    const result = await runner(cliArgs, cwd)
    results.push({ command: commandText(cliArgs), result })
    return result
  }

  for (const cliArgs of buildDevecoCliStartAppCommands(args)) {
    await invoke(cliArgs)
  }

  const device = args.hvd?.trim()
  if (!device) return results

  const runArgs = buildDevecoCliRunArgs({
    device,
    ability: args.ability ?? undefined,
    module: args.module ?? undefined,
    target: args.target ?? undefined,
  })
  const deviceList = results[0]?.result
  if (deviceList && devecoCliListContainsTarget(resultOutput(deviceList), device)) {
    await invoke(runArgs)
    return results
  }

  const emulatorList = await invoke(["emulator", "list"])
  if (!devecoCliListContainsTarget(resultOutput(emulatorList), device)) {
    await invoke(runArgs)
    return results
  }

  const startResult = await invoke(["emulator", "start", device])
  if (startResult.exitCode === 0) {
    await invoke(runArgs)
  }
  return results
}

export const StartAppTool = Tool.define("start_app", Effect.gen(function* () {
  return {
    description:
      "在模拟器或真机上运行已构建的应用，不主动构建。调用本工具前，必须先调用 devecocli device list 和 devecocli emulator list 查看设备与模拟器列表，并根据执行结果选择目标设备。未指定设备时，本工具会返回上述两个命令的结果；指定尚未运行的本地模拟器时，本工具会先启动模拟器，再跳过构建并部署、启动应用。",
    parameters: Parameters,
    execute: (args: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<StartAppMetadata>) =>
      Effect.gen(function* () {
        const cwd = resolveProjectRoot(ctx.sessionID, process.cwd())
        const results = yield* Effect.tryPromise(() => runStartAppWorkflow(args, cwd))

        const commands = results.map(({ command }) => command)
        return {
          title: commands.join(" && "),
          output: formatStartAppResults(results),
          metadata: {
            commands,
            exitCodes: results.map(({ result }) => result.exitCode),
          },
        }
      }).pipe(Effect.orDie),
  }
}))
