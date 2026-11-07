export async function getJson(url, params = {}, fetcher = fetch) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params))
    target.searchParams.set(key, String(value));
  const response = await fetcher(target, {
    signal: AbortSignal.timeout(20000),
    credentials: "omit",
  });
  if (!response.ok)
    throw Error(`Music service returned HTTP ${response.status}.`);
  return response.json();
}
export function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
const audiusCover = (v) =>
  ["480x480", "1000x1000", "150x150"]
    .map((size) => httpsUrl(v.artwork?.[size]))
    .find(Boolean) || null;
export function audiusTrack(v) {
  if (
    !v?.id ||
    !v.title ||
    v.is_streamable !== true ||
    v.is_stream_gated === true ||
    v.is_available === false ||
    v.is_delete === true ||
    v.access?.stream === false
  )
    return null;
  return {
    id: `audius:${v.id}`,
    title: v.title,
    artist: v.user?.name || "Audius",
    album: v.album_backlink?.playlist_name || "Audius",
    seconds: v.duration || 0,
    local: false,
    stream: null,
    cover_url: audiusCover(v),
  };
}
export class AudiusProvider {
  id = "audius";
  name = "Audius";
  constructor(fetcher = fetch) {
    this.fetcher = fetcher;
    this.base = "https://api.audius.co/v1";
  }
  async get(path, params = {}) {
    return (
      await getJson(
        this.base + path,
        { app_name: "MusicPlayer", ...params },
        this.fetcher,
      )
    ).data;
  }
  async collections(query = "", offset = 0) {
    const items = await this.get(
      query ? "/playlists/search" : "/playlists/trending",
      { ...(query ? { query } : {}), offset, limit: offset ? 30 : 10 },
    );
    return items
      .filter((v) => !v.is_private && !v.is_delete && !v.is_stream_gated)
      .map((v) => ({
        id: `audius-playlist:${v.id}`,
        title: v.playlist_name,
        artist: v.user?.name || "Audius",
        track_count: v.track_count ?? v.tracks?.length ?? 0,
        followers: v.favorite_count || 0,
        cover_url: audiusCover(v),
      }));
  }
  async tracks(id) {
    const tracks = [];
    for (let offset = 0; offset < 5000; offset += 100) {
      const page = await this.get(
        `/playlists/${encodeURIComponent(id.split(":")[1])}/tracks`,
        { offset, limit: 100 },
      );
      tracks.push(...page.map(audiusTrack).filter(Boolean));
      if (page.length < 100) return tracks;
    }
    throw Error("This playlist exceeds the 5,000-track limit.");
  }
  async search(query) {
    return (await this.get("/tracks/search", { query, limit: 40 }))
      .map(audiusTrack)
      .filter(Boolean);
  }
  async stream(track) {
    const id = encodeURIComponent(track.id.split(":")[1]);
    const info = await this.get(`/tracks/${id}`);
    if (!audiusTrack(Array.isArray(info) ? info[0] : info))
      throw Error("This track requires access or is unavailable.");
    return `${this.base}/tracks/${id}/stream?app_name=MusicPlayer`;
  }
}

export function proxyUrl(value) {
  if (!value?.trim()) return "";
  const url = new URL(value.trim());
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw Error("Use an HTTPS API address.");
  if (url.username || url.password || url.search || url.hash)
    throw Error("Use an API address without credentials or query parameters.");
  return url.href.replace(/\/$/, "");
}
function neteaseTrack(v) {
  if (!v?.id || ![0, 8].includes(v.fee ?? 0) || v.privilege?.st < 0)
    return null;
  const album = v.al || v.album || {};
  return {
    id: `netease:${v.id}`,
    title: v.name,
    artist: (v.ar || v.artists || []).map((a) => a.name).join(" / "),
    album: album.name || "",
    seconds: (v.dt || v.duration || 0) / 1000,
    local: false,
    stream: null,
    cover_url: httpsUrl(album.picUrl?.replace(/^http:/, "https:")),
  };
}
// Compatible with a user-operated NeteaseCloudMusicApi HTTPS endpoint.
export class NeteaseProxyProvider {
  id = "netease";
  name = "NetEase Music";
  constructor(base, fetcher = fetch) {
    this.base = proxyUrl(base);
    this.fetcher = fetcher;
  }
  async get(path, params) {
    const value = await getJson(this.base + path, params, this.fetcher);
    if (value.code !== 200) throw Error("NetEase request unavailable.");
    return value;
  }
  async collections(query = "", offset = 0) {
    const limit = offset ? 30 : 10;
    const value = await this.get(
      query ? "/search" : "/top/playlist",
      query
        ? { keywords: query, type: 1000, offset, limit }
        : { cat: "欧美", offset, limit },
    );
    return (value.playlists || value.result?.playlists || []).map((v) => ({
      id: `playlist:${v.id}`,
      title: v.name,
      artist: v.creator?.nickname || "NetEase Music",
      track_count: v.trackCount,
      followers: v.subscribedCount || v.bookCount || 0,
      cover_url: httpsUrl(
        (v.coverImgUrl || v.img1v1Url)?.replace(/^http:/, "https:"),
      ),
    }));
  }
  async playable(items) {
    const candidates = items.map(neteaseTrack).filter(Boolean);
    const allowed = new Set();
    for (let i = 0; i < candidates.length; i += 100) {
      const value = await this.get("/song/url/v1", {
        id: candidates
          .slice(i, i + 100)
          .map((t) => t.id.split(":")[1])
          .join(","),
        level: "standard",
      });
      for (const v of value.data || [])
        if (this.allowed(v)) allowed.add(String(v.id));
    }
    return candidates.filter((t) => allowed.has(t.id.split(":")[1]));
  }
  allowed(v) {
    return (
      v.code === 200 &&
      [0, 8].includes(v.fee ?? 0) &&
      !v.freeTrialInfo &&
      !v.freeTimeTrialPrivilege?.type &&
      httpsUrl(v.url?.replace(/^http:/, "https:"))
    );
  }
  async tracks(id) {
    const items = [];
    for (let offset = 0; offset < 5000; offset += 500) {
      const value = await this.get("/playlist/track/all", {
        id: id.split(":")[1],
        limit: 500,
        offset,
      });
      items.push(...value.songs);
      if (value.songs.length < 500) return this.playable(items);
    }
    throw Error("This playlist exceeds the 5,000-track limit.");
  }
  async search(query) {
    const value = await this.get("/cloudsearch", {
      keywords: query,
      type: 1,
      limit: 40,
    });
    return this.playable(value.result?.songs || []);
  }
  async stream(track) {
    const value = await this.get("/song/url/v1", {
      id: track.id.split(":")[1],
      level: "standard",
    });
    if (!this.allowed(value.data?.[0] || {}))
      throw Error("This track requires access or is unavailable.");
    return value.data[0].url.replace(/^http:/, "https:");
  }
}

export async function radioStations(query = "SomaFM", fetcher = fetch) {
  let error;
  for (const host of [
    "de1.api.radio-browser.info",
    "nl1.api.radio-browser.info",
  ])
    try {
      const values = await getJson(
        `https://${host}/json/stations/search`,
        {
          name: query || "SomaFM",
          hidebroken: true,
          limit: 60,
          order: "clickcount",
          reverse: true,
          codec: "MP3",
        },
        fetcher,
      );
      const names = new Set();
      return values
        .filter(
          (v) =>
            httpsUrl(v.url_resolved) &&
            v.lastcheckok === 1 &&
            v.hls === 0 &&
            !names.has(v.name.trim().toLowerCase()) &&
            names.add(v.name.trim().toLowerCase()),
        )
        .slice(0, 18)
        .map((v) => ({
          id: `radio:${v.stationuuid}`,
          title: v.name.trim(),
          artist: v.country || "Internet Radio",
          album: "Internet Radio",
          seconds: 0,
          local: false,
          stream: v.url_resolved,
          cover_url: httpsUrl(v.favicon?.replace(/^http:/, "https:")),
          followers: v.clickcount || 0,
        }));
    } catch (e) {
      error = e;
    }
  throw error || Error("Radio directory unavailable.");
}
