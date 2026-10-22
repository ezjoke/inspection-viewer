/**
 * Inspection Viewer — entry point (ES module).
 * Start screen, navigation, backup / sharing dialog.
 */

import { appState } from './state.js';
import { ViewsManager } from './views.js';

const DEMO_URL = 'demo/demo-site.inspection.json';
const DEFAULT_TITLE = 'Visualiseur d’inspection';

const escapeHtml = (str) =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class App {
  constructor() {
    this.mainContent = document.querySelector('#main-view-content');
    this.navLinks = document.querySelectorAll('.nav-link');
    this.viewsManager = new ViewsManager(this.mainContent);
    this.storageWarned = false;
    this.init();
  }

  init() {
    this.bindGlobalEvents();
    appState.subscribe((event, payload) => this.handleStateChange(event, payload));

    if (appState.restoreFromStorage()) {
      this.switchView('dashboard');
    } else {
      this.showStartScreen();
    }

    const src = new URLSearchParams(location.search).get('src');
    if (src) {
      // Drop the parameter so a reload does not fetch (and overwrite) again.
      const url = new URL(location.href);
      url.searchParams.delete('src');
      history.replaceState(null, '', url);
      this.openFromUrl(src);
    }
  }

  // ---------- start screen ----------

  showStartScreen(errorMessage = '') {
    this.updateChrome();
    this.mainContent.innerHTML = `
      <div class="empty-state start-screen">
        <h2>Bienvenue</h2>
        <p class="text-muted">
          Ce visualiseur fonctionne entièrement dans votre navigateur. Vos données restent sur cet appareil
          et ne sont envoyées nulle part.
        </p>
        ${errorMessage ? `<p class="error-text" role="alert">${escapeHtml(errorMessage)}</p>` : ''}
        <div class="backup-actions-grid">
          <div class="backup-action-card">
            <h4>Découvrir avec un exemple</h4>
            <p class="small text-muted">Ouvre un site fictif pour essayer toutes les fonctions.</p>
            <button type="button" class="btn btn-primary" id="btn-open-demo">Ouvrir l’exemple</button>
          </div>
          <div class="backup-action-card">
            <h4>Ouvrir un fichier de site</h4>
            <p class="small text-muted">Un fichier <code>.inspection.json</code> exporté depuis ce visualiseur.</p>
            <input type="file" id="start-file-input" accept=".json,application/json" style="display: none;">
            <button type="button" class="btn btn-outline" id="btn-open-file">Choisir un fichier</button>
          </div>
        </div>
      </div>
    `;

    this.mainContent.querySelector('#btn-open-demo')?.addEventListener('click', () => this.openDemo());
    const input = this.mainContent.querySelector('#start-file-input');
    this.mainContent.querySelector('#btn-open-file')?.addEventListener('click', () => input?.click());
    input?.addEventListener('change', (e) => this.openFile(e.target.files?.[0]));
  }

  async openDemo() {
    try {
      const res = await fetch(DEMO_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      appState.loadSite(await res.json());
    } catch (err) {
      this.showStartScreen(`Impossible d’ouvrir l’exemple : ${err.message}`);
    }
  }

  /** Route C: open a site package from an https URL (the host must allow CORS; Google Drive does not). */
  async openFromUrl(src) {
    let parsed;
    try {
      parsed = new URL(src);
    } catch {
      return this.reportLoadError('Adresse invalide.');
    }
    if (parsed.protocol !== 'https:') return this.reportLoadError('Seules les adresses https:// sont acceptées.');

    if (appState.hasSite && !confirm(
      `Remplacer le site « ${appState.site.name} » par le fichier de ${parsed.host} ?\nExportez d’abord le site actuel si vous voulez le garder.`)) {
      return;
    }

    let text;
    try {
      const res = await fetch(parsed, { credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } catch (err) {
      const reason = err instanceof TypeError
        ? 'Le serveur n’autorise pas le chargement direct (CORS) ou est injoignable. Téléchargez le fichier, puis utilisez « Ouvrir un fichier ».'
        : err.message;
      return this.reportLoadError(`Chargement impossible : ${reason}`);
    }
    try {
      appState.loadSite(JSON.parse(text));
    } catch (err) {
      this.reportLoadError(err instanceof SyntaxError ? 'Le fichier n’est pas un JSON valide.' : err.message);
    }
  }

  openFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => this.reportLoadError('Lecture du fichier impossible.');
    reader.onload = (ev) => {
      try {
        appState.loadSite(JSON.parse(ev.target.result));
        this.closeBackupModal();
      } catch (err) {
        this.reportLoadError(err instanceof SyntaxError ? 'Le fichier n’est pas un JSON valide.' : err.message);
      }
    };
    reader.readAsText(file);
  }

  reportLoadError(message) {
    if (appState.hasSite) {
      alert(`Fichier refusé : ${message}\nLe site actuel n’a pas été modifié.`);
    } else {
      this.showStartScreen(message);
    }
  }

  // ---------- chrome ----------

  updateChrome() {
    const name = appState.site?.name;
    document.title = name ? `${name} — ${DEFAULT_TITLE}` : DEFAULT_TITLE;
    const titleEl = document.querySelector('#site-title');
    if (titleEl) titleEl.textContent = name || DEFAULT_TITLE;
    document.querySelector('#site-subtitle')?.classList.toggle('hidden', !name);
    document.querySelector('.app-nav')?.classList.toggle('hidden', !appState.hasSite);
    document.querySelector('#header-progress-box')?.classList.toggle('hidden', !appState.hasSite);
    document.querySelector('#btn-open-backup')?.classList.toggle('hidden', !appState.hasSite);
  }

  bindGlobalEvents() {
    this.navLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchView(link.getAttribute('data-view'));
      });
    });

    document.querySelector('#drawer-overlay')?.addEventListener('click', () => {
      this.viewsManager.closeDetailDrawer();
    });

    document.querySelector('#modal-overlay')?.addEventListener('click', () => {
      this.viewsManager.closeAssignModal();
      this.closeBackupModal();
    });

    document.querySelector('#btn-open-backup')?.addEventListener('click', () => this.openBackupModal());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.viewsManager.closeDetailDrawer();
        this.viewsManager.closeAssignModal();
        this.closeBackupModal();
      }
      if (!appState.hasSite) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) appState.redo();
        else appState.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        appState.redo();
      }
    });
  }

  // ---------- views ----------

  switchView(viewName) {
    appState.currentView = viewName;
    this.navLinks.forEach((link) => {
      link.classList.toggle('active', link.getAttribute('data-view') === viewName);
    });
    this.renderCurrentView();
  }

  renderCurrentView() {
    this.updateChrome();
    if (!appState.hasSite) {
      this.showStartScreen();
      return;
    }
    const vm = this.viewsManager;
    switch (appState.currentView) {
      case 'zones': vm.renderZonesView(this.mainContent); break;
      case 'trades': vm.renderTradesView(this.mainContent); break;
      case 'site_plan': vm.renderSitePlanView(this.mainContent); break;
      case 'floor_plan': vm.renderFloorPlanView(this.mainContent); break;
      case 'admin': vm.renderAdminView(this.mainContent); break;
      default: vm.renderDashboard(this.mainContent);
    }
    this.updateGlobalHeader();
  }

  handleStateChange(event) {
    if (event === 'SITE_CLOSED') {
      this.closeBackupModal();
      this.showStartScreen();
      return;
    }
    if (event === 'STORAGE_ERROR') {
      if (!this.storageWarned) {
        this.storageWarned = true;
        alert('Impossible d’enregistrer dans ce navigateur (espace plein ou stockage désactivé). Exportez votre site pour ne rien perdre.');
      }
      return;
    }
    if (!appState.hasSite) return;

    this.updateGlobalHeader();

    if (['FILTERS_CHANGED', 'ITEM_PROGRESS_CHANGED', 'ITEM_NOTE_CHANGED', 'PLAN_UPDATED'].includes(event)) {
      if (event === 'PLAN_UPDATED' && !['site_plan', 'floor_plan'].includes(appState.currentView)) return;
      this.renderCurrentView();
    } else if (event === 'HISTORY_CHANGED') {
      const btnUndo = document.querySelector('#btn-undo-plan');
      const btnRedo = document.querySelector('#btn-redo-plan');
      if (btnUndo) btnUndo.disabled = appState.undoStack.length === 0;
      if (btnRedo) btnRedo.disabled = appState.redoStack.length === 0;
    } else if (['DATA_IMPORTED', 'DATA_LOADED'].includes(event)) {
      this.switchView('dashboard');
    }
  }

  updateGlobalHeader() {
    if (!appState.hasSite) return;
    const counts = appState.getSummaryCounts();
    const progressFill = document.querySelector('#header-progress-fill');
    const progressText = document.querySelector('#header-progress-text');
    if (!progressFill || !progressText) return;

    const actionTotal = counts.actionRequired;
    const actionDone = counts.actionRequired - counts.actionRemaining;
    const pct = actionTotal ? Math.round((actionDone / actionTotal) * 100) : 0;
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${actionDone} / ${actionTotal} travaux réglés (${pct}%)`;
  }

  // ---------- backup / sharing ----------

  openBackupModal() {
    const modalEl = document.querySelector('#backup-modal');
    const overlayEl = document.querySelector('#modal-overlay');
    if (!modalEl || !appState.hasSite) return;

    modalEl.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>Enregistrer, partager, changer de site</h3>
          <button type="button" class="btn-close-modal" id="btn-close-backup-modal" aria-label="Fermer">×</button>
        </div>

        <div class="modal-body">
          <p class="text-muted">
            Le site « ${escapeHtml(appState.site.name)} » est enregistré dans ce navigateur uniquement.
            Exportez-le pour le sauvegarder ou le partager (par exemple dans un dossier Google Drive partagé
            avec des personnes précises).
          </p>

          <div class="backup-actions-grid">
            <div class="backup-action-card">
              <h4>Exporter le site</h4>
              <p class="small text-muted">Un seul fichier avec les éléments, les plans et l’image du site.</p>
              <label class="small"><input type="checkbox" id="opt-progress" checked> Inclure l’avancement et les notes</label><br>
              <label class="small"><input type="checkbox" id="opt-image" checked> Inclure l’image du plan du site</label><br><br>
              <button type="button" class="btn btn-primary" id="btn-export-backup">Télécharger</button>
            </div>

            <div class="backup-action-card">
              <h4>Ouvrir un autre fichier</h4>
              <p class="small text-muted">Remplace le site affiché ici. Exportez d’abord si vous voulez le garder.</p>
              <input type="file" id="backup-file-input" accept=".json,application/json" style="display: none;">
              <button type="button" class="btn btn-outline" id="btn-import-trigger">Choisir un fichier</button>
            </div>
          </div>

          <div class="backup-danger-zone">
            <h4>Zone sensible</h4>
            <p class="small text-muted">Ces actions ne peuvent pas être annulées.</p>
            <button type="button" class="btn btn-sm btn-danger" id="btn-reset-progress">Effacer l’avancement</button>
            <button type="button" class="btn btn-sm btn-danger" id="btn-close-site">Retirer ce site de ce navigateur</button>
          </div>
        </div>
      </div>
    `;

    modalEl.classList.add('open');
    overlayEl.classList.add('open');

    modalEl.querySelector('#btn-close-backup-modal')?.addEventListener('click', () => this.closeBackupModal());

    modalEl.querySelector('#btn-export-backup')?.addEventListener('click', () => {
      const pkg = appState.exportSitePackage({
        includeProgress: modalEl.querySelector('#opt-progress').checked,
        includePlanImage: modalEl.querySelector('#opt-image').checked,
      });
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = appState.site.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
      a.href = url;
      a.download = `${slug}-${new Date().toISOString().slice(0, 10)}.inspection.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    const fileInput = modalEl.querySelector('#backup-file-input');
    modalEl.querySelector('#btn-import-trigger')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (e) => this.openFile(e.target.files?.[0]));

    modalEl.querySelector('#btn-reset-progress')?.addEventListener('click', () => {
      if (confirm('Effacer l’avancement, les notes et les éléments masqués de ce site ?')) {
        appState.resetProgress();
        this.closeBackupModal();
      }
    });

    modalEl.querySelector('#btn-close-site')?.addEventListener('click', () => {
      if (confirm('Retirer ce site de ce navigateur ? Exportez-le d’abord si vous voulez le conserver.')) {
        appState.closeSite();
      }
    });
  }

  closeBackupModal() {
    document.querySelector('#backup-modal')?.classList.remove('open');
    document.querySelector('#modal-overlay')?.classList.remove('open');
  }
}

new App();
