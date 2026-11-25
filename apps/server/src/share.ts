/**
 * Social preview metadata for the main link and private-table invites.
 *
 * Social scrapers do not run the SPA, so `/room/:code` is rendered on the
 * server with the host name and table state baked into the meta tags.
 */

export interface ShareMeta {
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
}

export interface RoomShareInfo {
  code: string;
  hostName: string | null;
  players: number;
  maxPlayers: number;
  turnSeconds: number;
  phase: "lobby" | "playing" | "ended";
}

const CARD_VERSION = "1";

function imageFor(origin: string, name: "main" | "invite"): string {
  return `${origin}/og/stacked-${name}.png?v=${CARD_VERSION}`;
}

export function mainShareMeta(origin: string): ShareMeta {
  return {
    title: "Stacked — play the hand you're dealt",
    description:
      "Match colours or numbers, stack draws, jump in out of turn and steal hands with Oscar's Swap. 2–8 players, no install.",
    url: `${origin}/`,
    image: imageFor(origin, "main"),
    imageAlt: "Stacked — play your hand, stack the deck.",
  };
}

export function missingRoomShareMeta(origin: string, code: string): ShareMeta {
  return {
    title: "That table has folded · Cette table n'existe plus — Stacked",
    description: `Table ${code} is no longer dealing. Start a fresh one — 2–8 players, 30s turns, guests welcome. · Cette table n'existe plus. Créez-en une nouvelle.`,
    url: `${origin}/room/${code}`,
    image: imageFor(origin, "invite"),
    imageAlt: "You're invited — a seat is waiting at a Stacked table.",
  };
}

export function roomShareMeta(room: RoomShareInfo, origin: string): ShareMeta {
  const host = room.hostName?.trim() || "A player";
  const seats = `${room.players}/${room.maxPlayers} seated`;
  const url = `${origin}/room/${room.code}`;
  const image = imageFor(origin, "invite");
  const imageAlt = `${host} invited you to a Stacked table.`;

  if (room.phase === "playing") {
    return {
      title: `${host}'s table is in play · La table de ${host} est en cours — Stacked`,
      description: `Table ${room.code} · ${seats} · ${room.turnSeconds}s turns. Jump in and take a hand. · Entrez dans le tour et prenez une main.`,
      url,
      image,
      imageAlt,
    };
  }

  if (room.phase === "ended") {
    return {
      title: `Table ${room.code} just finished · La manche est finie — Stacked`,
      description: `The hand is over, but the table is still open. Deal another round. · La manche est finie, la table reste ouverte.`,
      url,
      image,
      imageAlt,
    };
  }

  return {
    title: `${host} invited you · ${host} vous a invité — Stacked`,
    description: `Table ${room.code} · ${seats} · ${room.turnSeconds}s turns. Pull up a seat — the deck is already shuffled. · Une place vous attend.`,
    url,
    image,
    imageAlt,
  };
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setMeta(html: string, key: string, value: string): string {
  const pattern = new RegExp(
    `(<meta\\s+(?:property|name)="${escapeRegExp(key)}"\\s+content=")[^"]*(")`,
    "gi",
  );
  return html.replace(pattern, (_match, before: string, after: string) => before + escapeAttr(value) + after);
}

/** Rewrites the built index.html so scrapers see the right card. */
export function renderShareHtml(template: string, meta: ShareMeta): string {
  let html = template.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeText(meta.title)}</title>`);

  html = setMeta(html, "description", meta.description);
  html = setMeta(html, "og:title", meta.title);
  html = setMeta(html, "og:description", meta.description);
  html = setMeta(html, "og:url", meta.url);
  html = setMeta(html, "og:image", meta.image);
  html = setMeta(html, "og:image:alt", meta.imageAlt);
  html = setMeta(html, "twitter:title", meta.title);
  html = setMeta(html, "twitter:description", meta.description);
  html = setMeta(html, "twitter:image", meta.image);
  html = setMeta(html, "twitter:image:alt", meta.imageAlt);

  html = html.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/i,
    (_match, before: string, after: string) => before + escapeAttr(meta.url) + after,
  );
  if (!html.includes('rel="canonical"')) {
    html = html.replace("</head>", `  <link rel="canonical" href="${escapeAttr(meta.url)}" />\n  </head>`);
  }

  return html;
}
