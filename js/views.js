/**
 * Views rendering module for Inspection Viewer
 */

import { appState, STATUS_META, SEVERITY_ORDER, ITEM_PROGRESS } from './state.js';
import { PlanCanvas } from './canvas.js';

export class ViewsManager {
  constructor(appContainer) {
    this.container = appContainer;
    this.canvasInstance = null;
    this.activeDrawerItemId = null;
    this.activeAssignTarget = null; // { type: 'room'|'hotspot', levelId, targetId, targetName }
  }

  // Helper to render status badge
  renderBadge(colorKey, statusText = null) {
    const meta = STATUS_META[colorKey] || STATUS_META.inconnu;
    const label = statusText || meta.label;
    return `
      <span class="badge ${meta.badgeClass}" title="${label}">
        <span class="badge-icon">${meta.icon}</span>
        <span class="badge-text">${label}</span>
      </span>
    `;
  }

  // Helper to render progress pill
  renderProgressPill(itemId) {
    const prog = appState.getItemProgress(itemId);
    let label = 'À faire';
    let icon = '○';
    let cls = 'pill-todo';
    if (prog === ITEM_PROGRESS.DONE) {
      label = 'Terminé';
      icon = '✓';
      cls = 'pill-done';
    } else if (prog === ITEM_PROGRESS.PLANNED) {
      label = 'Planifié';
      icon = '◷';
      cls = 'pill-planned';
    }

    return `
      <div class="progress-dropdown" data-item-id="${itemId}">
        <button type="button" class="progress-pill ${cls}" title="Changer le statut">
          <span class="pill-icon">${icon}</span>
          <span class="pill-label">${label}</span>
        </button>
      </div>
    `;
  }

  // Helper to render structured bullet items
  renderBulletsHtml(bullets, rawObs) {
    if (bullets && bullets.length > 0) {
      let html = '<ul class="obs-bullet-list">';
      for (const b of bullets) {
        const cls = b.level > 0 ? 'obs-bullet-sub' : 'obs-bullet-main';
        html += `<li class="${cls}">${this.formatBulletText(b.text)}</li>`;
      }
      html += '</ul>';
      return html;
    }
    // Fallback if no structured bullets
    return `<div class="obs-raw-text">${rawObs || '—'}</div>`;
  }

  formatBulletText(text) {
    if (!text) return '';
    // Highlight important keywords or references
    return text
      .replace(/(\b(?:SCHL|APCHQ|BNQ|CMEQ|CMMTQ)\b)/g, '<strong>$1</strong>')
      .replace(/(Cliquez ici[^\.]*)/gi, '<em class="text-muted">$1</em>');
  }

  // ==========================================
  // VIEW: DASHBOARD
  // ==========================================
  renderDashboard(targetEl) {
    const counts = appState.getSummaryCounts();
    const sortedItems = appState.getSortedFilteredItems();

    const colorTile = (key) => {
      const meta = STATUS_META[key];
      const total = counts.byColor[key] || 0;
      const remaining = counts.byColorRemaining[key] || 0;
      const isSelected = appState.filters.colorKeys.has(key);

      return `
        <div class="summary-tile ${meta.badgeClass} ${isSelected ? 'active' : ''}" data-color-key="${key}">
          <div class="tile-header">
            <span class="tile-icon">${meta.icon}</span>
            <span class="tile-title">${meta.shortLabel}</span>
          </div>
          <div class="tile-count-row">
            <span class="tile-main-count">${remaining}</span>
            <span class="tile-sub-count">/ ${total}</span>
          </div>
          <div class="tile-footer">
            ${total - remaining > 0 ? `<span class="tile-done-hint">${total - remaining} réglé(s)</span>` : '<span>à traiter</span>'}
          </div>
        </div>
      `;
    };

    targetEl.innerHTML = `
      <div class="dashboard-view">
        <div class="summary-tiles-container">
          ${SEVERITY_ORDER.map(key => colorTile(key)).join('')}
        </div>

        <div class="filter-bar">
          <div class="search-input-wrapper">
            <span class="search-icon">🔍</span>
            <input type="text" class="search-input" id="dashboard-search" placeholder="Rechercher (mot-clé, article, métier, texte...)" value="${appState.filters.search}">
            ${appState.filters.search ? `<button type="button" class="btn-clear-search" id="clear-search-btn">×</button>` : ''}
          </div>

          <div class="filter-actions">
            <label class="filter-checkbox-label" title="Masquer les éléments terminés">
              <input type="checkbox" id="filter-hide-done" ${appState.filters.hideDone ? 'checked' : ''}>
              Masquer terminés
            </label>
            <label class="filter-checkbox-label" title="Masquer les éléments sans observation textuelle (vides / informatifs)">
              <input type="checkbox" id="filter-hide-empty" ${appState.filters.hideEmpty ? 'checked' : ''}>
              Masquer sans observation
            </label>
            <label class="filter-checkbox-label" title="Afficher uniquement les correctifs et anomalies requises">
              <input type="checkbox" id="filter-action-only" ${appState.filters.onlyActionRequired ? 'checked' : ''}>
              Actions requises uniquement
            </label>
            ${this.hasActiveFilters() ? `<button type="button" class="btn btn-sm btn-outline" id="btn-reset-filters">Réinitialiser filtres</button>` : ''}
          </div>
        </div>

        <div class="active-filter-chips">
          ${this.renderActiveFilterChips()}
        </div>

        <div class="items-list-header">
          <div class="items-count-label">
            <strong>${sortedItems.length}</strong> observation(s) affichée(s) sur ${appState.items.length - appState.deletedItemIds.size}
            ${appState.deletedItemIds.size > 0 ? `<span class="text-muted small">(${appState.deletedItemIds.size} supprimé(s))</span>` : ''}
          </div>
          <div class="quick-view-actions">
            <button type="button" class="btn btn-sm btn-ghost" id="btn-print-summary" title="Imprimer la sélection">
              🖨️ Imprimer la liste
            </button>
          </div>
        </div>

        <div class="items-card-list">
          ${sortedItems.length === 0 ? `
            <div class="empty-state">
              <p>Aucune observation ne correspond aux filtres actuels.</p>
              <button type="button" class="btn btn-sm btn-primary" id="btn-empty-reset">Effacer les filtres</button>
            </div>
          ` : sortedItems.map(item => this.renderItemCard(item)).join('')}
        </div>
      </div>
    `;

    this.bindDashboardEvents(targetEl);
  }

  hasActiveFilters() {
    const f = appState.filters;
    return f.search || f.colorKeys.size > 0 || f.urgencies.size > 0 || f.trades.size > 0 || f.zones.size > 0 || f.hideDone || f.hideEmpty || f.onlyActionRequired || appState.deletedItemIds.size > 0;
  }

  renderActiveFilterChips() {
    const chips = [];
    const f = appState.filters;

    if (f.search) {
      chips.push(`<span class="filter-chip" data-clear="search">Recherche: "${f.search}" <span class="chip-x">×</span></span>`);
    }
    for (const ck of f.colorKeys) {
      const meta = STATUS_META[ck];
      chips.push(`<span class="filter-chip chip-color ${meta.badgeClass}" data-clear-color="${ck}">${meta.shortLabel} <span class="chip-x">×</span></span>`);
    }
    for (const z of f.zones) {
      chips.push(`<span class="filter-chip" data-clear-zone="${z}">Zone: ${z} <span class="chip-x">×</span></span>`);
    }
    for (const t of f.trades) {
      chips.push(`<span class="filter-chip" data-clear-trade="${t}">Métier: ${t} <span class="chip-x">×</span></span>`);
    }
    if (f.hideDone) {
      chips.push(`<span class="filter-chip" data-clear="hideDone">Masquer terminés <span class="chip-x">×</span></span>`);
    }
    if (f.hideEmpty) {
      chips.push(`<span class="filter-chip" data-clear="hideEmpty">Sans observation masqués <span class="chip-x">×</span></span>`);
    }
    if (f.onlyActionRequired) {
      chips.push(`<span class="filter-chip" data-clear="onlyActionRequired">Actions requises <span class="chip-x">×</span></span>`);
    }
    if (appState.deletedItemIds.size > 0) {
      chips.push(`<span class="filter-chip chip-deleted" id="btn-restore-items" title="Cliquer pour restaurer tous les éléments supprimés">🗑️ ${appState.deletedItemIds.size} supprimé(s) (Restaurer) <span class="chip-x">↺</span></span>`);
    }

    return chips.join('');
  }

  renderItemCard(item) {
    const prog = appState.getItemProgress(item.id);
    const isDone = prog === ITEM_PROGRESS.DONE;
    const meta = STATUS_META[item.colorKey] || STATUS_META.inconnu;
    const isDimmed = !item.isActionRequired && !isDone;

    return `
      <div class="item-card ${isDone ? 'card-done' : ''} ${isDimmed ? 'card-dimmed' : ''}" data-item-id="${item.id}">
        <div class="card-status-strip" style="background-color: ${meta.borderColor || '#ccc'};"></div>
        <div class="card-content">
          <div class="card-header-row">
            <div class="card-title-group">
              <span class="card-zone-tag">${item.zone}</span>
              <h3 class="card-article-title">${item.article}</h3>
            </div>
            <div class="card-actions-group">
              ${this.renderBadge(item.colorKey, item.status)}
              ${this.renderProgressPill(item.id)}
              <button type="button" class="btn-card-delete" data-delete-id="${item.id}" title="Supprimer / Masquer cet élément">🗑️</button>
            </div>
          </div>

          <div class="card-meta-row">
            <span class="meta-item"><span class="meta-label">Métier :</span> <strong>${item.trade || '—'}</strong></span>
            <span class="meta-item"><span class="meta-label">Urgence :</span> ${item.urgency}</span>
            <span class="meta-item"><span class="meta-label">Coût estimé :</span> <span class="cost-tag">${item.costEstimate || '—'}</span></span>
            <span class="meta-item page-meta"><span class="meta-label">Rapport p.</span> ${item.page || '—'}</span>
          </div>

          <div class="card-bullets-preview">
            ${this.renderBulletsHtml(item.bullets ? item.bullets.slice(0, 3) : [], item.rawObservation)}
            ${item.bullets && item.bullets.length > 3 ? `<span class="more-bullets-hint">+ ${item.bullets.length - 3} autre(s) point(s)...</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  bindDashboardEvents(targetEl) {
    // Summary tile click -> toggle color filter
    targetEl.querySelectorAll('.summary-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        const key = tile.getAttribute('data-color-key');
        if (appState.filters.colorKeys.has(key)) {
          appState.filters.colorKeys.delete(key);
        } else {
          appState.filters.colorKeys.clear(); // single select or toggle
          appState.filters.colorKeys.add(key);
        }
        appState.notify('FILTERS_CHANGED');
      });
    });

    // Search input
    const searchInput = targetEl.querySelector('#dashboard-search');
    let searchDebounce;
    searchInput?.addEventListener('input', e => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        appState.filters.search = e.target.value;
        appState.notify('FILTERS_CHANGED');
      }, 200);
    });

    targetEl.querySelector('#clear-search-btn')?.addEventListener('click', () => {
      appState.filters.search = '';
      appState.notify('FILTERS_CHANGED');
    });

    // Checkboxes
    targetEl.querySelector('#filter-hide-done')?.addEventListener('change', e => {
      appState.filters.hideDone = e.target.checked;
      appState.notify('FILTERS_CHANGED');
    });

    targetEl.querySelector('#filter-hide-empty')?.addEventListener('change', e => {
      appState.filters.hideEmpty = e.target.checked;
      appState.notify('FILTERS_CHANGED');
    });

    targetEl.querySelector('#filter-action-only')?.addEventListener('change', e => {
      appState.filters.onlyActionRequired = e.target.checked;
      appState.notify('FILTERS_CHANGED');
    });

    // Reset filters
    const resetFn = () => {
      appState.filters.search = '';
      appState.filters.colorKeys.clear();
      appState.filters.urgencies.clear();
      appState.filters.trades.clear();
      appState.filters.zones.clear();
      appState.filters.hideDone = false;
      appState.filters.hideEmpty = false;
      appState.filters.onlyActionRequired = false;
      appState.notify('FILTERS_CHANGED');
    };

    targetEl.querySelector('#btn-reset-filters')?.addEventListener('click', resetFn);
    targetEl.querySelector('#btn-empty-reset')?.addEventListener('click', resetFn);

    // Active chip clears
    targetEl.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (chip.id === 'btn-restore-items') {
          if (confirm('Restaurer tous les éléments supprimés ?')) {
            appState.restoreAllDeletedItems();
          }
          return;
        }
        if (chip.dataset.clear === 'search') appState.filters.search = '';
        if (chip.dataset.clear === 'hideDone') appState.filters.hideDone = false;
        if (chip.dataset.clear === 'hideEmpty') appState.filters.hideEmpty = false;
        if (chip.dataset.clear === 'onlyActionRequired') appState.filters.onlyActionRequired = false;
        if (chip.dataset.clearColor) appState.filters.colorKeys.delete(chip.dataset.clearColor);
        if (chip.dataset.clearZone) appState.filters.zones.delete(chip.dataset.clearZone);
        if (chip.dataset.clearTrade) appState.filters.trades.delete(chip.dataset.clearTrade);
        appState.notify('FILTERS_CHANGED');
      });
    });

    // Delete button on card
    targetEl.querySelectorAll('.btn-card-delete').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.getAttribute('data-delete-id');
        const item = appState.getItemById(id);
        if (confirm(`Supprimer l'élément "${item?.article || id}" ?`)) {
          appState.deleteItem(id);
        }
      });
    });

    // Item card click -> open detail drawer
    targetEl.querySelectorAll('.item-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.progress-dropdown') || e.target.closest('.btn-card-delete')) return;
        const itemId = card.getAttribute('data-item-id');
        this.openDetailDrawer(itemId);
      });
    });

    // Progress pill click -> toggle next progress state
    targetEl.querySelectorAll('.progress-pill').forEach(pill => {
      pill.addEventListener('click', e => {
        e.stopPropagation();
        const wrapper = pill.closest('.progress-dropdown');
        const itemId = wrapper.getAttribute('data-item-id');
        const curr = appState.getItemProgress(itemId);
        let next = ITEM_PROGRESS.PLANNED;
        if (curr === ITEM_PROGRESS.TODO) next = ITEM_PROGRESS.PLANNED;
        else if (curr === ITEM_PROGRESS.PLANNED) next = ITEM_PROGRESS.DONE;
        else if (curr === ITEM_PROGRESS.DONE) next = ITEM_PROGRESS.TODO;
        appState.setItemProgress(itemId, next);
      });
    });

    // Print summary button
    targetEl.querySelector('#btn-print-summary')?.addEventListener('click', () => {
      window.print();
    });
  }

  // ==========================================
  // VIEW: BY ZONE (Accordion / Grouped)
  // ==========================================
  renderZonesView(targetEl) {
    const zonesMap = new Map();
    for (const z of appState.zones) {
      zonesMap.set(z, []);
    }
    for (const item of appState.items) {
      if (!zonesMap.has(item.zone)) zonesMap.set(item.zone, []);
      zonesMap.get(item.zone).push(item);
    }

    targetEl.innerHTML = `
      <div class="zones-view">
        <div class="view-header">
          <h2>Navigation par Zone (${appState.zones.length} zones)</h2>
          <p class="text-muted">Explorez les éléments d'inspection regroupés par section du bâtiment.</p>
        </div>

        <div class="zones-accordion-list">
          ${[...zonesMap.entries()].map(([zoneName, items]) => {
            const counts = { rouge: 0, orange: 0, bleu: 0, violet: 0, vert: 0, inconnu: 0, total: items.length, done: 0 };
            for (const it of items) {
              counts[it.colorKey] = (counts[it.colorKey] || 0) + 1;
              if (appState.getItemProgress(it.id) === ITEM_PROGRESS.DONE) counts.done++;
            }
            const remaining = counts.total - counts.done;

            return `
              <div class="zone-accordion-item" data-zone-name="${zoneName}">
                <div class="zone-header">
                  <div class="zone-title-area">
                    <span class="zone-toggle-icon">▶</span>
                    <h3 class="zone-name">${zoneName}</h3>
                    <span class="zone-count-badge">${remaining} restant(s) / ${counts.total}</span>
                  </div>

                  <div class="zone-mini-bar" title="Répartition des statuts">
                    ${counts.rouge > 0 ? `<div class="bar-segment bar-rouge" style="flex: ${counts.rouge};" title="${counts.rouge} prioritaire(s)"></div>` : ''}
                    ${counts.violet > 0 ? `<div class="bar-segment bar-violet" style="flex: ${counts.violet};" title="${counts.violet} non conforme(s) BNQ"></div>` : ''}
                    ${counts.bleu > 0 ? `<div class="bar-segment bar-bleu" style="flex: ${counts.bleu};" title="${counts.bleu} requis"></div>` : ''}
                    ${counts.orange > 0 ? `<div class="bar-segment bar-orange" style="flex: ${counts.orange};" title="${counts.orange} préventif(s)"></div>` : ''}
                    ${counts.vert > 0 ? `<div class="bar-segment bar-vert" style="flex: ${counts.vert};" title="${counts.vert} conforme(s)"></div>` : ''}
                  </div>
                </div>

                <div class="zone-body hidden">
                  <div class="zone-items-grid">
                    ${items.map(item => this.renderItemCard(item)).join('')}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Accordion toggle
    targetEl.querySelectorAll('.zone-header').forEach(header => {
      header.addEventListener('click', () => {
        const item = header.closest('.zone-accordion-item');
        const body = item.querySelector('.zone-body');
        const icon = item.querySelector('.zone-toggle-icon');
        const isHidden = body.classList.toggle('hidden');
        icon.textContent = isHidden ? '▶' : '▼';
      });
    });

    this.bindCardClicks(targetEl);
  }

  // ==========================================
  // VIEW: BY TRADE (Corps de métier)
  // ==========================================
  renderTradesView(targetEl) {
    const tradesMap = new Map();
    const actionItems = appState.items.filter(i => i.isActionRequired);

    for (const item of actionItems) {
      const trade = item.trade || 'Autre / Non spécifié';
      if (!tradesMap.has(trade)) tradesMap.set(trade, []);
      tradesMap.get(trade).push(item);
    }

    // Sort trades by number of items descending
    const sortedTrades = [...tradesMap.entries()].sort((a, b) => b[1].length - a[1].length);

    targetEl.innerHTML = `
      <div class="trades-view">
        <div class="view-header">
          <div class="view-header-row">
            <div>
              <h2>Par Corps de Métier (Pour soumissions & entrepreneurs)</h2>
              <p class="text-muted">Affiche uniquement les <strong>${actionItems.length} travaux à corriger</strong> regroupés par professionnel.</p>
            </div>
            <button type="button" class="btn btn-outline" id="btn-print-trade-sheet">
              🖨️ Imprimer la feuille d'appels d'offres
            </button>
          </div>
        </div>

        <div class="trades-grid">
          ${sortedTrades.map(([tradeName, items]) => {
            const doneCount = items.filter(i => appState.getItemProgress(i.id) === ITEM_PROGRESS.DONE).length;
            const remainingCount = items.length - doneCount;

            return `
              <div class="trade-card ${remainingCount === 0 ? 'trade-completed' : ''}">
                <div class="trade-header">
                  <div class="trade-title-group">
                    <span class="trade-icon">👷</span>
                    <h3 class="trade-name">${tradeName}</h3>
                  </div>
                  <span class="trade-count-badge">${remainingCount} / ${items.length} à faire</span>
                </div>

                <div class="trade-items-list">
                  ${items.map(item => {
                    const prog = appState.getItemProgress(item.id);
                    const isDone = prog === ITEM_PROGRESS.DONE;
                    return `
                      <div class="trade-item-row ${isDone ? 'row-done' : ''}" data-item-id="${item.id}">
                        <div class="trade-item-left">
                          <span class="trade-item-zone">${item.zone}</span>
                          <span class="trade-item-title">${item.article}</span>
                          <span class="trade-item-cost">${item.costEstimate}</span>
                        </div>
                        <div class="trade-item-right">
                          ${this.renderBadge(item.colorKey)}
                          ${this.renderProgressPill(item.id)}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    targetEl.querySelector('#btn-print-trade-sheet')?.addEventListener('click', () => {
      window.print();
    });

    this.bindCardClicks(targetEl);
  }

  // ==========================================
  // VIEW: SITE PLAN (Exterior)
  // ==========================================
  renderSitePlanView(targetEl) {
    targetEl.innerHTML = `
      <div class="site-plan-view">
        <div class="plan-header-bar">
          <div class="plan-title-group">
            <h2>Plan du Terrain & Extérieur</h2>
            <span class="text-muted">Cliquez sur une zone du terrain pour voir ou assigner les éléments extérieurs.</span>
          </div>

          <div class="plan-toolbar-actions">
            <button type="button" class="btn btn-sm btn-outline" id="btn-undo-plan" ${appState.undoStack.length === 0 ? 'disabled' : ''} title="Annuler (Ctrl+Z)">↶ Annuler</button>
            <button type="button" class="btn btn-sm btn-outline" id="btn-redo-plan" ${appState.redoStack.length === 0 ? 'disabled' : ''} title="Rétablir (Ctrl+Y)">↷ Rétablir</button>
            <button type="button" class="btn btn-sm btn-outline" id="btn-add-hotspot">
              + Nouvelle zone terrain
            </button>
          </div>
        </div>

        <div class="plan-canvas-layout">
          <div class="plan-canvas-area" id="site-plan-canvas-root"></div>

          <div class="plan-sidebar-area">
            <div class="sidebar-card">
              <h3 class="sidebar-title">Zones du plan extérieur</h3>
              <div class="hotspots-list" id="site-hotspots-list">
                ${appState.sitePlanHotspots.map(spot => {
                  const worst = appState.getWorstSeverity(spot.itemIds);
                  const meta = STATUS_META[worst] || STATUS_META.vert;
                  const count = spot.itemIds?.length || 0;
                  return `
                    <div class="hotspot-list-item" data-hotspot-id="${spot.id}">
                      <div class="hotspot-item-header">
                        <span class="status-dot" style="background-color: ${meta.borderColor || '#ccc'};"></span>
                        <span class="hotspot-name">${spot.name}</span>
                        <span class="badge ${meta.badgeClass}">${count}</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="sidebar-card selected-entity-panel hidden" id="site-selected-panel">
              <!-- Rendered dynamically on selection -->
            </div>
          </div>
        </div>
      </div>
    `;

    const canvasRoot = targetEl.querySelector('#site-plan-canvas-root');
    this.canvasInstance = new PlanCanvas(canvasRoot, {
      isSitePlan: true,
      bgImage: appState.sitePlan.imageDataUrl,
      planWidth: appState.sitePlan.width,
      planHeight: appState.sitePlan.height,
      unit: 'px',
      snapToGrid: true,
      gridSize: 10,
    });

    const updateCanvasData = () => {
      const shapesWithStatus = appState.sitePlanHotspots.map(s => ({
        ...s,
        colorKey: appState.getWorstSeverity(s.itemIds) || 'vert',
      }));
      this.canvasInstance.setData({
        shapes: shapesWithStatus,
        bgImage: appState.sitePlan.imageDataUrl,
        planWidth: appState.sitePlan.width,
        planHeight: appState.sitePlan.height,
      });
      this.canvasInstance.fitToView();
    };

    updateCanvasData();

    // Canvas selection listener
    this.canvasInstance.onSelect = (shape) => {
      appState.selectedHotspotId = shape ? shape.id : null;
      this.renderSelectedSitePanel(targetEl, shape);
    };

    // Canvas shape updated
    this.canvasInstance.onShapeUpdated = (shape) => {
      appState.pushHistorySnapshot('Modifier zone terrain');
      const spot = appState.sitePlanHotspots.find(s => s.id === shape.id);
      if (spot) {
        spot.x = shape.x;
        spot.y = shape.y;
        spot.w = shape.w;
        spot.h = shape.h;
        appState.saveToStorage();
      }
    };

    // Canvas shape created
    this.canvasInstance.onShapeCreated = ({ x, y, w, h }) => {
      const name = prompt('Nom de la nouvelle zone extérieure :', 'Nouvelle zone');
      if (!name) return;
      appState.pushHistorySnapshot('Créer zone terrain');
      const newSpot = {
        id: `spot-${Date.now()}`,
        name,
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(w),
        h: Math.round(h),
        itemIds: [],
      };
      appState.sitePlanHotspots.push(newSpot);
      appState.saveToStorage();
      this.renderSitePlanView(targetEl);
      this.canvasInstance.setSelectedShape(newSpot.id);
    };

    // Hotspot list click
    targetEl.querySelectorAll('.hotspot-list-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-hotspot-id');
        this.canvasInstance.setSelectedShape(id);
      });
    });

    // Add hotspot button
    targetEl.querySelector('#btn-add-hotspot')?.addEventListener('click', () => {
      this.canvasInstance.setMode('draw');
    });

    // Undo / Redo buttons
    targetEl.querySelector('#btn-undo-plan')?.addEventListener('click', () => {
      appState.undo();
    });

    targetEl.querySelector('#btn-redo-plan')?.addEventListener('click', () => {
      appState.redo();
    });

    // Auto-select initial hotspot
    const initialSpotId = appState.selectedHotspotId && appState.sitePlanHotspots.some(s => s.id === appState.selectedHotspotId)
      ? appState.selectedHotspotId
      : appState.sitePlanHotspots[0]?.id;
    if (initialSpotId) {
      this.canvasInstance.setSelectedShape(initialSpotId);
    }
  }

  renderSelectedSitePanel(targetEl, shape) {
    const panel = targetEl.querySelector('#site-selected-panel');
    if (!shape) {
      panel.classList.add('hidden');
      return;
    }

    panel.classList.remove('hidden');
    const spot = appState.sitePlanHotspots.find(s => s.id === shape.id);
    if (!spot) return;

    const assignedItems = (spot.itemIds || []).map(id => appState.getItemById(id)).filter(Boolean);

    panel.innerHTML = `
      <div class="panel-header">
        <h4 class="panel-title">${spot.name}</h4>
        <button type="button" class="btn btn-sm btn-ghost btn-close-panel" title="Fermer">×</button>
      </div>

      <div class="panel-body">
        <div class="form-group">
          <label class="form-label">Nom de la zone :</label>
          <input type="text" class="form-control" id="spot-rename-input" value="${spot.name}">
        </div>

        <div class="assigned-items-header">
          <strong>Observations liées (${assignedItems.length}) :</strong>
          <button type="button" class="btn btn-xs btn-primary" id="btn-assign-items-spot">
            + Assigner / Modifier
          </button>
        </div>

        <div class="assigned-items-list">
          ${assignedItems.length === 0 ? `
            <p class="text-muted small">Aucun élément d'inspection assigné à cette zone. Cliquez sur "+ Assigner / Modifier" pour en ajouter.</p>
          ` : assignedItems.map(item => `
            <div class="mini-item-row" data-item-id="${item.id}" title="Cliquer pour voir la fiche détaillée">
              <div class="mini-item-info-col">
                <span class="mini-item-zone-tag">${item.zone}</span>
                <span class="mini-item-title">${item.article}</span>
              </div>
              <div class="mini-item-actions">
                ${this.renderBadge(item.colorKey)}
                <select class="form-control form-control-xs quick-move-spot" data-item-id="${item.id}" title="Déplacer vers une autre zone extérieure">
                  ${appState.sitePlanHotspots.map(s => `
                    <option value="${s.id}" ${s.id === spot.id ? 'selected' : ''}>↳ ${s.name}</option>
                  `).join('')}
                  <option value="__unassign__">✕ Détacher du plan</option>
                </select>
                <button type="button" class="btn-remove-assign" data-remove-item="${item.id}" title="Détacher de cette zone">×</button>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="panel-danger-zone">
          <button type="button" class="btn btn-xs btn-danger" id="btn-delete-spot">Supprimer cette zone</button>
        </div>
      </div>
    `;

    panel.querySelector('.btn-close-panel')?.addEventListener('click', () => {
      this.canvasInstance.setSelectedShape(null);
    });

    panel.querySelector('#spot-rename-input')?.addEventListener('change', e => {
      appState.pushHistorySnapshot('Renommer zone');
      spot.name = e.target.value.trim() || 'Zone';
      appState.saveToStorage();
      this.renderSitePlanView(targetEl);
    });

    panel.querySelector('#btn-assign-items-spot')?.addEventListener('click', () => {
      this.openItemAssignModal({
        type: 'hotspot',
        targetId: spot.id,
        targetName: spot.name,
        assignedIds: new Set(spot.itemIds || []),
      });
    });

    panel.querySelectorAll('.quick-move-spot').forEach(sel => {
      sel.addEventListener('click', e => e.stopPropagation());
      sel.addEventListener('change', e => {
        e.stopPropagation();
        const itemId = sel.getAttribute('data-item-id');
        const targetSpotId = e.target.value;
        appState.setItemSiteHotspot(itemId, targetSpotId);
      });
    });

    panel.querySelectorAll('.btn-remove-assign').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const itemId = btn.getAttribute('data-remove-item');
        appState.setItemSiteHotspot(itemId, '__unassign__');
      });
    });

    panel.querySelector('#btn-delete-spot')?.addEventListener('click', () => {
      if (confirm(`Supprimer la zone "${spot.name}" ?`)) {
        appState.pushHistorySnapshot('Supprimer zone');
        appState.sitePlanHotspots = appState.sitePlanHotspots.filter(s => s.id !== spot.id);
        appState.saveToStorage();
        this.renderSitePlanView(targetEl);
      }
    });

    this.bindCardClicks(panel);
  }

  // ==========================================
  // VIEW: FLOOR PLAN (Interior editor)
  // ==========================================
  renderFloorPlanView(targetEl) {
    const currentLevel = appState.floorPlans.levels.find(l => l.id === appState.currentLevelId) || appState.floorPlans.levels[0];
    appState.currentLevelId = currentLevel.id;

    targetEl.innerHTML = `
      <div class="floor-plan-view">
        <div class="plan-header-bar">
          <div class="level-tabs-container">
            ${appState.floorPlans.levels.map(lvl => `
              <button type="button" class="level-tab ${lvl.id === currentLevel.id ? 'active' : ''}" data-level-id="${lvl.id}">
                ${lvl.name}
              </button>
            `).join('')}
            <button type="button" class="btn btn-sm btn-ghost" id="btn-add-level" title="Ajouter un étage">+ Étage</button>
          </div>

          <div class="plan-header-actions">
            <button type="button" class="btn btn-sm btn-outline" id="btn-undo-plan" ${appState.undoStack.length === 0 ? 'disabled' : ''} title="Annuler (Ctrl+Z)">↶ Annuler</button>
            <button type="button" class="btn btn-sm btn-outline" id="btn-redo-plan" ${appState.redoStack.length === 0 ? 'disabled' : ''} title="Rétablir (Ctrl+Y)">↷ Rétablir</button>
            <button type="button" class="btn btn-sm btn-outline" id="btn-toggle-unassigned">
              Éléments non assignés (${appState.getUnassignedItems(true).length})
            </button>
          </div>
        </div>

        <div class="plan-canvas-layout">
          <div class="plan-canvas-area" id="floor-plan-canvas-root"></div>

          <div class="plan-sidebar-area">
            <div class="sidebar-card" id="floor-rooms-list-card">
              <h3 class="sidebar-title">Pièces au ${currentLevel.name}</h3>
              <div class="hotspots-list" id="floor-rooms-list">
                ${currentLevel.rooms.map(room => {
                  const worst = appState.getWorstSeverity(room.itemIds);
                  const meta = STATUS_META[worst] || STATUS_META.vert;
                  const count = room.itemIds?.length || 0;
                  return `
                    <div class="hotspot-list-item" data-room-id="${room.id}">
                      <div class="hotspot-item-header">
                        <span class="status-dot" style="background-color: ${meta.borderColor || '#ccc'};"></span>
                        <span class="hotspot-name">${room.name}</span>
                        <span class="badge ${meta.badgeClass}">${count}</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="sidebar-card selected-entity-panel hidden" id="floor-selected-panel">
              <!-- Rendered on selection -->
            </div>
          </div>
        </div>
      </div>
    `;

    const canvasRoot = targetEl.querySelector('#floor-plan-canvas-root');
    this.canvasInstance = new PlanCanvas(canvasRoot, {
      isSitePlan: false,
      unit: 'm',
      gridSize: 0.2,
      snapToGrid: true,
      minRoomSize: 0.5,
    });

    const updateFloorCanvasData = () => {
      const shapesWithStatus = currentLevel.rooms.map(r => ({
        ...r,
        colorKey: appState.getWorstSeverity(r.itemIds) || 'vert',
      }));
      this.canvasInstance.setData({
        shapes: shapesWithStatus,
        footprint: currentLevel.footprint,
      });
      this.canvasInstance.fitToView();
    };

    updateFloorCanvasData();

    // Canvas Selection
    this.canvasInstance.onSelect = (shape) => {
      appState.selectedRoomId = shape ? shape.id : null;
      this.renderSelectedRoomPanel(targetEl, currentLevel, shape);
    };

    // Canvas Shape Updated
    this.canvasInstance.onShapeUpdated = (shape) => {
      appState.pushHistorySnapshot('Modifier pièce');
      const room = currentLevel.rooms.find(r => r.id === shape.id);
      if (room) {
        room.x = shape.x;
        room.y = shape.y;
        room.w = shape.w;
        room.h = shape.h;
        appState.saveToStorage();
      }
    };

    // Canvas Shape Created
    this.canvasInstance.onShapeCreated = ({ x, y, w, h }) => {
      const name = prompt('Nom de la pièce :', 'Nouvelle pièce');
      if (!name) return;
      appState.pushHistorySnapshot('Créer pièce');
      const newRoom = {
        id: `room-${Date.now()}`,
        name,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        w: Math.round(w * 100) / 100,
        h: Math.round(h * 100) / 100,
        itemIds: [],
      };
      currentLevel.rooms.push(newRoom);
      appState.saveToStorage();
      this.renderFloorPlanView(targetEl);
      this.canvasInstance.setSelectedShape(newRoom.id);
    };

    // Level tabs
    targetEl.querySelectorAll('.level-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        appState.currentLevelId = tab.getAttribute('data-level-id');
        this.renderFloorPlanView(targetEl);
      });
    });

    // Add level
    targetEl.querySelector('#btn-add-level')?.addEventListener('click', () => {
      const name = prompt('Nom du nouvel étage (ex: Garage, Mezzanine) :');
      if (!name) return;
      appState.pushHistorySnapshot('Ajouter étage');
      const id = `lvl-${Date.now()}`;
      appState.floorPlans.levels.push({
        id,
        name,
        footprint: { ...currentLevel.footprint },
        rooms: [],
      });
      appState.currentLevelId = id;
      appState.saveToStorage();
      this.renderFloorPlanView(targetEl);
    });

    // Undo / Redo
    targetEl.querySelector('#btn-undo-plan')?.addEventListener('click', () => {
      appState.undo();
      this.renderFloorPlanView(targetEl);
    });
    targetEl.querySelector('#btn-redo-plan')?.addEventListener('click', () => {
      appState.redo();
      this.renderFloorPlanView(targetEl);
    });

    // Unassigned button
    targetEl.querySelector('#btn-toggle-unassigned')?.addEventListener('click', () => {
      this.openUnassignedDrawer();
    });

    // Room list click
    targetEl.querySelectorAll('.hotspot-list-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-room-id');
        this.canvasInstance.setSelectedShape(id);
      });
    });

    // Auto-select initial room on level
    const initialRoomId = appState.selectedRoomId && currentLevel.rooms.some(r => r.id === appState.selectedRoomId)
      ? appState.selectedRoomId
      : currentLevel.rooms[0]?.id;
    if (initialRoomId) {
      this.canvasInstance.setSelectedShape(initialRoomId);
    }
  }

  renderSelectedRoomPanel(targetEl, currentLevel, shape) {
    const panel = targetEl.querySelector('#floor-selected-panel');
    if (!shape) {
      panel.classList.add('hidden');
      return;
    }

    panel.classList.remove('hidden');
    const room = currentLevel.rooms.find(r => r.id === shape.id);
    if (!room) return;

    const assignedItems = (room.itemIds || []).map(id => appState.getItemById(id)).filter(Boolean);

    panel.innerHTML = `
      <div class="panel-header">
        <h4 class="panel-title">${room.name}</h4>
        <button type="button" class="btn btn-sm btn-ghost btn-close-panel" title="Fermer">×</button>
      </div>

      <div class="panel-body">
        <div class="form-group">
          <label class="form-label">Nom de la pièce :</label>
          <input type="text" class="form-control" id="room-rename-input" value="${room.name}">
        </div>

        <div class="room-dims-edit">
          <label class="form-label">Dimensions :</label>
          <div class="room-dims-inputs">
            <div class="room-dim-field">
              <span class="room-dim-axis">L</span>
              <input type="number" class="form-control form-control-sm" id="room-width-input"
                min="0.1" max="999" step="0.01" value="${room.w.toFixed(2)}">
              <span class="room-dim-unit">m</span>
            </div>
            <span class="room-dim-sep">×</span>
            <div class="room-dim-field">
              <span class="room-dim-axis">P</span>
              <input type="number" class="form-control form-control-sm" id="room-height-input"
                min="0.1" max="999" step="0.01" value="${room.h.toFixed(2)}">
              <span class="room-dim-unit">m</span>
            </div>
            <span class="room-dim-area" id="room-area-display">${(room.w * room.h).toFixed(1)} m²</span>
          </div>
        </div>

        <div class="assigned-items-header">
          <strong>Observations liées (${assignedItems.length}) :</strong>
          <button type="button" class="btn btn-xs btn-primary" id="btn-assign-items-room">
            + Assigner / Modifier
          </button>
        </div>

        <div class="assigned-items-list">
          ${assignedItems.length === 0 ? `
            <p class="text-muted small">Aucun élément assigné. Cliquez sur "+ Assigner / Modifier" pour lier des observations à cette pièce.</p>
          ` : assignedItems.map(item => `
            <div class="mini-item-row" data-item-id="${item.id}" title="Cliquer pour voir la fiche détaillée">
              <div class="mini-item-info-col">
                <span class="mini-item-zone-tag">${item.zone}</span>
                <span class="mini-item-title">${item.article}</span>
              </div>
              <div class="mini-item-actions">
                ${this.renderBadge(item.colorKey)}
                <select class="form-control form-control-xs quick-move-room" data-item-id="${item.id}" title="Déplacer vers une autre pièce">
                  ${appState.floorPlans.levels.map(lvl => `
                    <optgroup label="${lvl.name}">
                      ${lvl.rooms.map(r => `
                        <option value="${r.id}" ${r.id === room.id ? 'selected' : ''}>↳ ${r.name} (${lvl.name})</option>
                      `).join('')}
                    </optgroup>
                  `).join('')}
                  <option value="__unassign__">✕ Détacher de la pièce</option>
                </select>
                <button type="button" class="btn-remove-assign" data-remove-item="${item.id}" title="Détacher de cette pièce">×</button>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="panel-danger-zone">
          <button type="button" class="btn btn-xs btn-danger" id="btn-delete-room">Supprimer la pièce</button>
        </div>
      </div>
    `;

    panel.querySelector('.btn-close-panel')?.addEventListener('click', () => {
      this.canvasInstance.setSelectedShape(null);
    });

    panel.querySelector('#room-rename-input')?.addEventListener('change', e => {
      appState.pushHistorySnapshot('Renommer pièce');
      room.name = e.target.value.trim() || 'Pièce';
      appState.saveToStorage();
      this.renderFloorPlanView(targetEl);
    });

    const applyDimChange = () => {
      const wInput = panel.querySelector('#room-width-input');
      const hInput = panel.querySelector('#room-height-input');
      const minSize = 0.1;
      const newW = Math.max(minSize, parseFloat(wInput.value) || minSize);
      const newH = Math.max(minSize, parseFloat(hInput.value) || minSize);
      wInput.value = newW.toFixed(2);
      hInput.value = newH.toFixed(2);
      const areaEl = panel.querySelector('#room-area-display');
      if (areaEl) areaEl.textContent = `${(newW * newH).toFixed(1)} m²`;
      appState.pushHistorySnapshot('Redimensionner pièce');
      room.w = newW;
      room.h = newH;
      appState.saveToStorage();
      // Update the canvas shape in-place without a full re-render
      const shape = this.canvasInstance.shapes.find(s => s.id === room.id);
      if (shape) {
        shape.w = newW;
        shape.h = newH;
        this.canvasInstance.notifyShapeUpdated(shape);
      }
    };

    panel.querySelector('#room-width-input')?.addEventListener('change', applyDimChange);
    panel.querySelector('#room-height-input')?.addEventListener('change', applyDimChange);

    panel.querySelector('#btn-assign-items-room')?.addEventListener('click', () => {
      this.openItemAssignModal({
        type: 'room',
        levelId: currentLevel.id,
        targetId: room.id,
        targetName: room.name,
        assignedIds: new Set(room.itemIds || []),
      });
    });

    panel.querySelectorAll('.quick-move-room').forEach(sel => {
      sel.addEventListener('click', e => e.stopPropagation());
      sel.addEventListener('change', e => {
        e.stopPropagation();
        const itemId = sel.getAttribute('data-item-id');
        const targetRoomId = e.target.value;
        appState.setItemRoom(itemId, targetRoomId);
      });
    });

    panel.querySelectorAll('.btn-remove-assign').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const itemId = btn.getAttribute('data-remove-item');
        appState.setItemRoom(itemId, '__unassign__');
      });
    });

    panel.querySelector('#btn-delete-room')?.addEventListener('click', () => {
      if (confirm(`Supprimer la pièce "${room.name}" ?`)) {
        appState.pushHistorySnapshot('Supprimer pièce');
        currentLevel.rooms = currentLevel.rooms.filter(r => r.id !== room.id);
        appState.saveToStorage();
        this.renderFloorPlanView(targetEl);
      }
    });

    this.bindCardClicks(panel);
  }

  // ==========================================
  // VIEW: GENERAL INFO & LEGEND
  // ==========================================
  renderAdminView(targetEl) {
    const adminByZone = new Map();
    for (const item of appState.adminItems) {
      if (!adminByZone.has(item.zone)) adminByZone.set(item.zone, []);
      adminByZone.get(item.zone).push(item);
    }

    targetEl.innerHTML = `
      <div class="admin-view">
        <div class="view-header">
          <h2>Informations Générales & Synthèse</h2>
          <p class="text-muted">Notes administratives, documents de référence et légende du rapport.</p>
        </div>

        <div class="admin-section">
          <h3>Légende et Barème</h3>
          <div class="legend-table-wrapper">
            <table class="legend-table">
              <thead>
                <tr>
                  <th>Symbole</th>
                  <th>Condition (Rapport)</th>
                  <th>Urgence</th>
                  <th>Statut</th>
                  <th>Coût de base</th>
                  <th>Nb Articles</th>
                </tr>
              </thead>
              <tbody>
                ${(appState.legend?.entries || []).map(e => `
                  <tr>
                    <td>${this.renderBadge(e.colorKey, e.symbol)}</td>
                    <td>${e.description}</td>
                    <td>${e.urgency}</td>
                    <td>${e.status}</td>
                    <td>${e.baseCost}</td>
                    <td><strong>${e.count}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="admin-section">
          <h3>Sections Administratives du Rapport (${appState.adminItems.length} articles)</h3>
          <div class="admin-cards-grid">
            ${[...adminByZone.entries()].map(([zone, items]) => `
              <div class="admin-group-card">
                <h4 class="admin-group-title">${zone}</h4>
                <div class="admin-items-list">
                  ${items.map(it => `
                    <div class="admin-item" data-item-id="${it.id}">
                      <div class="admin-item-header">
                        <strong>${it.article}</strong>
                        <span class="text-muted small">p. ${it.page || '—'}</span>
                      </div>
                      <div class="admin-item-body">
                        ${this.renderBulletsHtml(it.bullets, it.rawObservation)}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================
  // DETAIL DRAWER
  // ==========================================
  openDetailDrawer(itemId) {
    const item = appState.getItemById(itemId);
    if (!item) return;

    this.activeDrawerItemId = itemId;
    const drawerEl = document.querySelector('#detail-drawer');
    const overlayEl = document.querySelector('#drawer-overlay');
    if (!drawerEl) return;

    const prog = appState.getItemProgress(item.id);
    const note = appState.userProgress[item.id]?.note || '';
    const meta = STATUS_META[item.colorKey] || STATUS_META.inconnu;
    const currentSiteSpot = appState.getItemSiteHotspot(item.id);
    const currentRoomInfo = appState.getItemRoom(item.id);

    drawerEl.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-header-left">
          <span class="drawer-zone-label">${item.zone}</span>
          <h2 class="drawer-title">${item.article}</h2>
        </div>
        <button type="button" class="drawer-close-btn" id="btn-close-drawer" title="Fermer (Échap)">×</button>
      </div>

      <div class="drawer-body">
        <div class="drawer-status-banner" style="background-color: ${meta.color}; color: ${meta.textColor};">
          <div class="banner-status-name">${this.renderBadge(item.colorKey, item.status)}</div>
          <div class="banner-urgency">Urgence : <strong>${item.urgency}</strong></div>
        </div>

        <div class="drawer-meta-grid">
          <div class="drawer-meta-box">
            <span class="drawer-meta-label">Profession associée</span>
            <span class="drawer-meta-value">${item.trade || '—'}</span>
          </div>
          <div class="drawer-meta-box">
            <span class="drawer-meta-label">Estimation indicative des coûts</span>
            <span class="drawer-meta-value cost-value">${item.costEstimate || '—'}</span>
            <span class="drawer-meta-disclaimer">Estimation basée sur mots-clés d'inspection</span>
          </div>
          <div class="drawer-meta-box">
            <span class="drawer-meta-label">Page du rapport PDF</span>
            <span class="drawer-meta-value">Page ${item.page || '—'}</span>
          </div>
        </div>

        <div class="drawer-section">
          <h4 class="drawer-section-title">Emplacement sur les plans</h4>
          <div class="drawer-locations-grid">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Zone extérieure (Plan du site) :</label>
              <select class="form-control" id="drawer-select-site-spot">
                <option value="__unassign__">— Non assigné au terrain extérieur —</option>
                ${appState.sitePlanHotspots.map(spot => `
                  <option value="${spot.id}" ${currentSiteSpot?.id === spot.id ? 'selected' : ''}>
                    ${spot.name}
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Pièce intérieure (Plan d'étage) :</label>
              <select class="form-control" id="drawer-select-room">
                <option value="__unassign__">— Non assigné à une pièce intérieure —</option>
                ${appState.floorPlans.levels.map(lvl => `
                  <optgroup label="${lvl.name}">
                    ${lvl.rooms.map(room => `
                      <option value="${room.id}" ${currentRoomInfo?.room.id === room.id ? 'selected' : ''}>
                        ${room.name} (${lvl.name})
                      </option>
                    `).join('')}
                  </optgroup>
                `).join('')}
              </select>
            </div>
          </div>
        </div>

        <div class="drawer-section">
          <h4 class="drawer-section-title">Observations de l'inspecteur</h4>
          <div class="drawer-observations-box">
            ${this.renderBulletsHtml(item.bullets, item.rawObservation)}
          </div>
        </div>

        <div class="drawer-section">
          <h4 class="drawer-section-title">Suivi & Planification des travaux</h4>
          <div class="progress-radio-group">
            <label class="radio-label">
              <input type="radio" name="item-progress" value="${ITEM_PROGRESS.TODO}" ${prog === ITEM_PROGRESS.TODO ? 'checked' : ''}>
              <span>○ À faire</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="item-progress" value="${ITEM_PROGRESS.PLANNED}" ${prog === ITEM_PROGRESS.PLANNED ? 'checked' : ''}>
              <span>◷ Planifié</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="item-progress" value="${ITEM_PROGRESS.DONE}" ${prog === ITEM_PROGRESS.DONE ? 'checked' : ''}>
              <span>✓ Terminé</span>
            </label>
          </div>
        </div>

        <div class="drawer-section">
          <h4 class="drawer-section-title">Notes personnelles / Soumissionnaire</h4>
          <textarea class="form-control" id="item-note-input" rows="3" placeholder="Ajouter des notes, nom de l'entrepreneur, date prévue, montant de la soumission...">${note}</textarea>
        </div>

        <div class="drawer-danger-zone">
          <button type="button" class="btn btn-sm btn-outline-danger" id="btn-drawer-delete-item">
            🗑️ Supprimer / Masquer cet élément
          </button>
        </div>
      </div>
    `;

    drawerEl.classList.add('open');
    overlayEl.classList.add('open');

    // Drawer events
    drawerEl.querySelector('#btn-close-drawer')?.addEventListener('click', () => this.closeDetailDrawer());
    drawerEl.querySelectorAll('input[name="item-progress"]').forEach(radio => {
      radio.addEventListener('change', e => {
        appState.setItemProgress(item.id, e.target.value);
      });
    });

    drawerEl.querySelector('#drawer-select-site-spot')?.addEventListener('change', e => {
      appState.setItemSiteHotspot(item.id, e.target.value);
    });

    drawerEl.querySelector('#drawer-select-room')?.addEventListener('change', e => {
      appState.setItemRoom(item.id, e.target.value);
    });

    let noteDebounce;
    drawerEl.querySelector('#item-note-input')?.addEventListener('input', e => {
      clearTimeout(noteDebounce);
      noteDebounce = setTimeout(() => {
        appState.setItemNote(item.id, e.target.value);
      }, 300);
    });

    drawerEl.querySelector('#btn-drawer-delete-item')?.addEventListener('click', () => {
      if (confirm(`Supprimer l'élément "${item.article}" ? (Vous pourrez le restaurer plus tard)`)) {
        appState.deleteItem(item.id);
        this.closeDetailDrawer();
      }
    });
  }

  closeDetailDrawer() {
    document.querySelector('#detail-drawer')?.classList.remove('open');
    document.querySelector('#drawer-overlay')?.classList.remove('open');
    this.activeDrawerItemId = null;
  }

  // ==========================================
  // ITEM ASSIGN MODAL
  // ==========================================
  openItemAssignModal({ type, levelId, targetId, targetName, assignedIds }) {
    this.activeAssignTarget = { type, levelId, targetId, targetName, assignedIds: new Set(assignedIds) };
    const modalEl = document.querySelector('#assign-modal');
    const overlayEl = document.querySelector('#modal-overlay');
    if (!modalEl) return;

    this.renderAssignModalContent(modalEl);
    modalEl.classList.add('open');
    overlayEl.classList.add('open');
  }

  renderAssignModalContent(modalEl) {
    const { targetName, assignedIds } = this.activeAssignTarget;

    modalEl.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>Assigner des éléments à : <strong>${targetName}</strong></h3>
          <button type="button" class="btn-close-modal" id="btn-close-assign-modal">×</button>
        </div>

        <div class="modal-filter-bar">
          <input type="text" class="form-control" id="modal-search" placeholder="Filtrer les éléments...">
          <select class="form-control" id="modal-zone-filter">
            <option value="">Toutes les zones</option>
            ${appState.zones.map(z => `<option value="${z}">${z}</option>`).join('')}
          </select>
        </div>

        <div class="modal-items-list" id="modal-items-container">
          ${this.renderAssignModalItems()}
        </div>

        <div class="modal-footer">
          <span class="text-muted small">Sélectionnez les éléments à lier à cette pièce/zone.</span>
          <button type="button" class="btn btn-primary" id="btn-save-assign">Enregistrer les assignations</button>
        </div>
      </div>
    `;

    modalEl.querySelector('#btn-close-assign-modal')?.addEventListener('click', () => this.closeAssignModal());
    modalEl.querySelector('#btn-save-assign')?.addEventListener('click', () => {
      this.saveAssignments();
      this.closeAssignModal();
    });

    const updateList = () => {
      modalEl.querySelector('#modal-items-container').innerHTML = this.renderAssignModalItems();
      this.bindModalCheckboxEvents(modalEl);
    };

    modalEl.querySelector('#modal-search')?.addEventListener('input', e => {
      this.modalSearchQuery = e.target.value.toLowerCase();
      updateList();
    });

    modalEl.querySelector('#modal-zone-filter')?.addEventListener('change', e => {
      this.modalZoneFilter = e.target.value;
      updateList();
    });

    this.bindModalCheckboxEvents(modalEl);
  }

  renderAssignModalItems() {
    const query = this.modalSearchQuery || '';
    const zoneF = this.modalZoneFilter || '';
    const { assignedIds } = this.activeAssignTarget;

    const filtered = appState.items.filter(item => {
      if (zoneF && item.zone !== zoneF) return false;
      if (query && !item.article.toLowerCase().includes(query) && !item.zone.toLowerCase().includes(query)) return false;
      return true;
    });

    return filtered.map(item => {
      const isChecked = assignedIds.has(item.id);
      return `
        <label class="modal-item-row ${isChecked ? 'item-checked' : ''}">
          <input type="checkbox" class="assign-checkbox" data-item-id="${item.id}" ${isChecked ? 'checked' : ''}>
          <div class="modal-item-info">
            <span class="modal-item-zone">${item.zone}</span>
            <span class="modal-item-title">${item.article}</span>
          </div>
          ${this.renderBadge(item.colorKey)}
        </label>
      `;
    }).join('');
  }

  bindModalCheckboxEvents(modalEl) {
    modalEl.querySelectorAll('.assign-checkbox').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = cb.getAttribute('data-item-id');
        if (e.target.checked) {
          this.activeAssignTarget.assignedIds.add(id);
        } else {
          this.activeAssignTarget.assignedIds.delete(id);
        }
      });
    });
  }

  saveAssignments() {
    const { type, levelId, targetId, assignedIds } = this.activeAssignTarget;
    appState.pushHistorySnapshot('Mettre à jour assignations');

    if (type === 'room') {
      const lvl = appState.floorPlans.levels.find(l => l.id === levelId);
      const room = lvl?.rooms.find(r => r.id === targetId);
      if (room) {
        room.itemIds = Array.from(assignedIds);
      }
    } else if (type === 'hotspot') {
      const spot = appState.sitePlanHotspots.find(s => s.id === targetId);
      if (spot) {
        spot.itemIds = Array.from(assignedIds);
      }
    }

    appState.saveToStorage();
    appState.notify('PLAN_UPDATED');
  }

  closeAssignModal() {
    document.querySelector('#assign-modal')?.classList.remove('open');
    document.querySelector('#modal-overlay')?.classList.remove('open');
    this.activeAssignTarget = null;
  }

  openUnassignedDrawer() {
    const unassigned = appState.getUnassignedItems(true);
    const drawerEl = document.querySelector('#detail-drawer');
    const overlayEl = document.querySelector('#drawer-overlay');
    if (!drawerEl) return;

    drawerEl.innerHTML = `
      <div class="drawer-header">
        <h2 class="drawer-title">Éléments non assignés (${unassigned.length})</h2>
        <button type="button" class="drawer-close-btn" id="btn-close-drawer">×</button>
      </div>

      <div class="drawer-body">
        <p class="text-muted small">Ces éléments intérieurs ne sont encore assignés à aucune pièce. Cliquez sur une pièce dans le plan d'étage pour les ajouter.</p>
        <div class="unassigned-items-list">
          ${unassigned.map(item => `
            <div class="mini-item-row" data-item-id="${item.id}">
              <div class="mini-item-info">
                <span class="mini-item-zone">${item.zone}</span>
                <span class="mini-item-title">${item.article}</span>
              </div>
              ${this.renderBadge(item.colorKey)}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    drawerEl.classList.add('open');
    overlayEl.classList.add('open');

    drawerEl.querySelector('#btn-close-drawer')?.addEventListener('click', () => this.closeDetailDrawer());
    this.bindCardClicks(drawerEl);
  }

  bindCardClicks(container) {
    container.querySelectorAll('[data-item-id]').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('.progress-dropdown') || e.target.closest('button')) return;
        const itemId = el.getAttribute('data-item-id');
        this.openDetailDrawer(itemId);
      });
    });

    container.querySelectorAll('.progress-pill').forEach(pill => {
      pill.addEventListener('click', e => {
        e.stopPropagation();
        const wrapper = pill.closest('.progress-dropdown');
        const itemId = wrapper.getAttribute('data-item-id');
        const curr = appState.getItemProgress(itemId);
        let next = ITEM_PROGRESS.PLANNED;
        if (curr === ITEM_PROGRESS.TODO) next = ITEM_PROGRESS.PLANNED;
        else if (curr === ITEM_PROGRESS.PLANNED) next = ITEM_PROGRESS.DONE;
        else if (curr === ITEM_PROGRESS.DONE) next = ITEM_PROGRESS.TODO;
        appState.setItemProgress(itemId, next);
      });
    });
  }
}
