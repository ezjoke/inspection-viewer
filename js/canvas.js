/**
 * PlanCanvas - Interactive SVG Canvas for Floor Plan and Site Plan
 * Supports pan, zoom, grid, snap, room drawing, resizing (8 handles),
 * selection, dragging, and severity badges.
 */

import { STATUS_META, SEVERITY_ORDER } from './state.js';

export class PlanCanvas {
  constructor(containerEl, options = {}) {
    this.container = containerEl;
    this.options = {
      isSitePlan: false,
      unit: 'm', // 'm' for floor plan, 'px' for site plan
      gridSize: 0.2, // 20cm default grid for floor plan
      snapToGrid: true,
      minRoomSize: 0.4, // minimum 40cm or 20px
      bgImage: null,
      planWidth: 800,
      planHeight: 600,
      ...options,
    };

    this.mode = 'select'; // 'select' | 'draw'
    this.viewBox = { x: 0, y: 0, w: 1000, h: 1000 };
    this.initialViewBox = { ...this.viewBox };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };

    this.isDrawing = false;
    this.drawStart = { x: 0, y: 0 };
    this.drawCurrent = { x: 0, y: 0 };

    this.isDraggingShape = false;
    this.dragStart = { x: 0, y: 0 };
    this.shapeOriginalPos = null;

    this.isResizing = false;
    this.resizeHandle = null;
    this.shapeOriginalBounds = null;

    this.selectedShapeId = null;
    this.shapes = []; // [{ id, name, x, y, w, h, colorKey, itemCount, itemIds }]
    this.footprint = null; // { width, height }

    // Callbacks
    this.onSelect = null;
    this.onShapeCreated = null;
    this.onShapeUpdated = null;
    this.onShapeDeleted = null;

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="plan-canvas-wrapper">
        <svg class="plan-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="1" />
            </pattern>
            <pattern id="grid-pattern-sub" width="100" height="100" patternUnits="userSpaceOnUse">
              <rect width="100" height="100" fill="url(#grid-pattern)" />
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(0,0,0,0.14)" stroke-width="1.5" />
            </pattern>
            <filter id="shape-shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.12" />
            </filter>
            <filter id="shape-active-shadow" x="-15%" y="-15%" width="130%" height="130%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.28" flood-color="#2196f3" />
            </filter>
          </defs>
          <g class="viewport-group">
            <g class="background-layer"></g>
            <g class="grid-layer"></g>
            <g class="footprint-layer"></g>
            <g class="shapes-layer"></g>
            <g class="drawing-layer"></g>
            <g class="handles-layer"></g>
          </g>
        </svg>

        <div class="canvas-controls">
          <div class="canvas-btn-group">
            <button type="button" class="btn btn-sm btn-icon btn-mode-select active" title="Mode Sélection (V)">
              <span class="icon">↖</span> Sélection
            </button>
            <button type="button" class="btn btn-sm btn-icon btn-mode-draw" title="Dessiner une pièce (D)">
              <span class="icon">⊞</span> Dessiner
            </button>
          </div>

          <div class="canvas-btn-group">
            <button type="button" class="btn btn-sm btn-icon btn-snap ${this.options.snapToGrid ? 'active' : ''}" title="Aligner sur la grille">
              <span class="icon">⌗</span> Grille
            </button>
            <button type="button" class="btn btn-sm btn-icon btn-zoom-in" title="Zoom avant (+)">
              <span class="icon">🔍+</span>
            </button>
            <button type="button" class="btn btn-sm btn-icon btn-zoom-out" title="Zoom arrière (-)">
              <span class="icon">🔍-</span>
            </button>
            <button type="button" class="btn btn-sm btn-icon btn-fit" title="Ajuster à la vue (Espace)">
              <span class="icon">⊡</span> Centrer
            </button>
          </div>
        </div>

        <div class="canvas-tooltip hidden"></div>
        <div class="canvas-measure hidden"></div>
      </div>
    `;

    this.svg = this.container.querySelector('.plan-svg');
    this.viewportGroup = this.container.querySelector('.viewport-group');
    this.bgLayer = this.container.querySelector('.background-layer');
    this.gridLayer = this.container.querySelector('.grid-layer');
    this.footprintLayer = this.container.querySelector('.footprint-layer');
    this.shapesLayer = this.container.querySelector('.shapes-layer');
    this.drawingLayer = this.container.querySelector('.drawing-layer');
    this.handlesLayer = this.container.querySelector('.handles-layer');
    this.tooltipEl = this.container.querySelector('.canvas-tooltip');
    this.measureEl = this.container.querySelector('.canvas-measure');

    this.btnSelect = this.container.querySelector('.btn-mode-select');
    this.btnDraw = this.container.querySelector('.btn-mode-draw');
    this.btnSnap = this.container.querySelector('.btn-snap');
    this.btnZoomIn = this.container.querySelector('.btn-zoom-in');
    this.btnZoomOut = this.container.querySelector('.btn-zoom-out');
    this.btnFit = this.container.querySelector('.btn-fit');
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'select') {
      this.btnSelect?.classList.add('active');
      this.btnDraw?.classList.remove('active');
      this.svg.style.cursor = 'default';
    } else {
      this.btnDraw?.classList.add('active');
      this.btnSelect?.classList.remove('active');
      this.svg.style.cursor = 'crosshair';
      this.setSelectedShape(null);
    }
  }

  setSnap(snap) {
    this.options.snapToGrid = snap;
    this.btnSnap?.classList.toggle('active', snap);
  }

  // Convert client (screen) coordinates to SVG user coordinates
  clientToSvg(clientX, clientY) {
    const pt = this.svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const transformed = pt.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  snap(val, step = null) {
    if (!this.options.snapToGrid) return Math.round(val * 100) / 100;
    const s = step || this.options.gridSize;
    return Math.round(val / s) * s;
  }

  updateViewBox() {
    this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`);
  }

  fitToView() {
    if (this.options.isSitePlan) {
      const pad = 40;
      this.viewBox = { x: -pad, y: -pad, w: this.options.planWidth + pad * 2, h: this.options.planHeight + pad * 2 };
    } else if (this.footprint) {
      const scale = 80; // 80px per meter
      const w = this.footprint.width * scale;
      const h = this.footprint.height * scale;
      const pad = 60;
      this.viewBox = { x: -pad, y: -pad, w: w + pad * 2, h: h + pad * 2 };
    } else {
      this.viewBox = { x: -40, y: -40, w: 800, h: 600 };
    }
    this.initialViewBox = { ...this.viewBox };
    this.updateViewBox();
  }

  zoomAtPoint(factor, clientX, clientY) {
    const center = this.clientToSvg(clientX, clientY);
    const newW = this.viewBox.w * factor;
    const newH = this.viewBox.h * factor;

    // Constrain zoom level
    const minDim = this.options.isSitePlan ? 200 : 200;
    const maxDim = this.options.isSitePlan ? 3000 : 4000;
    if (newW < minDim || newW > maxDim) return;

    this.viewBox.x = center.x - (center.x - this.viewBox.x) * factor;
    this.viewBox.y = center.y - (center.y - this.viewBox.y) * factor;
    this.viewBox.w = newW;
    this.viewBox.h = newH;
    this.updateViewBox();
  }

  zoomCenter(factor) {
    const cx = this.viewBox.x + this.viewBox.w / 2;
    const cy = this.viewBox.y + this.viewBox.h / 2;
    const newW = this.viewBox.w * factor;
    const newH = this.viewBox.h * factor;
    this.viewBox.x = cx - newW / 2;
    this.viewBox.y = cy - newH / 2;
    this.viewBox.w = newW;
    this.viewBox.h = newH;
    this.updateViewBox();
  }

  setData({ shapes, footprint, bgImage, planWidth, planHeight }) {
    this.shapes = shapes || [];
    this.footprint = footprint || null;
    if (bgImage !== undefined) this.options.bgImage = bgImage;
    if (planWidth) this.options.planWidth = planWidth;
    if (planHeight) this.options.planHeight = planHeight;
    this.render();
  }

  render() {
    this.renderBackground();
    this.renderFootprint();
    this.renderShapes();
    this.renderHandles();
  }

  renderBackground() {
    this.bgLayer.innerHTML = '';
    this.gridLayer.innerHTML = '';

    if (this.options.isSitePlan && this.options.bgImage) {
      // Render site plan image
      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('href', this.options.bgImage);
      img.setAttribute('x', '0');
      img.setAttribute('y', '0');
      img.setAttribute('width', String(this.options.planWidth));
      img.setAttribute('height', String(this.options.planHeight));
      img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      this.bgLayer.appendChild(img);
    } else {
      // Floor plan grid
      const scale = 80; // 80px = 1m
      const w = (this.footprint?.width || 10) * scale;
      const h = (this.footprint?.height || 14) * scale;

      const gridRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      gridRect.setAttribute('x', '-200');
      gridRect.setAttribute('y', '-200');
      gridRect.setAttribute('width', `${w + 400}`);
      gridRect.setAttribute('height', `${h + 400}`);
      gridRect.setAttribute('fill', 'url(#grid-pattern-sub)');
      this.gridLayer.appendChild(gridRect);
    }
  }

  renderFootprint() {
    this.footprintLayer.innerHTML = '';
    if (this.options.isSitePlan || !this.footprint) return;

    const scale = 80;
    const w = this.footprint.width * scale;
    const h = this.footprint.height * scale;

    // Footprint background and outer wall
    const wall = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    wall.setAttribute('x', '0');
    wall.setAttribute('y', '0');
    wall.setAttribute('width', `${w}`);
    wall.setAttribute('height', `${h}`);
    wall.setAttribute('fill', '#ffffff');
    wall.setAttribute('stroke', '#334155');
    wall.setAttribute('stroke-width', '8');
    wall.setAttribute('rx', '4');
    this.footprintLayer.appendChild(wall);

    // Dimension labels
    const labelTop = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelTop.setAttribute('x', `${w / 2}`);
    labelTop.setAttribute('y', '-12');
    labelTop.setAttribute('text-anchor', 'middle');
    labelTop.setAttribute('class', 'footprint-dimension-text');
    labelTop.textContent = `Façade: ${this.footprint.width.toFixed(2)} m`;
    this.footprintLayer.appendChild(labelTop);

    const labelSide = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelSide.setAttribute('x', '-16');
    labelSide.setAttribute('y', `${h / 2}`);
    labelSide.setAttribute('text-anchor', 'middle');
    labelSide.setAttribute('transform', `rotate(-90 -16 ${h / 2})`);
    labelSide.setAttribute('class', 'footprint-dimension-text');
    labelSide.textContent = `Profondeur: ${this.footprint.height.toFixed(2)} m`;
    this.footprintLayer.appendChild(labelSide);
  }

  toSvgCoords(val) {
    return this.options.isSitePlan ? val : val * 80;
  }

  fromSvgCoords(val) {
    return this.options.isSitePlan ? val : val / 80;
  }

  renderShapes() {
    this.shapesLayer.innerHTML = '';

    for (const shape of this.shapes) {
      if (shape.isBackground) continue; // Skip full background shapes
      const isSelected = shape.id === this.selectedShapeId;
      const sx = this.toSvgCoords(shape.x);
      const sy = this.toSvgCoords(shape.y);
      const sw = this.toSvgCoords(shape.w);
      const sh = this.toSvgCoords(shape.h);

      const worstColor = shape.colorKey || 'vert';
      const meta = STATUS_META[worstColor] || STATUS_META.vert;
      const itemCount = shape.itemIds ? shape.itemIds.length : 0;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', `plan-shape ${isSelected ? 'selected' : ''}`);
      g.setAttribute('data-id', shape.id);
      g.setAttribute('transform', `translate(${sx}, ${sy})`);

      // Rectangle
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', '0');
      rect.setAttribute('width', `${Math.max(10, sw)}`);
      rect.setAttribute('height', `${Math.max(10, sh)}`);
      rect.setAttribute('rx', '4');

      const fillHex = meta.color || '#E8F5E9';
      rect.setAttribute('fill', fillHex);
      rect.setAttribute('fill-opacity', isSelected ? '0.75' : '0.45');
      rect.setAttribute('stroke', isSelected ? '#1976d2' : meta.borderColor || '#333');
      rect.setAttribute('stroke-width', isSelected ? '3' : '2');
      if (isSelected) {
        rect.setAttribute('filter', 'url(#shape-active-shadow)');
      } else {
        rect.setAttribute('filter', 'url(#shape-shadow)');
      }
      g.appendChild(rect);

      // Room Name
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', `${sw / 2}`);
      text.setAttribute('y', `${Math.min(sh / 2, 28)}`);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('class', 'room-title-text');
      text.textContent = shape.name || 'Pièce';
      g.appendChild(text);

      // Dimension subtext for floor plan
      if (!this.options.isSitePlan && sw > 50 && sh > 45) {
        const dimText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        dimText.setAttribute('x', `${sw / 2}`);
        dimText.setAttribute('y', `${Math.min(sh / 2 + 18, sh - 10)}`);
        dimText.setAttribute('text-anchor', 'middle');
        dimText.setAttribute('class', 'room-dim-text');
        dimText.textContent = `${shape.w.toFixed(2)}m × ${shape.h.toFixed(2)}m`;
        g.appendChild(dimText);
      }

      // Badge for item count
      if (itemCount > 0 && sw > 30 && sh > 25) {
        const badgeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        badgeG.setAttribute('class', 'room-badge-group');
        badgeG.setAttribute('transform', `translate(${Math.max(10, sw - 28)}, 8)`);

        const badgeBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        badgeBg.setAttribute('cx', '10');
        badgeBg.setAttribute('cy', '10');
        badgeBg.setAttribute('r', '11');
        badgeBg.setAttribute('fill', meta.borderColor || '#d9534f');
        badgeBg.setAttribute('stroke', '#ffffff');
        badgeBg.setAttribute('stroke-width', '2');
        badgeG.appendChild(badgeBg);

        const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        badgeText.setAttribute('x', '10');
        badgeText.setAttribute('y', '14');
        badgeText.setAttribute('text-anchor', 'middle');
        badgeText.setAttribute('class', 'room-badge-text');
        badgeText.setAttribute('fill', '#ffffff');
        badgeText.textContent = `${itemCount}`;
        badgeG.appendChild(badgeText);

        g.appendChild(badgeG);
      }

      this.shapesLayer.appendChild(g);
    }
  }

  renderHandles() {
    this.handlesLayer.innerHTML = '';
    if (!this.selectedShapeId || this.mode !== 'select') return;

    const shape = this.shapes.find(s => s.id === this.selectedShapeId);
    if (!shape) return;

    const sx = this.toSvgCoords(shape.x);
    const sy = this.toSvgCoords(shape.y);
    const sw = this.toSvgCoords(shape.w);
    const sh = this.toSvgCoords(shape.h);

    const handles = [
      { name: 'nw', x: sx, y: sy, cursor: 'nwse-resize' },
      { name: 'n', x: sx + sw / 2, y: sy, cursor: 'ns-resize' },
      { name: 'ne', x: sx + sw, y: sy, cursor: 'nesw-resize' },
      { name: 'e', x: sx + sw, y: sy + sh / 2, cursor: 'ew-resize' },
      { name: 'se', x: sx + sw, y: sy + sh, cursor: 'nwse-resize' },
      { name: 's', x: sx + sw / 2, y: sy + sh, cursor: 'ns-resize' },
      { name: 'sw', x: sx, y: sy + sh, cursor: 'nesw-resize' },
      { name: 'w', x: sx, y: sy + sh / 2, cursor: 'ew-resize' },
    ];

    const hGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    hGroup.setAttribute('class', 'handles-group');

    for (const h of handles) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', `${h.x}`);
      circle.setAttribute('cy', `${h.y}`);
      circle.setAttribute('r', '6');
      circle.setAttribute('fill', '#ffffff');
      circle.setAttribute('stroke', '#1976d2');
      circle.setAttribute('stroke-width', '2');
      circle.setAttribute('class', 'resize-handle');
      circle.setAttribute('data-handle', h.name);
      circle.style.cursor = h.cursor;
      hGroup.appendChild(circle);
    }

    this.handlesLayer.appendChild(hGroup);
  }

  setSelectedShape(shapeId) {
    this.selectedShapeId = shapeId;
    this.renderShapes();
    this.renderHandles();
    if (this.onSelect) {
      this.onSelect(shapeId ? this.shapes.find(s => s.id === shapeId) : null);
    }
  }

  bindEvents() {
    // Mode toggles
    this.btnSelect?.addEventListener('click', () => this.setMode('select'));
    this.btnDraw?.addEventListener('click', () => this.setMode('draw'));
    this.btnSnap?.addEventListener('click', () => this.setSnap(!this.options.snapToGrid));
    this.btnZoomIn?.addEventListener('click', () => this.zoomCenter(0.8));
    this.btnZoomOut?.addEventListener('click', () => this.zoomCenter(1.25));
    this.btnFit?.addEventListener('click', () => this.fitToView());

    // SVG Pointer events
    this.svg.addEventListener('pointerdown', e => this.handlePointerDown(e));
    window.addEventListener('pointermove', e => this.handlePointerMove(e));
    window.addEventListener('pointerup', e => this.handlePointerUp(e));

    // Wheel zoom
    this.svg.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.15 : 0.85;
      this.zoomAtPoint(factor, e.clientX, e.clientY);
    }, { passive: false });

    // Keyboard shortcuts
    window.addEventListener('keydown', e => {
      if (!this.container.isConnected || !this.selectedShapeId) return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      const shape = this.shapes.find(s => s.id === this.selectedShapeId);
      if (!shape) return;

      const step = e.shiftKey ? (this.options.isSitePlan ? 20 : 0.5) : (this.options.isSitePlan ? 5 : 0.1);

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        shape.x = Math.max(0, this.snap(shape.x - step));
        this.notifyShapeUpdated(shape);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        shape.x = this.snap(shape.x + step);
        this.notifyShapeUpdated(shape);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        shape.y = Math.max(0, this.snap(shape.y - step));
        this.notifyShapeUpdated(shape);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        shape.y = this.snap(shape.y + step);
        this.notifyShapeUpdated(shape);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (this.onShapeDeleted) this.onShapeDeleted(this.selectedShapeId);
      } else if (e.key === 'Escape') {
        this.setSelectedShape(null);
        this.setMode('select');
      }
    });
  }

  handlePointerDown(e) {
    if (e.button === 1 || e.spaceKey) {
      // Middle click or Space+click = pan
      this.isPanning = true;
      this.panStart = { x: e.clientX, y: e.clientY };
      this.svg.style.cursor = 'grabbing';
      return;
    }

    const svgPoint = this.clientToSvg(e.clientX, e.clientY);

    // Check if clicked on a resize handle
    const handleEl = e.target.closest('.resize-handle');
    if (handleEl && this.selectedShapeId) {
      this.isResizing = true;
      this.resizeHandle = handleEl.getAttribute('data-handle');
      const shape = this.shapes.find(s => s.id === this.selectedShapeId);
      this.shapeOriginalBounds = { ...shape };
      this.dragStart = { ...svgPoint };
      e.stopPropagation();
      return;
    }

    // Check if clicked on a shape
    const shapeEl = e.target.closest('.plan-shape');
    if (shapeEl && this.mode === 'select') {
      const shapeId = shapeEl.getAttribute('data-id');
      this.setSelectedShape(shapeId);
      this.isDraggingShape = true;
      const shape = this.shapes.find(s => s.id === shapeId);
      this.shapeOriginalPos = { x: shape.x, y: shape.y };
      this.dragStart = { ...svgPoint };
      e.stopPropagation();
      return;
    }

    // Clicked on blank background
    if (this.mode === 'draw') {
      this.isDrawing = true;
      const sx = this.fromSvgCoords(svgPoint.x);
      const sy = this.fromSvgCoords(svgPoint.y);
      this.drawStart = { x: this.snap(sx), y: this.snap(sy) };
      this.drawCurrent = { ...this.drawStart };
    } else {
      // Pan canvas
      this.setSelectedShape(null);
      this.isPanning = true;
      this.panStart = { x: e.clientX, y: e.clientY };
      this.svg.style.cursor = 'grabbing';
    }
  }

  handlePointerMove(e) {
    if (this.isPanning) {
      const dx = (e.clientX - this.panStart.x) * (this.viewBox.w / this.svg.clientWidth);
      const dy = (e.clientY - this.panStart.y) * (this.viewBox.h / this.svg.clientHeight);
      this.viewBox.x -= dx;
      this.viewBox.y -= dy;
      this.panStart = { x: e.clientX, y: e.clientY };
      this.updateViewBox();
      return;
    }

    const svgPoint = this.clientToSvg(e.clientX, e.clientY);

    if (this.isDrawing) {
      const sx = this.fromSvgCoords(svgPoint.x);
      const sy = this.fromSvgCoords(svgPoint.y);
      this.drawCurrent = { x: this.snap(sx), y: this.snap(sy) };
      this.renderDrawingPreview();
      return;
    }

    if (this.isDraggingShape && this.selectedShapeId) {
      const shape = this.shapes.find(s => s.id === this.selectedShapeId);
      if (!shape) return;
      const dx = this.fromSvgCoords(svgPoint.x - this.dragStart.x);
      const dy = this.fromSvgCoords(svgPoint.y - this.dragStart.y);

      let newX = this.snap(this.shapeOriginalPos.x + dx);
      let newY = this.snap(this.shapeOriginalPos.y + dy);

      // Floor plan bounds clamping
      if (!this.options.isSitePlan && this.footprint) {
        newX = Math.max(0, Math.min(this.footprint.width - shape.w, newX));
        newY = Math.max(0, Math.min(this.footprint.height - shape.h, newY));
      } else {
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);
      }

      shape.x = newX;
      shape.y = newY;
      this.renderShapes();
      this.renderHandles();
      return;
    }

    if (this.isResizing && this.selectedShapeId) {
      const shape = this.shapes.find(s => s.id === this.selectedShapeId);
      if (!shape) return;
      const dx = this.fromSvgCoords(svgPoint.x - this.dragStart.x);
      const dy = this.fromSvgCoords(svgPoint.y - this.dragStart.y);
      const orig = this.shapeOriginalBounds;

      let { x, y, w, h } = orig;
      const min = this.options.minRoomSize;

      if (this.resizeHandle.includes('e')) w = Math.max(min, this.snap(orig.w + dx));
      if (this.resizeHandle.includes('s')) h = Math.max(min, this.snap(orig.h + dy));
      if (this.resizeHandle.includes('w')) {
        const potentialW = this.snap(orig.w - dx);
        if (potentialW >= min) {
          w = potentialW;
          x = this.snap(orig.x + dx);
        }
      }
      if (this.resizeHandle.includes('n')) {
        const potentialH = this.snap(orig.h - dy);
        if (potentialH >= min) {
          h = potentialH;
          y = this.snap(orig.y + dy);
        }
      }

      shape.x = Math.max(0, x);
      shape.y = Math.max(0, y);
      shape.w = w;
      shape.h = h;

      this.renderShapes();
      this.renderHandles();
    }
  }

  handlePointerUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.svg.style.cursor = this.mode === 'draw' ? 'crosshair' : 'default';
    }

    if (this.isDrawing) {
      this.isDrawing = false;
      this.drawingLayer.innerHTML = '';

      const x = Math.min(this.drawStart.x, this.drawCurrent.x);
      const y = Math.min(this.drawStart.y, this.drawCurrent.y);
      const w = Math.abs(this.drawCurrent.x - this.drawStart.x);
      const h = Math.abs(this.drawCurrent.y - this.drawStart.y);

      if (w >= this.options.minRoomSize && h >= this.options.minRoomSize) {
        if (this.onShapeCreated) {
          this.onShapeCreated({ x, y, w, h });
        }
      }
    }

    if (this.isDraggingShape) {
      this.isDraggingShape = false;
      const shape = this.shapes.find(s => s.id === this.selectedShapeId);
      if (shape) this.notifyShapeUpdated(shape);
    }

    if (this.isResizing) {
      this.isResizing = false;
      const shape = this.shapes.find(s => s.id === this.selectedShapeId);
      if (shape) this.notifyShapeUpdated(shape);
    }
  }

  renderDrawingPreview() {
    this.drawingLayer.innerHTML = '';
    const x = Math.min(this.drawStart.x, this.drawCurrent.x);
    const y = Math.min(this.drawStart.y, this.drawCurrent.y);
    const w = Math.abs(this.drawCurrent.x - this.drawStart.x);
    const h = Math.abs(this.drawCurrent.y - this.drawStart.y);

    const sx = this.toSvgCoords(x);
    const sy = this.toSvgCoords(y);
    const sw = this.toSvgCoords(w);
    const sh = this.toSvgCoords(h);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', `${sx}`);
    rect.setAttribute('y', `${sy}`);
    rect.setAttribute('width', `${sw}`);
    rect.setAttribute('height', `${sh}`);
    rect.setAttribute('fill', 'rgba(33, 150, 243, 0.25)');
    rect.setAttribute('stroke', '#2196f3');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('stroke-dasharray', '5,5');
    this.drawingLayer.appendChild(rect);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', `${sx + sw / 2}`);
    text.setAttribute('y', `${sy + sh / 2}`);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('class', 'draw-measure-text');
    text.textContent = this.options.isSitePlan
      ? `${Math.round(w)} × ${Math.round(h)} px`
      : `${w.toFixed(2)} m × ${h.toFixed(2)} m`;
    this.drawingLayer.appendChild(text);
  }

  notifyShapeUpdated(shape) {
    this.renderShapes();
    this.renderHandles();
    if (this.onShapeUpdated) this.onShapeUpdated(shape);
  }
}
