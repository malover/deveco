import { existsSync } from "node:fs"
import { GlobalBus, type GlobalEvent } from "../../src/bus/global"
import { bootstrap as cliBootstrap } from "../../src/cli/bootstrap"

const directory = process.argv[2]
const marker = process.argv[3]
const mode = process.argv[4]

if (!directory || !marker || (mode !== "success" && mode !== "reject")) {
  throw new Error("invalid instance bootstrap worker arguments")
}

const disposed = new Promise<void>((resolve) => {
  const handler = (event: GlobalEvent) => {
    if (event.directory !== directory || event.payload.type !== "server.instance.disposed") return
    GlobalBus.off("event", handler)
    resolve()
  }
  GlobalBus.on("event", handler)
})

if (mode === "success") {
  await cliBootstrap(directory, async () => {
    if (!existsSync(marker)) throw new Error("instance bootstrap marker was not written before callback")
    return "ok"
  })
  if (!existsSync(marker)) throw new Error("instance bootstrap marker was not written")
} else {
  try {
    await cliBootstrap(directory, async () => Promise.reject(new Error("boom")))
    throw new Error("callback did not reject")
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "boom") throw error
    await disposed
  }
}

process.stdout.write("ok\n")
process.exit(0)
