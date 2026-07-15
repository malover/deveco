import type { ReleaseMeta } from "./shared"

export interface ReleaseNotesParentProps {
  releases: ReleaseMeta[]
  getBody: (tag: string) => string | null
  title?: string
}
