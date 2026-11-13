// Replays locally saved Lottie animations with the bundled open-source player.
(async () => {
  if (!window.lottie || !Array.isArray(window.__LOTTIE)) return;
  for (const item of window.__LOTTIE) {
    const container = document.getElementById(item.id);
    if (!container) continue;
    try {
      const response = await fetch(item.path);
      if (!response.ok) continue;
      const animationData = await response.json();
      container.replaceChildren();
      const animation = window.lottie.loadAnimation({ container, renderer: 'svg', loop: true, autoplay: true, animationData });
      animation.addEventListener('DOMLoaded', () => {
        const svg = container.querySelector('svg');
        if (svg && item.svgClass) svg.setAttribute('class', item.svgClass);
      });
    } catch (error) { console.error('Local animation failed:', error); }
  }
})();
