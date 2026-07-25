/// <reference path="./audio.d.ts" />
import type { TuiAttentionSoundName } from "@opencode-ai/plugin/tui"
import alert01 from "@opencode-ai/ui/audio/alert-01.mp3" with { type: "file" }
import alert02 from "@opencode-ai/ui/audio/alert-02.mp3" with { type: "file" }
import alert03 from "@opencode-ai/ui/audio/alert-03.mp3" with { type: "file" }
import alert04 from "@opencode-ai/ui/audio/alert-04.mp3" with { type: "file" }
import alert05 from "@opencode-ai/ui/audio/alert-05.mp3" with { type: "file" }
import alert06 from "@opencode-ai/ui/audio/alert-06.mp3" with { type: "file" }
import alert07 from "@opencode-ai/ui/audio/alert-07.mp3" with { type: "file" }
import alert08 from "@opencode-ai/ui/audio/alert-08.mp3" with { type: "file" }
import alert09 from "@opencode-ai/ui/audio/alert-09.mp3" with { type: "file" }
import alert10 from "@opencode-ai/ui/audio/alert-10.mp3" with { type: "file" }
import bipBop01 from "@opencode-ai/ui/audio/bip-bop-01.mp3" with { type: "file" }
import bipBop02 from "@opencode-ai/ui/audio/bip-bop-02.mp3" with { type: "file" }
import bipBop03 from "@opencode-ai/ui/audio/bip-bop-03.mp3" with { type: "file" }
import bipBop04 from "@opencode-ai/ui/audio/bip-bop-04.mp3" with { type: "file" }
import bipBop05 from "@opencode-ai/ui/audio/bip-bop-05.mp3" with { type: "file" }
import bipBop06 from "@opencode-ai/ui/audio/bip-bop-06.mp3" with { type: "file" }
import bipBop07 from "@opencode-ai/ui/audio/bip-bop-07.mp3" with { type: "file" }
import bipBop08 from "@opencode-ai/ui/audio/bip-bop-08.mp3" with { type: "file" }
import bipBop09 from "@opencode-ai/ui/audio/bip-bop-09.mp3" with { type: "file" }
import bipBop10 from "@opencode-ai/ui/audio/bip-bop-10.mp3" with { type: "file" }
import nope01 from "@opencode-ai/ui/audio/nope-01.mp3" with { type: "file" }
import nope02 from "@opencode-ai/ui/audio/nope-02.mp3" with { type: "file" }
import nope03 from "@opencode-ai/ui/audio/nope-03.mp3" with { type: "file" }
import nope04 from "@opencode-ai/ui/audio/nope-04.mp3" with { type: "file" }
import nope05 from "@opencode-ai/ui/audio/nope-05.mp3" with { type: "file" }
import nope06 from "@opencode-ai/ui/audio/nope-06.mp3" with { type: "file" }
import nope07 from "@opencode-ai/ui/audio/nope-07.mp3" with { type: "file" }
import nope08 from "@opencode-ai/ui/audio/nope-08.mp3" with { type: "file" }
import nope09 from "@opencode-ai/ui/audio/nope-09.mp3" with { type: "file" }
import nope10 from "@opencode-ai/ui/audio/nope-10.mp3" with { type: "file" }
import nope11 from "@opencode-ai/ui/audio/nope-11.mp3" with { type: "file" }
import nope12 from "@opencode-ai/ui/audio/nope-12.mp3" with { type: "file" }
import staplebops01 from "@opencode-ai/ui/audio/staplebops-01.mp3" with { type: "file" }
import staplebops02 from "@opencode-ai/ui/audio/staplebops-02.mp3" with { type: "file" }
import staplebops03 from "@opencode-ai/ui/audio/staplebops-03.mp3" with { type: "file" }
import staplebops04 from "@opencode-ai/ui/audio/staplebops-04.mp3" with { type: "file" }
import staplebops05 from "@opencode-ai/ui/audio/staplebops-05.mp3" with { type: "file" }
import staplebops06 from "@opencode-ai/ui/audio/staplebops-06.mp3" with { type: "file" }
import staplebops07 from "@opencode-ai/ui/audio/staplebops-07.mp3" with { type: "file" }
import yup01 from "@opencode-ai/ui/audio/yup-01.mp3" with { type: "file" }
import yup02 from "@opencode-ai/ui/audio/yup-02.mp3" with { type: "file" }
import yup03 from "@opencode-ai/ui/audio/yup-03.mp3" with { type: "file" }
import yup04 from "@opencode-ai/ui/audio/yup-04.mp3" with { type: "file" }
import yup05 from "@opencode-ai/ui/audio/yup-05.mp3" with { type: "file" }
import yup06 from "@opencode-ai/ui/audio/yup-06.mp3" with { type: "file" }

export type SoundCategory = "alert" | "bip-bop" | "nope" | "staplebops" | "yup"

export type SoundCatalogEntry = {
  id: string
  name: string
  category: SoundCategory
  path: string
}

export const SOUND_CATALOG: ReadonlyArray<SoundCatalogEntry> = [
  { id: "alert-01", name: "Alert 01", category: "alert", path: alert01 },
  { id: "alert-02", name: "Alert 02", category: "alert", path: alert02 },
  { id: "alert-03", name: "Alert 03", category: "alert", path: alert03 },
  { id: "alert-04", name: "Alert 04", category: "alert", path: alert04 },
  { id: "alert-05", name: "Alert 05", category: "alert", path: alert05 },
  { id: "alert-06", name: "Alert 06", category: "alert", path: alert06 },
  { id: "alert-07", name: "Alert 07", category: "alert", path: alert07 },
  { id: "alert-08", name: "Alert 08", category: "alert", path: alert08 },
  { id: "alert-09", name: "Alert 09", category: "alert", path: alert09 },
  { id: "alert-10", name: "Alert 10", category: "alert", path: alert10 },
  { id: "bip-bop-01", name: "Bip Bop 01", category: "bip-bop", path: bipBop01 },
  { id: "bip-bop-02", name: "Bip Bop 02", category: "bip-bop", path: bipBop02 },
  { id: "bip-bop-03", name: "Bip Bop 03", category: "bip-bop", path: bipBop03 },
  { id: "bip-bop-04", name: "Bip Bop 04", category: "bip-bop", path: bipBop04 },
  { id: "bip-bop-05", name: "Bip Bop 05", category: "bip-bop", path: bipBop05 },
  { id: "bip-bop-06", name: "Bip Bop 06", category: "bip-bop", path: bipBop06 },
  { id: "bip-bop-07", name: "Bip Bop 07", category: "bip-bop", path: bipBop07 },
  { id: "bip-bop-08", name: "Bip Bop 08", category: "bip-bop", path: bipBop08 },
  { id: "bip-bop-09", name: "Bip Bop 09", category: "bip-bop", path: bipBop09 },
  { id: "bip-bop-10", name: "Bip Bop 10", category: "bip-bop", path: bipBop10 },
  { id: "nope-01", name: "Nope 01", category: "nope", path: nope01 },
  { id: "nope-02", name: "Nope 02", category: "nope", path: nope02 },
  { id: "nope-03", name: "Nope 03", category: "nope", path: nope03 },
  { id: "nope-04", name: "Nope 04", category: "nope", path: nope04 },
  { id: "nope-05", name: "Nope 05", category: "nope", path: nope05 },
  { id: "nope-06", name: "Nope 06", category: "nope", path: nope06 },
  { id: "nope-07", name: "Nope 07", category: "nope", path: nope07 },
  { id: "nope-08", name: "Nope 08", category: "nope", path: nope08 },
  { id: "nope-09", name: "Nope 09", category: "nope", path: nope09 },
  { id: "nope-10", name: "Nope 10", category: "nope", path: nope10 },
  { id: "nope-11", name: "Nope 11", category: "nope", path: nope11 },
  { id: "nope-12", name: "Nope 12", category: "nope", path: nope12 },
  { id: "staplebops-01", name: "Staplebops 01", category: "staplebops", path: staplebops01 },
  { id: "staplebops-02", name: "Staplebops 02", category: "staplebops", path: staplebops02 },
  { id: "staplebops-03", name: "Staplebops 03", category: "staplebops", path: staplebops03 },
  { id: "staplebops-04", name: "Staplebops 04", category: "staplebops", path: staplebops04 },
  { id: "staplebops-05", name: "Staplebops 05", category: "staplebops", path: staplebops05 },
  { id: "staplebops-06", name: "Staplebops 06", category: "staplebops", path: staplebops06 },
  { id: "staplebops-07", name: "Staplebops 07", category: "staplebops", path: staplebops07 },
  { id: "yup-01", name: "Yup 01", category: "yup", path: yup01 },
  { id: "yup-02", name: "Yup 02", category: "yup", path: yup02 },
  { id: "yup-03", name: "Yup 03", category: "yup", path: yup03 },
  { id: "yup-04", name: "Yup 04", category: "yup", path: yup04 },
  { id: "yup-05", name: "Yup 05", category: "yup", path: yup05 },
  { id: "yup-06", name: "Yup 06", category: "yup", path: yup06 },
]

export const SOUND_CATEGORIES: ReadonlyArray<{ id: SoundCategory; name: string }> = [
  { id: "bip-bop", name: "Bip Bop" },
  { id: "yup", name: "Yup" },
  { id: "nope", name: "Nope" },
  { id: "alert", name: "Alert" },
  { id: "staplebops", name: "Staplebops" },
]

export const DEFAULT_SOUND_IDS: Record<TuiAttentionSoundName, string> = {
  default: "bip-bop-01",
  question: "bip-bop-03",
  permission: "staplebops-06",
  error: "nope-03",
  done: "bip-bop-01",
  subagent_done: "yup-01",
}

export function findCatalogEntry(id: string) {
  return SOUND_CATALOG.find((entry) => entry.id === id)
}
