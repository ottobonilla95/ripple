import { useEffect, useId, useRef } from 'react';
import PixelBasin from './PixelBasin';
import { observeBasinScene } from './basinScene';
import { getBasinPalette, rgba } from './basinPalettes';

// An illustrated basin with a live, flat spiral of water and rising mist.
// The canvas extends above the button without changing its touch target.
function useMemoryWater(canvasRef, stirring, palette) {
  const stirringRef = useRef(stirring);
  useEffect(() => { stirringRef.current = stirring; }, [stirring]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let lastFrame = -Infinity;
    let elapsed = 0;
    let lastTime = 0;
    let visible = true;
    let surge = 0;
    let disposed = false;
    const width = 480;
    let height = 450;
    let smokeRise = 225;
    const pool = { x: 240, y: 319, rx: 178, ry: 48 };
    const liquid = document.createElement('canvas');
    liquid.width = liquid.height = 256;
    const liquidContext = liquid.getContext('2d');
    const pixels = liquidContext.createImageData(256, 256);
    const hash = (x, y) => {
      const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return value - Math.floor(value);
    };
    const noise = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y);
      let fx = x - ix, fy = y - iy;
      fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
      return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
    };
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const u = (x - 128) / 128, v = (y - 128) / 128;
      const r = Math.hypot(u, v);
      const angle = Math.atan2(v, u) + (1 - r) * 5.5;
      const nx = Math.cos(angle) * r * 4 + 7;
      const ny = Math.sin(angle) * r * 4 + 11;
      const cloud = noise(nx, ny) * .6 + noise(nx * 2.1, ny * 2.1) * .28 + noise(nx * 4.3, ny * 4.3) * .12;
      const edge = Math.max(0, Math.min(1, (1 - r) * 5));
      const i = (y * 256 + x) * 4;
      pixels.data[i] = palette.cloud[0]; pixels.data[i + 1] = palette.cloud[1]; pixels.data[i + 2] = palette.cloud[2];
      pixels.data[i + 3] = Math.max(0, cloud - .32) * 225 * edge;
    }
    liquidContext.putImageData(pixels, 0, 0);
    const haze = document.createElement('canvas');
    haze.width = haze.height = 100;
    const hctx = haze.getContext('2d');
    const glow = hctx.createRadialGradient(50, 50, 0, 50, 50, 50);
    glow.addColorStop(0, rgba(palette.light, .21));
    glow.addColorStop(.32, rgba(palette.mist, .13));
    glow.addColorStop(.72, rgba(palette.mist, .045));
    glow.addColorStop(1, rgba(palette.mist, 0));
    hctx.fillStyle = glow;
    hctx.fillRect(0, 0, 100, 100);
    const smokeGrain = hctx.getImageData(0, 0, 100, 100);
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
      smokeGrain.data[(y * 100 + x) * 4 + 3] *= .4 + noise(x * .065, y * .065) * .8;
    }
    hctx.putImageData(smokeGrain, 0, 0);

    function draw(time) {
      ctx.clearRect(0, 0, width, height);
      const energy = 1 + surge * 1.25;
      // Cloudy currents follow a circular plane, projected into the pool.
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(pool.x, pool.y, pool.rx, pool.ry, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(pool.x, pool.y);
      ctx.scale(1, pool.ry / pool.rx);
      // Overlapping cloudy sheets slowly contract and turn toward the centre.
      // The motion lives on a flat plane, without a cone or spherical lighting.
      ctx.globalCompositeOperation = 'screen';
      for (let sheet = 0; sheet < 3; sheet++) {
        const age = (time * .016 + sheet / 3) % 1;
        const radius = pool.rx * (1.65 - age * 1.2);
        ctx.save();
        ctx.rotate(time * .105 + sheet * 2.1);
        ctx.globalAlpha = Math.sin(age * Math.PI) * .85;
        ctx.drawImage(liquid, -radius, -radius, radius * 2, radius * 2);
        ctx.restore();
      }
      for (let ribbon = 0; ribbon < 7; ribbon++) {
        ctx.save();
        ctx.rotate(time * .105 + ribbon * 2.4);
        ctx.beginPath();
        for (let step = 0; step <= 100; step++) {
          const t = step / 100;
          const angle = t * Math.PI * 3 + Math.sin(t * 9 + time * .1) * .12;
          const radius = 5 + t * 168 + Math.sin(t * 18 - time * .12 + ribbon) * 3;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (!step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(palette.light, (.03 + ribbon % 3 * .012) * energy);
        ctx.lineWidth = 1.2 + ribbon % 4 * 1.8;
        ctx.shadowColor = palette.edge;
        ctx.shadowBlur = 7;
        ctx.stroke();
        ctx.restore();
      }
      // Soft, bright eddies break up the regularity of the spiral.
      for (let i = 0; i < 16; i++) {
        const age = (time * .02 + i * .618) % 1;
        const angle = time * .105 + age * 7 + i * 2.39;
        const radius = 168 * (1 - age);
        ctx.globalAlpha = Math.sin(age * Math.PI) * .22 * energy;
        ctx.drawImage(haze, Math.cos(angle) * radius - 30, Math.sin(angle) * radius - 18, 60, 36);
      }
      ctx.restore();

      // A low bank of mist comes from inside the far lip, then separates into
      // rising, irregular billows. All cloud sprites are generated in memory.
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 96; i++) {
        const age = (time * (.031 + i % 4 * .002) + i * .618) % 1;
        const lift = age * smokeRise;
        const curl = Math.sin(age * 11 - time * .15 + i % 3 * 2) * (16 + age * 47);
        const x = pool.x + Math.sin(i * 2.399) * (48 + age * 34) + curl + Math.sin(time * .12 + age * 3) * age * 24;
        const y = pool.y - 8 - lift + Math.sin(age * 12 + i) * 8;
        const size = 48 + age * 104;
        const opacity = Math.pow(Math.sin(Math.PI * age), .85) * (.42 + i % 3 * .12);
        ctx.globalAlpha = opacity * energy;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(age * 5 + i) * .8);
        ctx.drawImage(haze, -size * .65, -size * .4, size * 1.3, size * .8);
        ctx.restore();
      }

      // Fine translucent filaments curl through the broader haze.
      for (let filament = 0; filament < 5; filament++) {
        const phase = time * .17 + filament * 2.1;
        ctx.beginPath();
        for (let step = 0; step <= 72; step++) {
          const t = step / 72;
          const x = pool.x + Math.sin(filament * 2.2) * 42 + Math.sin(t * 10 + phase) * (12 + t * 46) + Math.sin(t * 18 - phase * .7) * t * 18;
          const y = pool.y - 5 - t * smokeRise + Math.sin(t * 11 + phase) * t * 7;
          if (!step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        const filamentFade = ctx.createLinearGradient(0, pool.y, 0, pool.y - smokeRise);
        filamentFade.addColorStop(0, 'transparent');
        filamentFade.addColorStop(.22, rgba(palette.light, .045 * energy));
        filamentFade.addColorStop(.48, rgba(palette.light, .075 * energy));
        filamentFade.addColorStop(1, 'transparent');
        ctx.globalAlpha = 1;
        ctx.lineWidth = 4 + filament % 3 * 2;
        ctx.strokeStyle = filamentFade;
        ctx.shadowColor = palette.edge;
        ctx.shadowBlur = 12;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      // Rare pinpoints, carried upward with the mist rather than confetti.
      for (let i = 0; i < 5; i++) {
        const age = (time * .045 + i * .382) % 1;
        ctx.globalAlpha = Math.sin(age * Math.PI) * .38;
        ctx.fillStyle = palette.spark;
        ctx.beginPath();
        ctx.arc(pool.x + Math.sin(i * 7 + age * 5) * (28 + age * 50), pool.y - age * smokeRise, .55 + i % 3 * .15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    function animate(now) {
      if (disposed || motion.matches || !visible || document.hidden) return;
      frame = requestAnimationFrame(animate);
      if (now - lastFrame < 1000 / 24) return;
      const delta = lastTime ? Math.min((now - lastTime) / 1000, .1) : 0;
      lastTime = lastFrame = now;
      surge += ((stirringRef.current ? 1 : 0) - surge) * .14;
      elapsed += delta * (1 + surge * .65);
      draw(elapsed);
    }
    function resume() {
      cancelAnimationFrame(frame);
      lastTime = 0;
      if (motion.matches) draw(5);
      else if (visible && !document.hidden) frame = requestAnimationFrame(animate);
    }
    const stopSizing = observeBasinScene(canvas, { width, poolOffset: 131, onResize: scene => {
      height = scene.height; pool.y = scene.poolY; smokeRise = scene.rise;
      draw(motion.matches ? 5 : elapsed);
    } });
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); });
    intersection.observe(canvas);
    document.addEventListener('visibilitychange', resume);
    motion.addEventListener('change', resume);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      stopSizing();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', resume);
      motion.removeEventListener('change', resume);
    };
  }, [canvasRef, palette]);
}

function SoftBasin({ stirring = false, onClick, disabled, label, palette }) {
  const canvas = useRef(null);
  const id = useId().replaceAll(':', '');
  useMemoryWater(canvas, stirring, palette);
  return <button className={`basin basin-${palette.name} ${stirring ? 'is-stirring' : ''}`} style={{ '--basin-glow-rgb': palette.mist.join(','), '--basin-edge': palette.edge }} onClick={onClick} disabled={disabled} aria-label={label}>
    <span className="basin-aura" aria-hidden="true" />
    <svg className="basin-shape" viewBox="0 0 480 250" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-body`} x1="240" y1="120" x2="240" y2="208" gradientUnits="userSpaceOnUse"><stop stopColor={palette.body[0]} /><stop offset=".35" stopColor={palette.body[2]} /><stop offset="1" stopColor={palette.body[3]} /></linearGradient>
        <linearGradient id={`${id}-rim`} x1="240" y1="56" x2="240" y2="180" gradientUnits="userSpaceOnUse"><stop stopColor={palette.rim[0]} /><stop offset=".48" stopColor={palette.rim[1]} /><stop offset="1" stopColor={palette.rim[2]} /></linearGradient>
        <radialGradient id={`${id}-water`} cx="49%" cy="48%" r="56%"><stop stopColor={palette.water[4]} /><stop offset=".42" stopColor={palette.water[2]} /><stop offset="1" stopColor={palette.water[0]} /></radialGradient>
        <linearGradient id={`${id}-edge`} x1="60" y1="145" x2="420" y2="145" gradientUnits="userSpaceOnUse"><stop stopColor={palette.edge} stopOpacity="0" /><stop offset=".5" stopColor={palette.edge} stopOpacity=".8" /><stop offset="1" stopColor={palette.edge} stopOpacity="0" /></linearGradient>
      </defs>
      <ellipse cx="240" cy="207" rx="145" ry="8" fill={palette.shadow} opacity=".3" />
      <path d="M39 119C43 164 113 205 240 207C367 205 437 164 441 119Z" fill={`url(#${id}-body)`} />
      <path d="M56 149C122 193 358 193 424 149M87 174C161 201 319 201 393 174" stroke={palette.edge} strokeOpacity=".16" />
      <ellipse cx="240" cy="119" rx="201" ry="63" fill={`url(#${id}-rim)`} stroke={palette.edge} strokeOpacity=".3" />
      <ellipse cx="240" cy="118" rx="185" ry="53" fill={palette.inner} stroke={palette.edge} strokeOpacity=".4" />
      <ellipse cx="240" cy="119" rx="178" ry="48" fill={`url(#${id}-water)`} />
      <path d="M56 122C77 185 396 185 424 122" stroke={`url(#${id}-edge)`} strokeWidth="1.2" />
    </svg>
    <canvas ref={canvas} className="basin-magic" aria-hidden="true" />
  </button>;
}

export default function MemoryBasin(props) {
  const palette = getBasinPalette();
  return new URLSearchParams(window.location.search).get('basin') === 'pixel'
    ? <PixelBasin {...props} palette={palette} /> : <SoftBasin {...props} palette={palette} />;
}
