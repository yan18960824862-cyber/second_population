/* A true continuous view of the existing procedural mesh. No image-plane rotation. */
(function () {
  'use strict';
  class ArchiveInspection {
    constructor(dialog) {
      this.dialog = dialog;
      this.canvas = dialog.querySelector('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.toggle = dialog.querySelector('[data-action="rotate"]');
      this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.yaw = -.62; this.zoom = 1; this.raf = null; this.drag = null;
      this.resizeObserver = new ResizeObserver(() => this.draw());
      this.resizeObserver.observe(this.canvas);
      dialog.querySelector('[data-action="close"]').addEventListener('click', () => this.close());
      dialog.querySelector('[data-action="reset"]').addEventListener('click', () => { this.yaw = this.homeYaw; this.zoom = 1; this.draw(); });
      this.toggle.addEventListener('click', () => this.setAuto(!this.auto));
      dialog.querySelectorAll('[data-turn]').forEach(button => button.addEventListener('click', () => this.turn(Number(button.dataset.turn))));
      this.canvas.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        this.setAuto(false); this.drag = { id: e.pointerId, x: e.clientX };
        this.canvas.setPointerCapture(e.pointerId);
      });
      this.canvas.addEventListener('pointermove', e => {
        if (!this.drag || this.drag.id !== e.pointerId) return;
        this.yaw += (e.clientX - this.drag.x) * .008; this.drag.x = e.clientX; this.draw();
      });
      const end = () => { this.drag = null; };
      this.canvas.addEventListener('pointerup', end);
      this.canvas.addEventListener('pointercancel', end);
      this.canvas.addEventListener('lostpointercapture', end);
      this.canvas.addEventListener('wheel', e => {
        e.preventDefault(); this.zoom = Math.max(.7, Math.min(1.4, this.zoom - e.deltaY * .001)); this.draw();
      }, { passive: false });
      dialog.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation();
        if (e.key === ' ') this.setAuto(!this.auto);
        else this.turn(e.key === 'ArrowLeft' ? -.22 : .22);
      });
      dialog.addEventListener('close', () => { this.stop(); this.onClose?.(); });
      this.reduced.addEventListener('change', () => { if (this.reduced.matches) this.setAuto(false); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.stopLoop(); else if (this.dialog.open && this.auto) this.startLoop();
      });
    }
    open(obj) {
      this.stop();
      this.model = window.ModelEngine.buildModel(obj.category, window.ArchiveCatalog.subtype(obj));
      this.dialog.querySelector('[data-inspection-title]').textContent = obj.objectId + ' / ' + obj.label;
      this.canvas.setAttribute('aria-label', obj.label + '三维示意模型，左右方向键旋转');
      this.homeYaw = obj.category === 'person' ? -3.1 : -.62;
      this.yaw = this.homeYaw; this.zoom = 1;
      this.dialog.showModal(); this.draw(); this.setAuto(!this.reduced.matches);
    }
    turn(amount) { this.setAuto(false); this.yaw += amount; this.draw(); }
    setAuto(value) {
      this.auto = !!value;
      this.toggle.textContent = this.auto ? 'PAUSE ROTATION' : 'AUTO ROTATE';
      this.toggle.setAttribute('aria-pressed', String(this.auto));
      this.stopLoop(); if (this.auto && this.dialog.open && !document.hidden) this.startLoop();
    }
    startLoop() {
      if (this.raf !== null) return;
      this.last = null;
      const tick = time => {
        this.raf = null;
        if (!this.dialog.open || !this.auto || document.hidden) return;
        if (this.last !== null) this.yaw += Math.min(time - this.last, 50) * .00022;
        this.last = time; this.draw(); this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }
    draw() {
      if (!this.dialog.open || !this.model) return;
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (this.canvas.width !== Math.round(w*dpr) || this.canvas.height !== Math.round(h*dpr)) {
        this.canvas.width = Math.round(w*dpr); this.canvas.height = Math.round(h*dpr);
      }
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.clearRect(0, 0, w, h);
      // renderSolid without archive:true uses geometry, never the dossier bitmap.
      this.ctx.save(); this.ctx.translate(w/2, h/2); this.ctx.scale(this.zoom, this.zoom); this.ctx.translate(-w/2, -h/2);
      const options = { w, h, yaw: this.yaw, pitch: .16, time: 0, completion: 1, opacity: 1 };
      if (this.model.detailKind === 'rider' && window.RiderGeometry) window.RiderGeometry.render(this.ctx, this.model, options);
      else window.ModelEngine.renderSolid(this.ctx, this.model, options);
      this.ctx.restore();
    }
    stopLoop() { if (this.raf !== null) cancelAnimationFrame(this.raf); this.raf = null; this.last = null; }
    stop() { this.stopLoop(); this.auto = false; this.drag = null; }
    close() { this.stop(); if (this.dialog.open) this.dialog.close(); }
  }
  window.ArchiveInspection = ArchiveInspection;
})();
