import { useEffect, useRef } from 'react';

// A deliberately small sprite canvas, enlarged without smoothing. Everything,
// including the smoke, stays on this same pixel grid and restricted palette.
export default function PixelBasin({ stirring = false, onClick, disabled, label }) {
  const canvas = useRef(null);
  const active = useRef(stirring);
  useEffect(() => { active.current = stirring; }, [stirring]);
  useEffect(() => {
    const ctx = canvas.current.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const water = ['#29465d', '#42667d', '#60899e', '#8eb5c4', '#c6e1e7'];
    const dither = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    let frame = 0, previous = 0, time = 0, lastPaint = -Infinity;
    let visible = true, disposed = false, energy = 0;
    const pixel = (x, y, color, alpha = 1, size = 1) => {
      ctx.fillStyle = color; ctx.globalAlpha = alpha;
      ctx.fillRect(Math.round(x), Math.round(y), size, size);
    };
    function draw(t) {
      ctx.clearRect(0, 0, 160, 150);
      // Stepped silhouette and small bands give the bowl a quiet, old-game feel.
      for (let y = 108; y <= 137; y++) {
        const depth = (y - 108) / 31;
        const half = Math.round(67 * (1 - depth ** 1.65 * .68));
        const color = y < 120 ? '#405b70' : y < 126 ? '#304a60' : y < 133 ? '#233b50' : '#192e42';
        ctx.globalAlpha = 1; ctx.fillStyle = color;
        ctx.fillRect(80 - half, y, half * 2, 1);
        if (y === 125 || y === 132) {
          ctx.fillStyle = '#4f6b7e';
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
        } else if (inner < 1.17) color = '#152d42';
        else if (outer > .94) color = y > 106 ? '#577b91' : '#9bb9c8';
        else if (y < 100) color = (x + y) % 7 === 0 ? '#8ba9ba' : '#708fa3';
        else if (y > 118) color = (x + y) % 9 === 0 ? '#a9c7d4' : '#8aaabd';
        else color = '#4e7189';
        pixel(x, y, color);
      }
      // A few short carved marks instead of noisy all-over surface texture.
      for (const [x, y] of [[45, 91], [64, 87], [96, 87], [116, 92]]) {
        pixel(x, y, '#405d73'); pixel(x + 1, y + 1, '#405d73'); pixel(x, y + 2, '#a6c4d1');
      }
      // Pixel smoke has a broad, dithered edge and a finer curling centre.
      for (let wisp = 0; wisp < 3; wisp++) {
        const phase = t * .25 + wisp * 2.2;
        for (let step = 0; step < 75; step++) {
          const age = step / 75;
          const y = 104 - step;
          const x = 80 + (wisp - 1) * 7 + Math.sin(age * 8 + phase) * (3 + age * 11) + Math.sin(age * 14 - phase) * age * 4;
          const density = Math.sin(age * Math.PI) * (.65 + .15 * Math.sin(age * 10 - t * .3));
          const spread = 1 + Math.round(Math.sin(age * Math.PI) * 3);
          for (let offset = -spread; offset <= spread; offset++) {
            const edge = 1 - Math.abs(offset) / (spread + 1);
            const alpha = density * edge * (.18 + energy * .08);
            if (Math.abs(offset) > 1 && ((step + offset + wisp) % 3 === 0)) continue;
            pixel(x + offset, y, offset === 0 ? '#b9d8e2' : '#739aaf', Math.round(alpha * 12) / 12);
          }
          if (step % 5 === 0 && age < .85) pixel(x + spread + 2, y + 1, '#89aebe', density * .13);
        }
      }
      // Sparse star-shaped sparks, with a slow, staggered shimmer.
      for (let i = 0; i < 3; i++) {
        const age = (t * .035 + i * .33) % 1;
        const x = Math.round(80 + Math.sin(i * 4 + age * 4) * 20);
        const y = Math.round(101 - age * 65);
        const alpha = Math.sin(age * Math.PI) ** 3 * .7;
        pixel(x, y, '#d4edf1', alpha);
        if (alpha > .55) {
          pixel(x - 1, y, '#8bafc3', alpha * .5); pixel(x + 1, y, '#8bafc3', alpha * .5);
          pixel(x, y - 1, '#8bafc3', alpha * .5); pixel(x, y + 1, '#8bafc3', alpha * .5);
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
    intersection.observe(canvas.current);
    motion.addEventListener('change', resume);
    document.addEventListener('visibilitychange', resume);
    draw(0);
    return () => {
      disposed = true; cancelAnimationFrame(frame); intersection.disconnect();
      motion.removeEventListener('change', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);
  return <button className={`basin pixel-basin ${stirring ? 'is-stirring' : ''}`} disabled={disabled} onClick={onClick} aria-label={label}>
    <canvas ref={canvas} width="160" height="150" className="basin-magic pixel-basin-art" aria-hidden="true" />
  </button>;
}
