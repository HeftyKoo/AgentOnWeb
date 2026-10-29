import type { DockPosition } from "./shared.js";

const SIZE = 48;
const MARGIN = 14;
const GAP = 10;
const DRAG_THRESHOLD = 5;

export function positionDock(
  element: HTMLElement,
  toggle: HTMLButtonElement,
  panel: HTMLElement,
  toast: HTMLElement,
  onChange: (position: DockPosition) => void,
) {
  let position: DockPosition = { x: 1, y: 1 };
  let saved: DockPosition | undefined;
  let suppressClick = false;
  let gesture: {
    pointerId: number;
    clientX: number;
    clientY: number;
    left: number;
    top: number;
    original: DockPosition;
    dragged: boolean;
  } | undefined;

  function viewport() {
    const marginX = Math.min(MARGIN, Math.max(0, (window.innerWidth - SIZE) / 2));
    const marginY = Math.min(MARGIN, Math.max(0, (window.innerHeight - SIZE) / 2));
    return {
      marginX,
      marginY,
      travelX: Math.max(0, window.innerWidth - marginX * 2 - SIZE),
      travelY: Math.max(0, window.innerHeight - marginY * 2 - SIZE),
    };
  }

  function layout() {
    const { marginX, marginY, travelX, travelY } = viewport();
    const left = marginX + position.x * travelX;
    const top = marginY + position.y * travelY;
    element.style.right = `${window.innerWidth - left - SIZE}px`;
    element.style.bottom = `${window.innerHeight - top - SIZE}px`;
    const panelWidth = Math.min(292, window.innerWidth - marginX * 2);
    const panelHeight = Math.min(264, window.innerHeight - marginY * 2);
    const panelLeft = clamp(left + SIZE - panelWidth, marginX, window.innerWidth - marginX - panelWidth);
    const panelTop = floatingTop(panelHeight, top, marginY);
    panel.style.right = `${left + SIZE - panelLeft - panelWidth}px`;
    panel.style.bottom = `${top + SIZE - panelTop - panelHeight}px`;
    const toastHeight = toast.offsetHeight;
    let toastTop = floatingTop(toastHeight, top, marginY);
    if (element.dataset.expanded === "true") {
      toastTop = panelTop - GAP - toastHeight >= marginY
        ? panelTop - GAP - toastHeight
        : clamp(panelTop + panelHeight + GAP, marginY, window.innerHeight - marginY - toastHeight);
    }
    toast.style.right = panel.style.right;
    toast.style.bottom = `${top + SIZE - toastTop - toastHeight}px`;
  }

  function floatingTop(height: number, top: number, margin: number) {
    const above = top - GAP - height;
    const below = top + SIZE + GAP;
    return above >= margin ? above
      : below + height <= window.innerHeight - margin ? below
      : clamp(above, margin, window.innerHeight - margin - height);
  }

  function move(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const deltaX = event.clientX - gesture.clientX;
    const deltaY = event.clientY - gesture.clientY;
    if (!gesture.dragged && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
    gesture.dragged = true;
    element.dataset.dragging = "true";
    event.preventDefault();
    event.stopPropagation();
    const { marginX, marginY, travelX, travelY } = viewport();
    position = {
      x: travelX ? clamp((gesture.left + deltaX - marginX) / travelX, 0, 1) : position.x,
      y: travelY ? clamp((gesture.top + deltaY - marginY) / travelY, 0, 1) : position.y,
    };
    layout();
  }

  function finish(cancelled: boolean) {
    if (!gesture) return;
    const { pointerId, dragged, original } = gesture;
    gesture = undefined;
    delete element.dataset.dragging;
    suppressClick = dragged;
    if (cancelled) position = original;
    if (toggle.hasPointerCapture?.(pointerId)) toggle.releasePointerCapture(pointerId);
    layout();
    if (dragged && !cancelled) onChange(position);
  }

  toggle.title = "Click to toggle controls; drag to move";
  toggle.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.isPrimary === false || gesture) return;
    suppressClick = false;
    const { marginX, marginY, travelX, travelY } = viewport();
    gesture = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      left: marginX + position.x * travelX,
      top: marginY + position.y * travelY,
      original: position,
      dragged: false,
    };
    toggle.setPointerCapture?.(event.pointerId);
  });
  toggle.addEventListener("click", event => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener("pointermove", move, { capture: true, passive: false });
  window.addEventListener("pointerup", event => {
    if (event.pointerId !== gesture?.pointerId) return;
    move(event);
    finish(false);
  }, true);
  window.addEventListener("pointercancel", event => {
    if (event.pointerId === gesture?.pointerId) finish(true);
  }, true);
  toggle.addEventListener("lostpointercapture", () => finish(true));
  window.addEventListener("blur", () => finish(true));
  window.addEventListener("resize", () => { finish(true); layout(); });
  return {
    layout,
    render(next?: DockPosition) {
      if (!gesture && (next?.x !== saved?.x || next?.y !== saved?.y)) {
        position = next ?? { x: 1, y: 1 };
        saved = next;
      }
      layout();
    },
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
