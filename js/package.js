/**
 * Site package format (*.inspection.json).
 *
 * A site package is the single file people exchange: the inspection items, the
 * floor-plan layout, the site plan (image + hotspots) and, optionally, the user's
 * progress and notes. This module validates untrusted input and returns a clean,
 * fully-populated copy. It throws an Error with a readable (French) message when
 * the file is not usable.
 */

export const SCHEMA_VERSION = 1;
export const DEFAULT_FOOTPRINT = { width: 10, height: 10 };
export const DEFAULT_PLAN_SIZE = { width: 800, height: 600 };

const ACTION_COLORS = ['rouge', 'orange', 'violet', 'bleu'];
const VALID_PROGRESS = ['todo', 'planned', 'done'];
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

const fail = (message) => {
  throw new Error(message);
};

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Views build HTML with template strings, so every string coming from a file is
// made inert here. '&' is deliberately NOT escaped: that keeps the operation
// idempotent (export -> import -> export never double-escapes) and it is safe,
// because without '<' the browser cannot open a tag.
const HTML_UNSAFE = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const inert = (str) => str.replace(/[<>"']/g, (c) => HTML_UNSAFE[c]);
const text = (v, fallback = '') => inert(typeof v === 'string' ? v : v == null ? fallback : String(v));
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,200}$/;
const safeId = (v, where) => {
  const id = typeof v === 'string' ? v.trim() : '';
  if (!id) fail(`${where} : identifiant (« id ») manquant.`);
  if (!SAFE_ID.test(id)) fail(`${where} : identifiant invalide (« ${inert(id.slice(0, 40))} »). Lettres, chiffres et _ . : - uniquement.`);
  return id;
};
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const positive = (v) => finite(v) && v > 0;

function bulletsFromText(raw) {
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => ({
      text: line.trim().replace(/^[•-]\s*/, ''),
      level: line.length - line.trimStart().length >= 2 ? 1 : 0,
      raw: line,
    }));
}

function normalizeItem(src, index, colorKeys, seenIds, where) {
  if (!isObject(src)) fail(`${where} n°${index + 1} : entrée invalide.`);
  const id = safeId(src.id, `${where} n°${index + 1}`);
  if (seenIds.has(id)) fail(`Identifiant en double : « ${id} ».`);
  seenIds.add(id);

  const colorKey = colorKeys.includes(src.colorKey) ? src.colorKey : 'inconnu';
  const rawObservation = text(src.rawObservation);
  const bullets = Array.isArray(src.bullets)
    ? src.bullets
        .filter((b) => isObject(b) && typeof b.text === 'string')
        .map((b) => ({ text: b.text, level: b.level === 1 ? 1 : 0, raw: text(b.raw, b.text) }))
    : bulletsFromText(rawObservation);

  return {
    id,
    row: finite(src.row) ? src.row : index + 2,
    zone: text(src.zone, 'Sans zone'),
    article: text(src.article, id),
    condition: text(src.condition),
    colorKey,
    urgency: text(src.urgency, '—'),
    trade: text(src.trade, '—'),
    costEstimate: text(src.costEstimate, '—'),
    status: text(src.status),
    rawObservation,
    bullets,
    page: finite(src.page) ? src.page : src.page == null ? null : text(src.page),
    isActionRequired: typeof src.isActionRequired === 'boolean' ? src.isActionRequired : ACTION_COLORS.includes(colorKey),
    isExterior: Boolean(src.isExterior),
  };
}

function normalizeRect(src, index, label, knownItemIds) {
  if (!isObject(src)) fail(`${label} n°${index + 1} : entrée invalide.`);
  const id = safeId(src.id, `${label} n°${index + 1}`);
  if (![src.x, src.y].every(finite) || ![src.w, src.h].every(positive)) {
    fail(`${label} « ${text(src.name, id)} » : position ou dimensions invalides.`);
  }
  const rect = {
    id,
    name: text(src.name, id),
    x: src.x,
    y: src.y,
    w: src.w,
    h: src.h,
    itemIds: Array.isArray(src.itemIds) ? src.itemIds.filter((i) => typeof i === 'string' && knownItemIds.has(i)) : [],
  };
  if (src.isBackground === true) rect.isBackground = true;
  return rect;
}

function normalizeList(list, label, build) {
  if (list == null) return [];
  if (!Array.isArray(list)) fail(`« ${label} » doit être une liste.`);
  const seen = new Set();
  return list.map((entry, i) => {
    const out = build(entry, i);
    if (seen.has(out.id)) fail(`${label} : identifiant en double « ${out.id} ».`);
    seen.add(out.id);
    return out;
  });
}

/**
 * @param {unknown} pkg Parsed JSON (untrusted).
 * @param {string[]} colorKeys Valid status colour keys.
 */
export function normalizePackage(pkg, colorKeys) {
  if (!isObject(pkg)) fail('Le fichier n’est pas un site valide.');
  if (pkg.schema === undefined) fail('Fichier non reconnu : le champ « schema » est manquant.');
  if (!Number.isInteger(pkg.schema) || pkg.schema < 1) fail('Version de fichier invalide.');
  if (pkg.schema > SCHEMA_VERSION) {
    fail('Ce fichier a été créé par une version plus récente de l’application.');
  }
  if (!Array.isArray(pkg.items)) fail('Le fichier ne contient pas de liste d’éléments (« items »).');

  const seenIds = new Set();
  const items = pkg.items.map((it, i) => normalizeItem(it, i, colorKeys, seenIds, 'Élément'));
  const adminSrc = pkg.adminItems == null ? [] : pkg.adminItems;
  if (!Array.isArray(adminSrc)) fail('« adminItems » doit être une liste.');
  const adminItems = adminSrc.map((it, i) => normalizeItem(it, i, colorKeys, seenIds, 'Élément administratif'));

  const legendSrc = isObject(pkg.legend) ? pkg.legend : {};
  const legend = {
    entries: (Array.isArray(legendSrc.entries) ? legendSrc.entries : []).filter(isObject).map((e) => ({
      symbol: text(e.symbol),
      colorKey: colorKeys.includes(e.colorKey) ? e.colorKey : 'inconnu',
      description: text(e.description),
      urgency: text(e.urgency, '—'),
      status: text(e.status),
      baseCost: text(e.baseCost, '—'),
      count: finite(e.count) ? e.count : 0,
    })),
    totalArticles: finite(legendSrc.totalArticles) ? legendSrc.totalArticles : items.length,
  };

  const knownItemIds = seenIds;

  let levels = normalizeList(pkg.levels, 'Niveau', (lv, i) => {
    if (!isObject(lv)) fail(`Niveau n°${i + 1} : entrée invalide.`);
    const id = safeId(lv.id, `Niveau n°${i + 1}`);
    const fp = isObject(lv.footprint) ? lv.footprint : {};
    return {
      id,
      name: text(lv.name, id),
      footprint: {
        width: positive(fp.width) ? fp.width : DEFAULT_FOOTPRINT.width,
        height: positive(fp.height) ? fp.height : DEFAULT_FOOTPRINT.height,
      },
      rooms: normalizeList(lv.rooms, `Pièces du niveau « ${id} »`, (r, j) => normalizeRect(r, j, 'Pièce', knownItemIds)),
    };
  });
  if (levels.length === 0) {
    levels = [{ id: 'niveau-1', name: 'Niveau 1', footprint: { ...DEFAULT_FOOTPRINT }, rooms: [] }];
  }

  const planSrc = isObject(pkg.sitePlan) ? pkg.sitePlan : {};
  if (planSrc.imageDataUrl != null && !IMAGE_DATA_URL.test(planSrc.imageDataUrl)) {
    fail('L’image du plan du site doit être une image PNG, JPEG, GIF, WebP ou SVG intégrée (data URL base64).');
  }
  const sitePlan = {
    imageDataUrl: planSrc.imageDataUrl || null,
    width: positive(planSrc.width) ? planSrc.width : DEFAULT_PLAN_SIZE.width,
    height: positive(planSrc.height) ? planSrc.height : DEFAULT_PLAN_SIZE.height,
    hotspots: normalizeList(planSrc.hotspots, 'Zones du plan', (s, i) => normalizeRect(s, i, 'Zone', knownItemIds)),
  };

  const userSrc = isObject(pkg.userState) ? pkg.userState : {};
  const userProgress = {};
  if (isObject(userSrc.userProgress)) {
    for (const [id, entry] of Object.entries(userSrc.userProgress)) {
      if (!knownItemIds.has(id) || !isObject(entry)) continue;
      userProgress[id] = {
        progress: VALID_PROGRESS.includes(entry.progress) ? entry.progress : 'todo',
        note: text(entry.note),
      };
    }
  }
  const deletedItemIds = Array.isArray(userSrc.deletedItemIds)
    ? userSrc.deletedItemIds.filter((id) => typeof id === 'string' && knownItemIds.has(id))
    : [];

  const siteSrc = isObject(pkg.site) ? pkg.site : {};
  const site = { name: text(siteSrc.name, 'Site sans nom').trim().slice(0, 120) || 'Site sans nom' };

  return {
    schema: SCHEMA_VERSION,
    site,
    items,
    adminItems,
    legend,
    levels,
    sitePlan,
    userState: { userProgress, deletedItemIds },
  };
}
