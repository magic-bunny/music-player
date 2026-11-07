export function renderBrowseItems(
  { container, items, list, carousel, page, selected, currentId },
  { icon, t, indicator, select, focus, hover },
) {
  container.replaceChildren();
  const visible =
    list || carousel ? items : items.slice(page * 3, page * 3 + 3);
  for (const [offset, item] of visible.entries()) {
    const index = list || carousel ? offset : page * 3 + offset;
    const button = document.createElement("button");
    const current = currentId === item.id || item.homeActive;
    button.className =
      (list ? "track-row" : "track-card") +
      (selected === index ? " selected" : "") +
      (current ? " current" : "");
    button.dataset.id = item.id;
    button.dataset.index = index;
    button.setAttribute(
      "aria-label",
      item.action || item.collection
        ? t("Open {title}", { title: item.title })
        : t("Play {title}", { title: item.title }),
    );
    const art = document.createElement("div");
    art.className = list ? "row-art" : "card-art";
    const symbol =
      item.action === "open-search"
        ? "search"
        : ["import-playlist", "tune-radio"].includes(item.action)
          ? "plus"
          : item.stream
            ? "radio"
            : "music";
    art.innerHTML = `<span class="card-placeholder">${icon(symbol)}</span>`;
    const img = document.createElement("img");
    img.alt = t("{title} artwork", { title: item.title });
    img.dataset.id = item.id;
    img.draggable = false;
    art.append(img);
    const details = document.createElement("span");
    details.className = "track-details";
    const title = document.createElement("span");
    title.className = "track-title";
    title.title = item.title;
    const text = document.createElement("span");
    text.className = "track-title-text";
    text.textContent = item.title;
    title.append(text);
    const artist = document.createElement("span");
    artist.className = "track-artist";
    if (current) artist.append(indicator());
    artist.append(document.createTextNode(item.artist || ""));
    details.append(title, artist);
    button.append(art, details);
    button.onclick = () => select(index);
    button.onfocus = () => focus(index, item, button);
    button.onpointerenter = () => hover(item);
    if (list) {
      const row = document.createElement("div");
      row.setAttribute("role", "listitem");
      row.append(button);
      container.append(row);
    } else container.append(button);
  }
  return visible;
}
