// Keep the water fixed to the bowl while the mist reaches toward the header.
// Absolute canvas height never changes the layout or covers touch targets.
export function observeBasinScene(canvas, { width, poolOffset, pixelated = false, onResize }) {
  const bowl = canvas.closest('.basin');
  const ctx = canvas.getContext('2d');
  let previous = '';
  function resize() {
    const rect = bowl.getBoundingClientRect();
    if (!rect.width) return;
    const scale = rect.width / width;
    const header = document.querySelector('.app-header')?.getBoundingClientRect();
    const top = Math.max(28, (header?.bottom || 62) + 12);
    const poolTop = rect.bottom - poolOffset * scale;
    const rise = Math.max(80, Math.min(poolTop - top, window.innerHeight - 100)) / scale;
    const height = Math.ceil(rise + poolOffset + 24 / scale);
    const density = pixelated ? 1 : Math.min(window.devicePixelRatio || 1, 1.5) * scale;
    const key = `${rect.width}:${height}:${density}`;
    if (key === previous) return;
    previous = key;
    canvas.style.height = `${height * scale}px`;
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    ctx.imageSmoothingEnabled = !pixelated;
    onResize({ height, poolY: height - poolOffset, rise });
  }
  const observer = new ResizeObserver(resize);
  observer.observe(bowl);
  const scene = bowl.closest('.pensieve');
  if (scene) observer.observe(scene);
  window.addEventListener('resize', resize);
  resize();
  return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
}
