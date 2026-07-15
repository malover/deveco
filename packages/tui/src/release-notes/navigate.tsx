import type { JSX } from "solid-js"
import type { ReleaseNotesParentProps } from "./types"
import { DialogReleaseNoteContent } from "../component/dialog-release-note-content"

export function openReleaseNote(
  dialog: { replace: (input: () => JSX.Element) => void },
  tag: string,
  date: string | undefined,
  parentProps: ReleaseNotesParentProps,
): void {
  dialog.replace(() => (
    <DialogReleaseNoteContent
      tag={tag}
      date={date}
      body={parentProps.getBody(tag)}
      parentProps={parentProps}
    />
  ))
}
