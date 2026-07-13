const DOUBLE_CLICK_THRESHOLD_MS = 400
const DOUBLE_CLICK_MAX_OFFSET = 2

type LastClick = { time: number; x: number; y: number } | null

export function createDoubleClickDetector() {
  let lastClick: LastClick = null

  return {
    isDoubleClick(x: number, y: number): boolean {
      const now = performance.now()
      if (!lastClick) {
        lastClick = { time: now, x, y }
        return false
      }

      const dt = now - lastClick.time
      const dx = Math.abs(x - lastClick.x)
      const dy = Math.abs(y - lastClick.y)
      const isDouble =
        dt <= DOUBLE_CLICK_THRESHOLD_MS &&
        dx <= DOUBLE_CLICK_MAX_OFFSET &&
        dy <= DOUBLE_CLICK_MAX_OFFSET

      lastClick = isDouble ? null : { time: now, x, y }
      return isDouble
    },
  }
}
