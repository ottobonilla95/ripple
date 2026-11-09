import { useEffect, useRef } from 'react';
import { observeBasinScene } from './basinScene';
import { rgba } from './basinPalettes';

// A deliberately small sprite canvas, enlarged without smoothing. Everything,
// including the smoke, stays on this same pixel grid and restricted palette.
export default function PixelBasin({ stirring = false, onClick, disabled, label, palette }) {
  const canvas = useRef(null);
  const active = useRef(stirring);
  useEffect(() => { active.current = stirring; }, [stirring]);
  useEffect(() => {
    const ctx = canvas.current.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const water = palette.water;
    const mistColor = rgba(palette.mist, 1);
    const lightColor = rgba(palette.light, 1);
    const dither = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    let frame = 0, previous = 0, time = 0, lastPaint = -Infinity;
    let visible = true, disposed = false, energy = 0;
    let height = 150, poolY = 106, smokeRise = 75;
    const pixel = (x, y, color, alpha = 1, size = 1) => {
      ctx.fillStyle = color; ctx.globalAlpha = alpha;
      ctx.fillRect(Math.round(x), Math.round(y), size, size);
    };
    function draw(t) {
      ctx.clearRect(0, 0, 160, height);
      ctx.save();
      ctx.translate(0, height - 150);
      // Stepped silhouette and small bands give the bowl a quiet, old-game feel.
      for (let y = 108; y <= 137; y++) {
        const depth = (y - 108) / 31;
        const half = Math.round(67 * (1 - depth ** 1.65 * .68));
        const color = palette.body[y < 120 ? 0 : y < 126 ? 1 : y < 133 ? 2 : 3];
        ctx.globalAlpha = 1; ctx.fillStyle = color;
        ctx.fillRect(80 - half, y, half * 2, 1);
        if (y === 125 || y === 132) {
          ctx.fillStyle = palette.rim[1];
          ctx.fillRect(83 - half, y, half * 2 - 6, 1);
        }
      }
      for (let y = 84; y <= 128; y++) for (let x = 12; x <= 148; x++) {
        const outer = ((x - 80) / 67) ** 2 + ((y - 106) / 21) ** 2;
        if (outer > 1) continue;
        const inner = ((x - 80) / 60) ** 2 + ((y - 106) / 16) ** 2;
        let color;
        if (inner <= 1) {
          const u = (x - 80) / 60, v = (y - 106) / 16;
          const radius = Math.hypot(u, v);
          const angle = Math.atan2(v, u);
          // Logarithmic arms turn gently and travel inward, like a slow whirlpool.
          const spiral = angle - Math.log(radius + .12) * 3.2 - t * .12;
          let shade = .47 + Math.sin(spiral * 3) * .24 + Math.sin(spiral * 5 + radius * 9) * .12;
          shade += (dither[(y % 4) * 4 + x % 4] / 15 - .5) * .13;
          shade -= Math.max(0, radius - .8) * .85;
          color = water[Math.max(0, Math.min(4, Math.floor(shade * 5)))];
        } else if (inner < 1.17) color = palette.inner;
        else if (outer > .94) color = y > 106 ? palette.rim[1] : palette.edge;
        else if (y < 100) color = (x + y) % 7 === 0 ? palette.rim[2] : palette.rim[0];
        else if (y > 118) color = (x + y) % 9 === 0 ? palette.rim[3] : palette.rim[2];
        else color = palette.rim[1];
        pixel(x, y, color);
      }
      // A few short carved marks instead of noisy all-over surface texture.
      for (const [x, y] of [[45, 91], [64, 87], [96, 87], [116, 92]]) {
        pixel(x, y, palette.carving); pixel(x + 1, y + 1, palette.carving); pixel(x, y + 2, palette.rim[3]);
      }
      ctx.restore();
      // Pixel smoke has a broad, dithered edge and a finer curling centre.
      for (let wisp = 0; wisp < 5; wisp++) {
        const phase = t * .25 + wisp * 2.2;
        for (let step = 0; step < smokeRise; step++) {
          const age = step / smokeRise;
          const y = poolY - 2 - step;
          const x = 80 + (wisp - 2) * 8 + Math.sin(age * 10 + phase) * (4 + age * 20) + Math.sin(age * 17 - phase) * age * 7;
          const density = Math.sin(age * Math.PI) ** .8 * (.65 + .15 * Math.sin(age * 12 - t * .3));
          const spread = 2 + Math.round(Math.sin(age * Math.PI) * 5);
          for (let offset = -spread; offset <= spread; offset++) {
            const edge = 1 - Math.abs(offset) / (spread + 1);
            const alpha = density * edge * (.2 + energy * .08);
            if (Math.abs(offset) > 1 && ((step + offset + wisp) % 3 === 0)) continue;
            pixel(x + offset, y, offset === 0 ? lightColor : mistColor, Math.round(alpha * 12) / 12);
          }
          if (step % 5 === 0 && age < .85) pixel(x + spread + 2, y + 1, mistColor, density * .13);
        }
      }
      // Sparse star-shaped sparks, with a slow, staggered shimmer.
      for (let i = 0; i < 3; i++) {
        const age = (t * .035 + i * .33) % 1;
        const x = Math.round(80 + Math.sin(i * 4 + age * 4) * (20 + age * 12));
        const y = Math.round(poolY - 5 - age * smokeRise);
        const alpha = Math.sin(age * Math.PI) ** 3 * .7;
        pixel(x, y, palette.spark, alpha);
        if (alpha > .55) {
          pixel(x - 1, y, palette.edge, alpha * .5); pixel(x + 1, y, palette.edge, alpha * .5);
          pixel(x, y - 1, palette.edge, alpha * .5); pixel(x, y + 1, palette.edge, alpha * .5);
        }
      }
      ctx.globalAlpha = 1;
    }
    function animate(now) {
      if (disposed || motion.matches || !visible || document.hidden) return;
      frame = requestAnimationFrame(animate);
      if (now - lastPaint < 1000 / 12) return;
      const delta = previous ? Math.min((now - previous) / 1000, .15) : 0;
      previous = lastPaint = now;
      energy += ((active.current ? 1 : 0) - energy) * .18;
      time += delta * (1 + energy * .5);
      draw(time);
    }
    function resume() {
      cancelAnimationFrame(frame); previous = 0;
      if (motion.matches) draw(6);
      else if (visible && !document.hidden) frame = requestAnimationFrame(animate);
    }
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); });
    const stopSizing = observeBasinScene(canvas.current, { width: 160, poolOffset: 44, pixelated: true, onResize: scene => {
      height = scene.height; poolY = scene.poolY; smokeRise = scene.rise;
      draw(motion.matches ? 6 : time);
    } });
    intersection.observe(canvas.current);
    motion.addEventListener('change', resume);
    document.addEventListener('visibilitychange', resume);
    draw(0);
    return () => {
      disposed = true; cancelAnimationFrame(frame); intersection.disconnect(); stopSizing();
      motion.removeEventListener('change', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [palette]);
  return <button className={`basin pixel-basin basin-${palette.name} ${stirring ? 'is-stirring' : ''}`} style={{ '--basin-glow-rgb': palette.mist.join(','), '--basin-edge': palette.edge }} disabled={disabled} onClick={onClick} aria-label={label}>
    <canvas ref={canvas} width="160" height="150" className="basin-magic pixel-basin-art" aria-hidden="true" />
  </button>;
}
