export class NavigationController {
  constructor(state, ports) {
    this.state = state;
    this.ports = ports;
  }
  remember(location, next) {
    if (next !== location.view) this.state.history.push(location);
  }
  home() {
    Object.assign(this.state, {
      openId: this.state.openId + 1,
      searching: false,
      history: [],
      page: 0,
      selected: 0,
    });
    this.ports.view("home", { remember: false });
  }
  previous() {
    const state = this.state;
    if (state.view === "tracks") {
      state.openId++;
      state.searching = false;
    }
    const location = state.history.pop() || {
      view: "home",
      page: 0,
      selected: 0,
      horizontal: 0,
      scroll: 0,
    };
    for (const key of ["page", "selected", "collection", "collectionTracks"])
      if (key in location) state[key] = location[key];
    return location;
  }
  async activate() {
    const state = this.state,
      p = this.ports,
      items = p.items(),
      item = items[state.selected];
    if (!item) return;
    if (item.collection) return p.collection(item);
    if (!item.action)
      return p.play(
        item.id,
        items.filter((entry) => !entry.action && !entry.collection),
      );
    switch (item.action) {
      case "open-search":
        return p.search();
      case "import-playlist":
        return p.importPlaylist();
      case "tune-radio":
        return p.tune();
      case "load-more":
        return p.more();
      case "more":
        p.view("playlists");
        state.selected = 0;
        p.render();
        if (p.musicCount() <= 10) return p.more();
        return;
      case "radio-more":
        p.view("radio-list");
        state.selected = 0;
        return;
      default:
        state.page = 0;
        state.selected = 0;
        if (item.action === "radio" && !state.radios.length)
          return p.searchRadio();
        if (item.action === "browse" && !p.musicCount()) return p.searchMusic();
        p.view(item.action);
    }
  }
}
