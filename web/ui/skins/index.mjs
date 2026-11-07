import { carThing } from "./carthing.mjs";
import { ipod, IpodPresenter } from "./ipod.mjs";
import { walkman, WalkmanPresenter } from "./walkman.mjs";
const skins = { carthing: carThing, ipod, walkman };
export const skinIds = Object.keys(skins);
export const skinFor = (id) => skins[id] || carThing;
export function createSkinPresenter(dependencies) {
  const presenter = new IpodPresenter(dependencies);
  const walkmanPresenter = new WalkmanPresenter(dependencies);
  let previous;
  return {
    enter(id) {
      if (id === "ipod") presenter.enter();
      else document.body.classList.remove("ipod-home-preview");
    },
    rotate(id, view) {
      if (id === "ipod") presenter.rotate(view);
    },
    volume(id, value) {
      if (id === "walkman") walkmanPresenter.volume(value);
    },
    update(id, model) {
      if (id !== previous) {
        for (const tag of document.querySelectorAll("[data-skin]"))
          tag.setAttribute("aria-pressed", String(tag.dataset.skin === id));
        previous = id;
      }
      if (id === "ipod") presenter.update(model);
      if (id === "walkman") walkmanPresenter.update(model);
    },
    preview(id, model) {
      if (id === "ipod") presenter.preview(model);
      if (id === "walkman") walkmanPresenter.preview(model);
    },
  };
}
