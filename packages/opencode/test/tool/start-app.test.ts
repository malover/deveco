import { describe, expect, test } from "bun:test"
import { formatStartAppResults, runStartAppWorkflow } from "../../src/tool/start_app"

type Result = { stdout: string; stderr: string; exitCode: number }

function runner(outputs: Record<string, Partial<Result>>) {
  const calls: string[][] = []
  return {
    calls,
    run: async (args: string[]) => {
      calls.push(args)
      return {
        stdout: "",
        stderr: "",
        exitCode: 0,
        ...outputs[args.join(" ")],
      }
    },
  }
}

describe("start_app workflow", () => {
  test("formats stderr status before stdout results", () => {
    const output = formatStartAppResults([
      {
        command: "devecocli emulator list",
        result: {
          stdout: "Name  Status\nPhone stopped\n",
          stderr: "- Listing emulators…\n",
          exitCode: 0,
        },
      },
    ])

    expect(output).toContain("- Listing emulators…\nName  Status")
  })

  test("runs directly when the selected device is active", async () => {
    const cli = runner({ "device list": { stdout: "Phone\n" } })
    await runStartAppWorkflow({ hvd: "Phone" }, "C:\\project", cli.run)

    expect(cli.calls).toEqual([
      ["device", "list"],
      ["run", "--skip-build", "--device", "Phone"],
    ])
  })

  test("starts a stopped emulator before running the app", async () => {
    const cli = runner({
      "device list": { stdout: "127.0.0.1:5555\n" },
      "emulator list": { stdout: "Phone Emulator    stopped\n" },
    })
    const results = await runStartAppWorkflow({ hvd: "Phone Emulator" }, "C:\\project", cli.run)

    expect(cli.calls).toEqual([
      ["device", "list"],
      ["emulator", "list"],
      ["emulator", "start", "Phone Emulator"],
      ["run", "--skip-build", "--device", "Phone Emulator"],
    ])
    expect(results[2]?.command).toBe('devecocli emulator start "Phone Emulator"')
    const output = formatStartAppResults(results)
    expect(output).not.toContain("$ devecocli device list")
    expect(output).not.toContain("$ devecocli emulator list")
    expect(output).toContain('$ devecocli emulator start "Phone Emulator"')
    expect(output).toContain('$ devecocli run --skip-build --device "Phone Emulator"')
  })

  test("does not run the app when emulator startup fails", async () => {
    const cli = runner({
      "emulator list": { stdout: "Phone    stopped\n" },
      "emulator start Phone": { stderr: "start failed", exitCode: 1 },
    })
    const results = await runStartAppWorkflow({ hvd: "Phone" }, "C:\\project", cli.run)

    expect(cli.calls).toEqual([
      ["device", "list"],
      ["emulator", "list"],
      ["emulator", "start", "Phone"],
    ])
    const output = formatStartAppResults(results)
    expect(output).toContain("$ devecocli device list")
    expect(output).toContain("$ devecocli emulator list")
    expect(output).toContain("$ devecocli emulator start Phone")
  })

  test("keeps direct run behavior when the target is not a local emulator", async () => {
    const cli = runner({})
    await runStartAppWorkflow({ hvd: "Unknown" }, "C:\\project", cli.run)

    expect(cli.calls).toEqual([
      ["device", "list"],
      ["emulator", "list"],
      ["run", "--skip-build", "--device", "Unknown"],
    ])
  })
})
