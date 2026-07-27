import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { ensureDevecoCliShellEnv } from "@/tool/lib/deveco-cli"

export async function DevEcoCliEnvPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    "shell.env": async (_input, output) => {
      const extra = await ensureDevecoCliShellEnv()
      if (!extra) return
      Object.assign(output.env, extra)
    },
  }
}
