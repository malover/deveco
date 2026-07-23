/**
 * Patch MouseParser to handle JetBrains Terminal (< 26.2) which sends mouse
 * motion events as ESC[<3;x;yM — button code 3 ("no button"), no motion bit,
 * with a press terminator "M".
 *
 * The standard xterm behavior for hover is ESC[<35;x;yM (button 3 + motion
 * bit 32 = 35). JetBrains omits the motion bit, so @opentui/core's parser
 * decodes button=3, isMotion=false, pressRelease="M" as:
 *   type = "down", button = 0 (LEFT)
 * Every hover position fires onMouseDown on the element under the cursor.
 *
 * Fix: when buttonBits === 3 (no button pressed) and the event is not a scroll,
 * force the event type to "move" — regardless of the motion bit or the
 * press/release terminator. Button code 3 explicitly means "no button", so
 * it cannot represent a real press or release.
 *
 * For decodeBasicEvent the same bug manifests differently: button code 3
 * without motion bit is decoded as type="up" (release), so we also guard that.
 */

import { MouseParser } from "@opentui/core"

const proto = MouseParser.prototype as any

const originalDecodeBasicEvent = proto.decodeBasicEvent
proto.decodeBasicEvent = function (this: any, buttonByte: number, x: number, y: number) {
  const result = originalDecodeBasicEvent.call(this, buttonByte, x, y)
  const buttonBits = buttonByte & 3
  const isScroll = (buttonByte & 64) !== 0
  // JetBrains hover: button=3, no motion bit → decoded as "up". Force to "move".
  if (buttonBits === 3 && !isScroll && result.type === "up") {
    result.type = "move"
    result.button = -1
  }
  return result
}

const originalDecodeSgrEvent = proto.decodeSgrEvent
proto.decodeSgrEvent = function (
  this: any,
  rawButtonCode: number,
  wireX: number,
  wireY: number,
  pressRelease: string,
) {
  const result = originalDecodeSgrEvent.call(this, rawButtonCode, wireX, wireY, pressRelease)
  const buttonBits = rawButtonCode & 3
  const isScroll = (rawButtonCode & 64) !== 0
  // JetBrains hover: button=3, no motion bit, "M" terminator → decoded as "down" btn 0.
  // Button code 3 means "no button pressed" — always a move, never a press or release.
  if (buttonBits === 3 && !isScroll) {
    result.type = "move"
    result.button = -1
  }
  return result
}
