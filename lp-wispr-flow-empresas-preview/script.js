const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.getElementById('year').textContent = new Date().getFullYear();

const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
menuToggle.addEventListener('click', () => {
  const open = navLinks.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('menu-open', open);
});
navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  navLinks.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('menu-open');
}));

const updateProgress = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  document.getElementById('progressBar').style.width = `${max > 0 ? (scrollY / max) * 100 : 0}%`;
};
addEventListener('scroll', updateProgress, { passive: true });
updateProgress();

const reveals = document.querySelectorAll('.reveal');
if (reduceMotion) {
  reveals.forEach(node => node.classList.add('is-visible'));
} else {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: .12, rootMargin: '0px 0px -7% 0px' });
  reveals.forEach(node => observer.observe(node));
}

const status = document.getElementById('hireStatus');
const statusBox = status?.closest('.hire-status');
const messages = [
  'Perfil compatível identificado',
  'Critérios da vaga organizados',
  'Candidato notificado',
  'Interesse pronto para avançar'
];

if (status && statusBox && !reduceMotion) {
  let index = 0;
  setInterval(() => {
    statusBox.classList.add('is-changing');
    setTimeout(() => {
      index = (index + 1) % messages.length;
      status.textContent = messages[index];
      statusBox.classList.remove('is-changing');
    }, 280);
  }, 2400);
}

document.querySelectorAll('details').forEach(detail => {
  detail.addEventListener('toggle', () => {
    if (!detail.open) return;
    document.querySelectorAll('details[open]').forEach(other => {
      if (other !== detail) other.open = false;
    });
  });
});
