export function bindRotary(dial, { onRotate, onPress, onHold, canHold }) {
  let drag = null,
    suppressClick = false,
    wheelSum = 0,
    centerTimer = 0,
    centerHeld = false;
  dial.onpointerdown = (e) => {
    suppressClick = false;
    centerHeld = false;
    clearTimeout(centerTimer);
    const r = dial.getBoundingClientRect(),
      x = r.left + r.width / 2,
      y = r.top + r.height / 2,
      dx = e.clientX - x,
      dy = e.clientY - y,
      radius = Math.min(r.width, r.height) / 2;
    // Keep the center as a push button. Touch gets a wider rim for finger accuracy.
    const touchLike = e.pointerType === "touch" || e.pointerType === "pen";
    const edgeStart = (touchLike ? 0.42 : 0.56) * radius;
    if (Math.hypot(dx, dy) < edgeStart) {
      drag = null;
      if (canHold())
        centerTimer = setTimeout(() => {
          centerHeld = true;
          onHold();
        }, 650);
      return;
    }
    e.preventDefault();
    drag = { x, y, angle: Math.atan2(dy, dx), sum: 0, moved: false };
    dial.setPointerCapture(e.pointerId);
    dial.classList.add("dragging");
  };
  dial.onpointermove = (e) => {
    if (!drag) return;
    const angle = Math.atan2(e.clientY - drag.y, e.clientX - drag.x);
    let delta = angle - drag.angle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    drag.angle = angle;
    drag.sum += (delta * 180) / Math.PI;
    const steps = Math.trunc(drag.sum / 15);
    if (steps) {
      drag.moved = true;
      drag.sum -= steps * 15;
      onRotate(steps, e.isTrusted);
    }
  };
  dial.onpointerup = () => {
    clearTimeout(centerTimer);
    suppressClick = !!drag?.moved;
    drag = null;
    dial.classList.remove("dragging");
  };
  dial.onpointerleave = () => clearTimeout(centerTimer);
  dial.onpointercancel = () => {
    clearTimeout(centerTimer);
    drag = null;
    suppressClick = true;
    dial.classList.remove("dragging");
  };
  dial.onclick = () => {
    if (suppressClick || centerHeld) {
      suppressClick = false;
      centerHeld = false;
      return;
    }
    onPress();
  };
  function handleDialWheel(e) {
    e.preventDefault();
    wheelSum += e.deltaY || e.deltaX;
    const steps = Math.trunc(wheelSum / 35);
    if (steps) {
      wheelSum -= steps * 35;
      onRotate(Math.max(-3, Math.min(3, steps)), e.isTrusted);
    }
  }
  dial.addEventListener("wheel", handleDialWheel, { passive: false });
  dial.onkeydown = (e) => {
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      onRotate(
        ["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1,
        e.isTrusted,
      );
    }
    if (e.key === "Enter") {
      e.preventDefault();
      dial.click();
    }
  };

  return { handleDialWheel };
}
