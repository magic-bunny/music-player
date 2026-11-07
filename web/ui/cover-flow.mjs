export function coverPose(offset) {
  const distance = Math.abs(offset),
    side = Math.sign(offset);
  return {
    x: side * (Math.min(distance, 1) * 112 + Math.max(0, distance - 1) * 45),
    angle: -side * Math.min(distance, 1) * 62,
    z: -Math.min(distance, 5) * 35,
    order: 100 - Math.round(distance * 10),
    hidden: distance > 5,
  };
}
export function localHorizontalDelta(
  dx,
  dy,
  { a = 1, b = 0, c = 0, d = 1 } = {},
) {
  const determinant = a * d - b * c;
  return Math.abs(determinant) < 0.0001 ? dx : (d * dx - c * dy) / determinant;
}
export const coverIndex = (position, count) =>
  Math.max(0, Math.min(Math.max(0, count - 1), Math.round(position)));

// Cover Flow owns only presentation and gesture tracking. Selection and
// activation are dispatched to the same navigation path as the Click Wheel.
export class CoverFlow {
  constructor(root, { onSelect, onActivate, onCaption = () => {} }) {
    Object.assign(this, { root, onSelect, onActivate, onCaption });
    this.enabled = false;
    this.items = [];
    this.cards = [];
    this.position = 0;
    this.selected = 0;
    this.drag = null;
    this.wheel = 0;
    root.addEventListener("pointerdown", (event) => this.down(event), {
      capture: true,
    });
    root.addEventListener("pointermove", (event) => this.move(event));
    root.addEventListener("pointerup", (event) => this.up(event));
    root.addEventListener("pointercancel", () => this.cancel());
    root.addEventListener("lostpointercapture", () => {
      if (this.drag) this.cancel();
    });
    root.addEventListener(
      "click",
      (event) => {
        if (this.enabled && event.detail > 0) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      { capture: true },
    );
    root.addEventListener(
      "wheel",
      (event) => {
        if (!this.enabled) return;
        event.preventDefault();
        this.wheel +=
          (Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY) * (event.deltaMode === 1 ? 16 : 1);
        const steps = Math.trunc(this.wheel / 60);
        if (steps) {
          this.wheel -= steps * 60;
          this.choose(this.selected + steps);
        }
      },
      { passive: false },
    );
  }
  mount(items, selected) {
    this.cancel();
    this.enabled = true;
    this.items = items;
    this.cards = [...this.root.querySelectorAll(".track-card")];
    this.wheel = 0;
    for (const card of this.cards) {
      const art = card.querySelector(".card-art"),
        reflection = art.cloneNode(true);
      reflection.classList.add("cover-reflection");
      reflection.setAttribute("aria-hidden", "true");
      art.after(reflection);
    }
    this.caption = document.createElement("div");
    this.caption.className = "coverflow-caption";
    this.caption.setAttribute("aria-live", "polite");
    this.caption.innerHTML =
      '<span class="track-title"><span class="track-title-text"></span></span><span class="coverflow-artist"></span>';
    this.root.append(this.caption);
    this.captionIndex = -1;
    this.select(selected);
  }
  disable() {
    this.cancel();
    this.enabled = false;
  }
  select(index) {
    if (!this.enabled) return;
    this.selected = coverIndex(index, this.items.length);
    if (!this.drag) this.position = this.selected;
    this.paint();
  }
  choose(index) {
    index = coverIndex(index, this.items.length);
    if (index === this.selected) {
      this.select(index);
      return;
    }
    this.select(index);
    this.onSelect(index);
  }
  click(index) {
    if (!this.enabled) return;
    if (index === this.selected) this.onActivate(index);
    else this.choose(index);
  }
  paint() {
    this.cards.forEach((card, index) => {
      const pose = coverPose(index - this.position);
      card.hidden = pose.hidden;
      card.style.transform = `translateX(calc(-50% + ${pose.x}px)) translateZ(${pose.z}px) rotateY(${pose.angle}deg)`;
      card.style.zIndex = String(pose.order);
      card.classList.toggle("selected", index === this.selected);
      card.setAttribute("aria-current", String(index === this.selected));
    });
    if (this.caption && this.captionIndex !== this.selected) {
      this.captionIndex = this.selected;
      const item = this.items[this.selected];
      this.caption.querySelector(".track-title-text").textContent =
        item?.title || "";
      this.caption.querySelector(".track-title").title = item?.title || "";
      this.caption.querySelector(".coverflow-artist").textContent =
        item?.artist || "";
      this.onCaption(this.caption);
    }
    this.root.scrollLeft = 0;
  }
  down(event) {
    if (
      !this.enabled ||
      event.button !== 0 ||
      this.drag ||
      event.isPrimary === false
    )
      return;
    event.preventDefault();
    const card = event.target.closest(".track-card");
    const matrix = new DOMMatrixReadOnly(
      getComputedStyle(document.body).transform,
    );
    this.drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: this.position,
      matrix,
      index: card ? Number(card.dataset.index) : null,
      moved: false,
    };
    this.root.setPointerCapture(event.pointerId);
  }
  move(event) {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    const delta = localHorizontalDelta(
      event.clientX - drag.x,
      event.clientY - drag.y,
      drag.matrix,
    );
    if (Math.abs(delta) < 6 && !drag.moved) return;
    drag.moved = true;
    this.root.classList.add("coverflow-dragging");
    this.position = Math.max(
      0,
      Math.min(this.items.length - 1, drag.start - delta / 64),
    );
    const index = coverIndex(this.position, this.items.length);
    if (index !== this.selected) {
      this.selected = index;
      this.onSelect(index);
    }
    this.paint();
  }
  up(event) {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    this.drag = null;
    this.root.classList.remove("coverflow-dragging");
    if (this.root.hasPointerCapture(event.pointerId))
      this.root.releasePointerCapture(event.pointerId);
    this.select(this.selected);
    if (!drag.moved && drag.index !== null) this.click(drag.index);
  }
  cancel() {
    const drag = this.drag;
    this.drag = null;
    if (drag && this.root.hasPointerCapture(drag.id))
      this.root.releasePointerCapture(drag.id);
    this.root.classList.remove("coverflow-dragging");
    if (this.enabled) this.select(this.selected);
  }
}
