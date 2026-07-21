// Renderer-side helpers for building Xtream Codes stream URLs.

const enc = encodeURIComponent;

/** Playable stream URL for a VOD movie. */
export function movieUrl(account, movie) {
  const ext = movie.containerExt || 'mp4';
  return `${account.baseUrl}/movie/${enc(account.username)}/${enc(account.password)}/${movie.id}.${ext}`;
}

/** Playable stream URL for a single series episode. */
export function episodeUrl(account, episode) {
  const ext = episode.containerExt || 'mp4';
  return `${account.baseUrl}/series/${enc(account.username)}/${enc(account.password)}/${episode.id}.${ext}`;
}
