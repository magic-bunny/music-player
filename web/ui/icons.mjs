export const paths = {
  gear: '<path d="M9.469 5.046L10.350 2.644L13.650 2.644L14.531 5.046A7.4 7.4 0 0 116.757 6.331L19.277 5.894L20.927 8.751L19.288 10.715A7.4 7.4 0 0 119.288 13.285L20.927 15.249L19.277 18.106L16.757 17.669A7.4 7.4 0 0 114.531 18.954L13.650 21.356L10.350 21.356L9.469 18.954A7.4 7.4 0 0 17.243 17.669L4.723 18.106L3.073 15.249L4.712 13.285A7.4 7.4 0 0 14.712 10.715L3.073 8.751L4.723 5.894L7.243 6.331A7.4 7.4 0 0 19.469 5.046Z"/><circle cx="12" cy="12" r="3.2"/>',
  muted: '<path d="M11 5 6 9H3v6h3l5 4ZM16 9l6 6m0-6-6 6"/>',
  previous:
    '<path d="M4 4h3v16H4zM20 4 7 12l13 8Z" fill="currentColor" stroke="none"/>',
  restore: '<path d="M4 4h9v9H4zM8 8h9v9H8z"/>',
  next: '<path d="M17 4h3v16h-3zM4 4l13 8-13 8Z" fill="currentColor" stroke="none"/>',
  play: '<path d="M7 3 22 12 7 21Z" fill="currentColor" stroke="none"/>',
  pause:
    '<path d="M6 3h5v18H6zM16 3h5v18h-5z" fill="currentColor" stroke="none"/>',
  shuffle:
    '<path d="M2 6h2c5 0 8 12 13 12h5M2 18h2c2 0 4-2 5-4m4-4c1-2 3-4 5-4h4"/><path d="m18 2 4 4-4 4m0 4 4 4-4 4"/>',
  heart:
    '<path d="M12 21 3.4 12.6C-2 7.2 5.3.2 12 6.7 18.7.2 26 7.2 20.6 12.6Z"/>',
  home: '<path d="m3 10 9-7 9 7v11h-6v-8H9v8H3Z"/>',
  library: '<path d="M3 3v18M9 3v18M15 4l6 16"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  back: '<path d="m10 5-7 7 7 7M3 12h12a6 6 0 0 1 6 6"/>',
  more: '<circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="20" cy="12" r="1.5" fill="currentColor"/>',
  repeat:
    '<path d="M4 10V8a2 2 0 0 1 2-2h14m-4-4 4 4-4 4M20 14v2a2 2 0 0 1-2 2H4m4-4-4 4 4 4"/>',
  volume:
    '<path d="M11 5 6 9H3v6h3l5 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  music:
    '<path d="M9 18V6l11-3v12M9 9l11-3"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="15" rx="3" ry="2"/>',
  radio:
    '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="m5 7 14-5M5 11h14"/><circle cx="7" cy="16" r="2"/><path d="M13 15h6m-6 3h6"/>',
  lyrics: '<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>',
  left: '<path d="m15 4-8 8 8 8"/>',
  right: '<path d="m9 4 8 8-8 8"/>',
  equalizer: '<path d="M4 15v6M10 4v17M16 10v11M22 7v14"/>',
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.music}</svg>`;
