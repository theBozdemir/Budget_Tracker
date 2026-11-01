import { useCallback, useEffect, useRef } from 'react'

const HOLD_MS = 450
const MOVE_TOLERANCE = 10
const EDGE = 90
const MAX_SCROLL_STEP = 18

// Press and hold a row to start selecting, then keep the finger down and slide
// over other rows to select (or unselect) everything in between, like iOS Photos.
// The page auto-scrolls when the finger nears the top or bottom edge.
//
// Rows are found by `data-select-id` on the element; rows without
// `data-selectable="true"` are skipped.
export default function useDragSelect({ listRef, orderedIds, selectedIds, setSelectedIds, onStart, bottomInset = 0 }) {
  const state = useRef(null)
  const suppressClickUntil = useRef(0)
  const latest = useRef({ orderedIds, selectedIds })
  latest.current = { orderedIds, selectedIds }

  const rowAt = useCallback((x, y) => {
    const el = document.elementFromPoint(x, y)?.closest?.('[data-select-id]')
    if (!el || !listRef.current?.contains(el)) return null
    return el.dataset.selectable === 'true' ? el.dataset.selectId : null
  }, [listRef])

  const applyRange = useCallback((toId) => {
    const drag = state.current
    if (!drag?.active || !toId) return
    const ids = latest.current.orderedIds
    const from = ids.indexOf(drag.anchorId)
    const to = ids.indexOf(toId)
    if (from === -1 || to === -1) return
    const [lo, hi] = from <= to ? [from, to] : [to, from]
    const range = ids.slice(lo, hi + 1)
    const next = new Set(drag.baseSelection)
    for (const id of range) {
      if (drag.adding) next.add(id)
      else next.delete(id)
    }
    setSelectedIds(next)
  }, [setSelectedIds])

  const stopDrag = useCallback(() => {
    const drag = state.current
    if (!drag) return
    clearTimeout(drag.timer)
    cancelAnimationFrame(drag.frame)
    if (drag.active) suppressClickUntil.current = Date.now() + 350
    state.current = null
  }, [])

  // Keep scrolling while the finger rests near an edge, re-checking which row is under it
  const autoScroll = useCallback(() => {
    const drag = state.current
    if (!drag?.active) return
    // Only scroll once the finger has actually moved, not because the hold began near an edge
    if (!drag.moved) {
      drag.frame = requestAnimationFrame(autoScroll)
      return
    }
    const bottomEdge = window.innerHeight - bottomInset - EDGE
    let step = 0
    if (drag.y < EDGE) step = -Math.ceil(((EDGE - drag.y) / EDGE) * MAX_SCROLL_STEP)
    else if (drag.y > bottomEdge) step = Math.ceil(((drag.y - bottomEdge) / EDGE) * MAX_SCROLL_STEP)
    if (step) {
      window.scrollBy(0, step)
      applyRange(rowAt(drag.x, drag.y))
    }
    drag.frame = requestAnimationFrame(autoScroll)
  }, [applyRange, rowAt, bottomInset])

  const onPointerDown = useCallback((event) => {
    if (event.button !== undefined && event.button !== 0) return
    const row = event.target.closest?.('[data-select-id]')
    if (!row || row.dataset.selectable !== 'true') return
    stopDrag()
    const id = row.dataset.selectId
    const drag = { id, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, active: false }
    drag.timer = setTimeout(() => {
      const selection = latest.current.selectedIds
      drag.active = true
      drag.anchorId = id
      drag.adding = !selection.has(id)
      drag.baseSelection = new Set(selection)
      onStart?.()
      applyRange(id)
      navigator.vibrate?.(10)
      drag.frame = requestAnimationFrame(autoScroll)
    }, HOLD_MS)
    state.current = drag
  }, [applyRange, autoScroll, onStart, stopDrag])

  useEffect(() => {
    function onMove(event) {
      const drag = state.current
      if (!drag) return
      drag.x = event.clientX
      drag.y = event.clientY
      if (!drag.active) {
        // Moving before the hold completes means the person is scrolling
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > MOVE_TOLERANCE) stopDrag()
        return
      }
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > MOVE_TOLERANCE) drag.moved = true
      applyRange(rowAt(event.clientX, event.clientY))
    }

    // Phones may hand the gesture to scrolling and stop sending pointer events,
    // so follow the finger through touch events as well. While dragging, keep
    // the browser from scrolling the page with the finger.
    function onTouchMove(event) {
      const drag = state.current
      const touch = event.touches[0]
      if (!drag || !touch) return
      if (!drag.active) {
        onMove(touch)
        return
      }
      event.preventDefault()
      onMove(touch)
    }

    function onPointerCancel(event) {
      // A touch drag continues through touch events; only end it when the finger lifts
      if (state.current?.active && event.pointerType === 'touch') return
      stopDrag()
    }

    // Swallow the tap that ends a hold, so it doesn't toggle or open the row
    function onClick(event) {
      if (Date.now() < suppressClickUntil.current && listRef.current?.contains(event.target)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    function onContextMenu(event) {
      if (state.current && listRef.current?.contains(event.target)) event.preventDefault()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', stopDrag)
    window.addEventListener('touchcancel', stopDrag)
    window.addEventListener('click', onClick, true)
    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stopDrag)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', stopDrag)
      window.removeEventListener('touchcancel', stopDrag)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('contextmenu', onContextMenu)
      stopDrag()
    }
  }, [applyRange, rowAt, stopDrag, listRef])

  return { onPointerDown }
}
