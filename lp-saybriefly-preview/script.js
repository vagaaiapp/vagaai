const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const menuButton = document.getElementById('menuButton');
const navLinks = document.getElementById('navLinks');

menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  navLinks?.classList.toggle('is-open', !open);
});

navLinks?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  navLinks.classList.remove('is-open');
  menuButton?.setAttribute('aria-expanded', 'false');
}));

const progress = document.querySelector('.page-progress span');
const updateProgress = () => {
  if (!progress) return;
  const max = document.documentElement.scrollHeight - innerHeight;
  progress.style.width = `${max > 0 ? (scrollY / max) * 100 : 0}%`;
};
addEventListener('scroll', updateProgress, { passive: true });
updateProgress();

const revealNodes = [...document.querySelectorAll('.reveal')];
if (reduceMotion) {
  revealNodes.forEach(node => node.classList.add('is-visible'));
} else {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
  revealNodes.forEach(node => observer.observe(node));
}

const product = document.querySelector('.hero-product');
if (product && !reduceMotion) {
  product.addEventListener('pointermove', event => {
    const rect = product.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    product.style.setProperty('--tilt-x', `${x * 5}px`);
    product.style.setProperty('--tilt-y', `${y * 5}px`);
  });
  product.addEventListener('pointerleave', () => {
    product.style.setProperty('--tilt-x', '0px');
    product.style.setProperty('--tilt-y', '0px');
  });
}
