const cache = new Map<string, Promise<void>>();

/** Load a UMD script from a CDN once; later calls reuse the same promise. */
export function loadScript(src: string): Promise<void> {
  let p = cache.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.crossOrigin = "anonymous";
      el.onload = () => resolve();
      el.onerror = () => {
        cache.delete(src);
        el.remove();
        reject(new Error(`Couldn't load ${new URL(src).hostname}. Check your internet connection.`));
      };
      document.head.appendChild(el);
    });
    cache.set(src, p);
  }
  return p;
}
