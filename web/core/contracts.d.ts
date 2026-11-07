export interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  seconds?: number;
  local?: boolean;
  stream?: string | null;
  cover_url?: string | null;
  origin?: unknown;
}
export interface Collection {
  id: string;
  title: string;
  artist: string;
  track_count: number;
  followers?: number;
  folder?: string;
  tracks?: Song[];
  browserLocal?: boolean;
}
export interface Snapshot {
  track: Song | null;
  position: number;
  duration: number;
  paused: boolean;
  loading: boolean;
  repeat: boolean;
  shuffle: boolean;
  volume: number;
  lyric?: string;
  next_lyric?: string;
  error?: string | null;
}
export type Control = 'toggle' | 'stop' | 'next' | 'previous' | 'volume' | 'seek' | 'shuffle' | 'repeat';
export interface Commands {
  music_sources: {args: {}; result: {id: string; name: string}[]};
  collections: {args: {query: string; source?: string; offset?: number}; result: Collection[]};
  collection_tracks: {args: {id: string}; result: {tracks: Song[]; cached: boolean}};
  search: {args: {query: string; source?: string}; result: Song[]};
  radio_search: {args: {query: string}; result: Song[]};
  artwork: {args: {ids: string[]}; result: Record<string,string>};
  favorites: {args: {}; result: Song[]};
  toggle_favorite: {args: {id: string}; result: Song[]};
  local_playlists: {args: {}; result: Collection[]};
  import_playlist: {args: {}; result: Collection | null};
  play: {args: {queue: string[]; index: number}; result: void};
  control: {args: {action: Control; value?: number | null}; result: void};
  snapshot: {args: {}; result: Snapshot};
  window_action: {args: {action: 'drag' | 'close' | 'compact' | 'restore' | 'skin-ipod' | 'skin-carthing' | 'skin-walkman'}; result: void};
}
export type BackendInvoke = <K extends keyof Commands>(command: K, args?: Commands[K]['args']) => Promise<Commands[K]['result']>;

// Runtime-specific streams and files are resolved behind this provider contract.
export interface MusicProvider {
  id: string;
  name: string;
  collections(query?: string, offset?: number): Promise<Collection[]>;
  tracks(id: string): Promise<Song[]>;
  search(query: string): Promise<Song[]>;
  stream(track: Song): Promise<string>;
}
