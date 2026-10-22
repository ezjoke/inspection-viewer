/**
 * Inspection Viewer State Management
 * Handles data loading, filter state, item done/planned tracking,
 * floor plan layout, site plan hotspots, undo/redo, and persistence.
 */

import { normalizePackage, SCHEMA_VERSION, DEFAULT_PLAN_SIZE } from './package.js';

const SITE_KEY = 'INSPECTION_VIEWER_SITE';
const STATE_KEY = 'INSPECTION_VIEWER_STATE';
const STORAGE_VERSION = 3;

function emptyFilters() {
  return {
    search: '',
    colorKeys: new Set(),
    urgencies: new Set(),
    trades: new Set(),
    zones: new Set(),
    progress: new Set(),
    onlyActionRequired: false,
    hideDone: false,
    hideEmpty: false,
  };
}

export const SEVERITY_ORDER = ['rouge', 'violet', 'bleu', 'orange', 'vert', 'inconnu'];

export const STATUS_META = {
  rouge: {
    label: 'À corriger — prioritaire',
    shortLabel: 'Prioritaire',
    badgeClass: 'badge-rouge',
    color: '#FFC7CE',
    textColor: '#9C0006',
    borderColor: '#d9534f',
    icon: '⚠️',
    severityRank: 1,
  },
  violet: {
    label: 'Non conforme BNQ',
    shortLabel: 'Non conforme BNQ',
    badgeClass: 'badge-violet',
    color: '#E4C7F0',
    textColor: '#4a154b',
    borderColor: '#9b59b6',
    icon: '⚡',
    severityRank: 2,
  },
  bleu: {
    label: 'Requis — non inspecté',
    shortLabel: 'Requis',
    badgeClass: 'badge-bleu',
    color: '#BDD7EE',
    textColor: '#002060',
    borderColor: '#3498db',
    icon: '🔍',
    severityRank: 3,
  },
  orange: {
    label: 'À corriger — préventif',
    shortLabel: 'Préventif',
    badgeClass: 'badge-orange',
    color: '#FFD9A0',
    textColor: '#704200',
    borderColor: '#f39c12',
    icon: '🔧',
    severityRank: 4,
  },
  vert: {
    label: 'Conforme',
    shortLabel: 'Conforme',
    badgeClass: 'badge-vert',
    color: '#C6EFCE',
    textColor: '#1e4620',
    borderColor: '#27ae60',
    icon: '✓',
    severityRank: 5,
  },
  inconnu: {
    label: 'Information',
    shortLabel: 'Information',
    badgeClass: 'badge-inconnu',
    color: '#E8E8E8',
    textColor: '#333333',
    borderColor: '#95a5a6',
    icon: 'ℹ️',
    severityRank: 6,
  },
};

export const ITEM_PROGRESS = {
  TODO: 'todo',         // Non commencé
  PLANNED: 'planned',   // Planifié
  DONE: 'done',         // Terminé
};

export class AppState {
  constructor() {
    this.items = [];
    this.adminItems = [];
    this.legend = null;
    this.zones = [];
    this.trades = [];

    // Current navigation view
    this.currentView = 'dashboard';

    // Filters
    this.filters = emptyFilters();

    // Deleted/hidden items set
    this.deletedItemIds = new Set();

    // User progress state: { [itemId]: { progress: 'todo'|'planned'|'done', note: string } }
    this.userProgress = {};

    // Site data: empty until loadSite() is called (demo, file, or saved in this browser)
    this.site = null;
    this.sitePlan = { imageDataUrl: null, width: DEFAULT_PLAN_SIZE.width, height: DEFAULT_PLAN_SIZE.height };
    this.currentLevelId = null;
    this.floorPlans = { levels: [] };
    this.sitePlanHotspots = [];

    // Undo / Redo stacks for plan edits
    this.undoStack = [];
    this.redoStack = [];

    // Selected item for drawer
    this.selectedItemId = null;

    // Selected room or hotspot for inspector
    this.selectedRoomId = null;
    this.selectedHotspotId = null;

    // Listeners
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(eventType, payload) {
    for (const listener of this.listeners) {
      try {
        listener(eventType, payload, this);
      } catch (err) {
        console.error('Error in state listener:', err);
      }
    }
  }

  get hasSite() {
    return this.site !== null;
  }

  clearSiteData() {
    this.site = null;
    this.items = [];
    this.adminItems = [];
    this.legend = { entries: [], totalArticles: 0 };
    this.zones = [];
    this.trades = [];
    this.sitePlan = { imageDataUrl: null, width: DEFAULT_PLAN_SIZE.width, height: DEFAULT_PLAN_SIZE.height };
    this.floorPlans = { levels: [] };
    this.sitePlanHotspots = [];
    this.userProgress = {};
    this.deletedItemIds = new Set();
    this.currentLevelId = null;
    this.selectedItemId = null;
    this.selectedRoomId = null;
    this.selectedHotspotId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.filters = emptyFilters();
  }

  /**
   * Load a site package (already parsed JSON). Throws a readable Error when invalid.
   * The previous site is only replaced once validation succeeded.
   */
  loadSite(rawPackage) {
    const pkg = normalizePackage(rawPackage, SEVERITY_ORDER);

    this.clearSiteData();
    this.site = pkg.site;
    this.items = pkg.items;
    this.adminItems = pkg.adminItems;
    this.legend = pkg.legend;
    this.zones = [...new Set(pkg.items.map(i => i.zone))].sort((a, b) => a.localeCompare(b, 'fr'));
    this.trades = [...new Set(pkg.items.map(i => i.trade).filter(t => t && t !== '—'))].sort((a, b) => a.localeCompare(b, 'fr'));
    this.sitePlan = {
      imageDataUrl: pkg.sitePlan.imageDataUrl,
      width: pkg.sitePlan.width,
      height: pkg.sitePlan.height,
    };
    this.floorPlans = { levels: pkg.levels };
    this.sitePlanHotspots = pkg.sitePlan.hotspots;
    this.userProgress = pkg.userState.userProgress;
    this.deletedItemIds = new Set(pkg.userState.deletedItemIds);
    this.currentLevelId = pkg.levels[0].id;

    this.persistSite();
    this.saveToStorage();
    this.notify('DATA_LOADED');
  }

  /** Restore the site saved in this browser. Returns true when one was found. */
  restoreFromStorage() {
    try {
      const rawSite = localStorage.getItem(SITE_KEY);
      if (!rawSite) return false;
      const stored = JSON.parse(rawSite);
      if (stored.version !== STORAGE_VERSION) {
        console.warn('Unknown storage version, ignoring saved site:', stored.version);
        return false;
      }
      const rawState = localStorage.getItem(STATE_KEY);
      const state = rawState ? JSON.parse(rawState) : null;
      const pkg = stored.package;
      if (state && state.version === STORAGE_VERSION) {
        pkg.levels = state.floorPlans.levels;
        pkg.sitePlan.hotspots = state.sitePlanHotspots;
        pkg.userState = { userProgress: state.userProgress, deletedItemIds: state.deletedItemIds };
      }
      this.loadSite(pkg);
      return true;
    } catch (e) {
      console.error('Failed to restore saved site:', e);
      return false;
    }
  }

  /** Static part of the site (items, image): written when a site is loaded. */
  persistSite() {
    try {
      const pkg = this.exportSitePackage({ includeProgress: false, includePlanImage: true });
      localStorage.setItem(SITE_KEY, JSON.stringify({ version: STORAGE_VERSION, package: pkg }));
    } catch (e) {
      console.error('Failed to save site to localStorage:', e);
      this.notify('STORAGE_ERROR', { error: e });
    }
  }

  /** Editable part (layout, progress): written after every change. */
  saveToStorage() {
    if (!this.site) return;
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        version: STORAGE_VERSION,
        savedAt: new Date().toISOString(),
        userProgress: this.userProgress,
        floorPlans: this.floorPlans,
        sitePlanHotspots: this.sitePlanHotspots,
        deletedItemIds: Array.from(this.deletedItemIds),
      }));
    } catch (e) {
      console.error('Failed to save state to localStorage:', e);
      this.notify('STORAGE_ERROR', { error: e });
    }
  }

  pushHistorySnapshot(actionName = 'Edit') {
    const snapshot = {
      actionName,
      floorPlans: JSON.parse(JSON.stringify(this.floorPlans)),
      sitePlanHotspots: JSON.parse(JSON.stringify(this.sitePlanHotspots)),
    };
    this.undoStack.push(snapshot);
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack = [];
    this.notify('HISTORY_CHANGED');
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    const current = {
      floorPlans: JSON.parse(JSON.stringify(this.floorPlans)),
      sitePlanHotspots: JSON.parse(JSON.stringify(this.sitePlanHotspots)),
    };
    this.redoStack.push(current);
    const prev = this.undoStack.pop();
    this.floorPlans = prev.floorPlans;
    this.sitePlanHotspots = prev.sitePlanHotspots;
    this.saveToStorage();
    this.notify('PLAN_UPDATED');
    this.notify('HISTORY_CHANGED');
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    const current = {
      floorPlans: JSON.parse(JSON.stringify(this.floorPlans)),
      sitePlanHotspots: JSON.parse(JSON.stringify(this.sitePlanHotspots)),
    };
    this.undoStack.push(current);
    const next = this.redoStack.pop();
    this.floorPlans = next.floorPlans;
    this.sitePlanHotspots = next.sitePlanHotspots;
    this.saveToStorage();
    this.notify('PLAN_UPDATED');
    this.notify('HISTORY_CHANGED');
    return true;
  }

  getItemById(id) {
    return this.items.find(i => i.id === id) || this.adminItems.find(i => i.id === id);
  }

  getItemProgress(id) {
    return this.userProgress[id]?.progress || ITEM_PROGRESS.TODO;
  }

  setItemProgress(id, progress) {
    if (!this.userProgress[id]) {
      this.userProgress[id] = { progress, note: '' };
    } else {
      this.userProgress[id].progress = progress;
    }
    this.saveToStorage();
    this.notify('ITEM_PROGRESS_CHANGED', { id, progress });
  }

  setItemNote(id, note) {
    if (!this.userProgress[id]) {
      this.userProgress[id] = { progress: ITEM_PROGRESS.TODO, note };
    } else {
      this.userProgress[id].note = note;
    }
    this.saveToStorage();
    this.notify('ITEM_NOTE_CHANGED', { id, note });
  }

  deleteItem(itemId) {
    this.pushHistorySnapshot('Supprimer élément');
    this.deletedItemIds.add(itemId);
    // Remove from any site hotspots or rooms
    for (const spot of this.sitePlanHotspots) {
      if (spot.itemIds) spot.itemIds = spot.itemIds.filter(id => id !== itemId);
    }
    for (const lvl of this.floorPlans.levels) {
      for (const room of lvl.rooms) {
        if (room.itemIds) room.itemIds = room.itemIds.filter(id => id !== itemId);
      }
    }
    this.saveToStorage();
    this.notify('ITEM_DELETED', { itemId });
  }

  restoreItem(itemId) {
    this.pushHistorySnapshot('Restaurer élément');
    this.deletedItemIds.delete(itemId);
    this.saveToStorage();
    this.notify('ITEM_RESTORED', { itemId });
  }

  restoreAllDeletedItems() {
    this.pushHistorySnapshot('Restaurer tous les éléments');
    this.deletedItemIds.clear();
    this.saveToStorage();
    this.notify('ITEM_RESTORED');
  }

  isItemDeleted(itemId) {
    return this.deletedItemIds.has(itemId);
  }

  getItemSiteHotspot(itemId) {
    return this.sitePlanHotspots.find(spot => (spot.itemIds || []).includes(itemId)) || null;
  }

  setItemSiteHotspot(itemId, newHotspotId) {
    this.pushHistorySnapshot('Changer emplacement extérieur');
    // Remove from all site hotspots
    for (const spot of this.sitePlanHotspots) {
      if (spot.itemIds) {
        spot.itemIds = spot.itemIds.filter(id => id !== itemId);
      }
    }
    // Add to target if valid
    if (newHotspotId && newHotspotId !== '__unassign__') {
      const target = this.sitePlanHotspots.find(s => s.id === newHotspotId);
      if (target) {
        if (!target.itemIds) target.itemIds = [];
        target.itemIds.push(itemId);
      }
    }
    this.saveToStorage();
    this.notify('PLAN_UPDATED');
  }

  getItemRoom(itemId) {
    for (const lvl of this.floorPlans.levels) {
      for (const room of lvl.rooms) {
        if ((room.itemIds || []).includes(itemId)) {
          return { level: lvl, room };
        }
      }
    }
    return null;
  }

  setItemRoom(itemId, newRoomId) {
    this.pushHistorySnapshot('Changer pièce intérieure');
    // Remove from all rooms across all levels
    for (const lvl of this.floorPlans.levels) {
      for (const room of lvl.rooms) {
        if (room.itemIds) {
          room.itemIds = room.itemIds.filter(id => id !== itemId);
        }
      }
    }
    // Add to target room if valid
    if (newRoomId && newRoomId !== '__unassign__') {
      for (const lvl of this.floorPlans.levels) {
        const target = lvl.rooms.find(r => r.id === newRoomId);
        if (target) {
          if (!target.itemIds) target.itemIds = [];
          target.itemIds.push(itemId);
          break;
        }
      }
    }
    this.saveToStorage();
    this.notify('PLAN_UPDATED');
  }

  getWorstSeverity(itemIds, includeDone = false) {
    if (!itemIds || itemIds.length === 0) return null;
    let worstRank = 999;
    let worstKey = null;

    for (const id of itemIds) {
      const item = this.getItemById(id);
      if (!item) continue;
      const progress = this.getItemProgress(id);
      if (!includeDone && progress === ITEM_PROGRESS.DONE) continue;

      const meta = STATUS_META[item.colorKey];
      const rank = meta?.severityRank || 99;
      if (rank < worstRank) {
        worstRank = rank;
        worstKey = item.colorKey;
      }
    }
    return worstKey;
  }

  getSummaryCounts() {
    const total = this.items.length;
    const counts = {
      total,
      done: 0,
      planned: 0,
      todo: 0,
      actionRequired: 0,
      actionRemaining: 0,
      byColor: {},
      byColorRemaining: {},
    };

    for (const key of SEVERITY_ORDER) {
      counts.byColor[key] = 0;
      counts.byColorRemaining[key] = 0;
    }

    for (const item of this.items) {
      if (this.deletedItemIds.has(item.id)) continue;
      const prog = this.getItemProgress(item.id);
      const isDone = prog === ITEM_PROGRESS.DONE;
      const isPlanned = prog === ITEM_PROGRESS.PLANNED;

      if (isDone) counts.done++;
      else if (isPlanned) counts.planned++;
      else counts.todo++;

      counts.byColor[item.colorKey] = (counts.byColor[item.colorKey] || 0) + 1;

      if (!isDone) {
        counts.byColorRemaining[item.colorKey] = (counts.byColorRemaining[item.colorKey] || 0) + 1;
      }

      if (item.isActionRequired) {
        counts.actionRequired++;
        if (!isDone) counts.actionRemaining++;
      }
    }

    return counts;
  }

  getFilteredItems() {
    return this.items.filter(item => {
      if (this.deletedItemIds.has(item.id)) return false;

      if (this.filters.hideEmpty) {
        const obs = (item.rawObservation || '').trim();
        if (!obs || obs === '—' || (item.bullets && item.bullets.length === 0)) {
          return false;
        }
      }

      const prog = this.getItemProgress(item.id);
      if (this.filters.hideDone && prog === ITEM_PROGRESS.DONE) return false;
      if (this.filters.progress.size > 0 && !this.filters.progress.has(prog)) return false;

      if (this.filters.onlyActionRequired && !item.isActionRequired) return false;
      if (this.filters.colorKeys.size > 0 && !this.filters.colorKeys.has(item.colorKey)) return false;
      if (this.filters.urgencies.size > 0 && !this.filters.urgencies.has(item.urgency)) return false;
      if (this.filters.trades.size > 0 && !this.filters.trades.has(item.trade)) return false;
      if (this.filters.zones.size > 0 && !this.filters.zones.has(item.zone)) return false;

      if (this.filters.search.trim()) {
        const q = this.filters.search.toLowerCase().trim();
        const inArticle = item.article.toLowerCase().includes(q);
        const inZone = item.zone.toLowerCase().includes(q);
        const inTrade = item.trade.toLowerCase().includes(q);
        const inStatus = item.status.toLowerCase().includes(q);
        const inObs = item.rawObservation.toLowerCase().includes(q);
        const inCost = (item.costEstimate || '').toLowerCase().includes(q);
        if (!inArticle && !inZone && !inTrade && !inStatus && !inObs && !inCost) return false;
      }

      return true;
    });
  }

  getSortedFilteredItems() {
    const filtered = this.getFilteredItems();
    return filtered.sort((a, b) => {
      const progA = this.getItemProgress(a.id) === ITEM_PROGRESS.DONE ? 1 : 0;
      const progB = this.getItemProgress(b.id) === ITEM_PROGRESS.DONE ? 1 : 0;
      if (progA !== progB) return progA - progB;

      const rankA = STATUS_META[a.colorKey]?.severityRank || 99;
      const rankB = STATUS_META[b.colorKey]?.severityRank || 99;
      if (rankA !== rankB) return rankA - rankB;

      return a.row - b.row;
    });
  }

  getAssignedItemIds() {
    const assigned = new Set();
    for (const lvl of this.floorPlans.levels) {
      for (const room of lvl.rooms) {
        for (const id of room.itemIds || []) {
          assigned.add(id);
        }
      }
    }
    for (const spot of this.sitePlanHotspots) {
      for (const id of spot.itemIds || []) {
        assigned.add(id);
      }
    }
    return assigned;
  }

  getUnassignedItems(filterExterior = false) {
    const assigned = this.getAssignedItemIds();
    return this.items.filter(item => {
      if (assigned.has(item.id)) return false;
      if (filterExterior && item.isExterior) return false;
      return true;
    });
  }

  /** Serialise the current site as a shareable package. */
  exportSitePackage({ includeProgress = true, includePlanImage = true } = {}) {
    if (!this.site) throw new Error('Aucun site chargé.');
    return {
      schema: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      site: { ...this.site },
      items: this.items,
      adminItems: this.adminItems,
      legend: this.legend,
      levels: this.floorPlans.levels,
      sitePlan: {
        imageDataUrl: includePlanImage ? this.sitePlan.imageDataUrl : null,
        width: this.sitePlan.width,
        height: this.sitePlan.height,
        hotspots: this.sitePlanHotspots,
      },
      userState: includeProgress
        ? { userProgress: this.userProgress, deletedItemIds: Array.from(this.deletedItemIds) }
        : { userProgress: {}, deletedItemIds: [] },
    };
  }

  /** Clear progress and hidden items, keep the site itself. */
  resetProgress() {
    this.pushHistorySnapshot('Réinitialiser l’avancement');
    this.userProgress = {};
    this.deletedItemIds.clear();
    this.saveToStorage();
    this.notify('DATA_IMPORTED');
  }

  /** Remove the site from this browser and return to the start screen. */
  closeSite() {
    localStorage.removeItem(SITE_KEY);
    localStorage.removeItem(STATE_KEY);
    this.clearSiteData();
    this.notify('SITE_CLOSED');
  }
}

export const appState = new AppState();
