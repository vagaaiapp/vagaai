const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Mantém o mesmo contrato de telemetria da aplicação. O helper externo filtra
   dados pessoais e envia para GA4/Vercel apenas quando o consentimento permite. */
const track = (name, props) => {
  if (typeof window.vagaaiTrack === 'function') return window.vagaaiTrack(name, props || {});
  try { if (typeof window.gtag === 'function') window.gtag('event', name, props || {}); } catch (_) {}
};

document.getElementById('year').textContent = new Date().getFullYear();

const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');

/* Visitantes autenticados não precisam recomeçar o onboarding. A checagem é
   local e segue a mesma heurística usada pela LP anterior. */
const hasActiveSession = () => {
  try {
    const raw = localStorage.getItem('sb-kbcjchjepgejdezeuwwh-auth-token');
    if (!raw) return false;
    const session = JSON.parse(raw);
    const expiresAt = session?.expires_at || session?.currentSession?.expires_at;
    return Boolean(session) && (!expiresAt || expiresAt * 1000 > Date.now());
  } catch (_) { return false; }
};

if (hasActiveSession()) {
  const loginLink = document.getElementById('navEntrar');
  const startLink = document.getElementById('navComecar');
  const mobileLoginLink = document.getElementById('navMobileEntrar');
  const mobileStartLink = document.getElementById('navMobileComecar');
  if (loginLink) loginLink.hidden = true;
  if (mobileLoginLink) mobileLoginLink.hidden = true;
  if (startLink) {
    startLink.textContent = 'Ir para o painel';
    startLink.href = '/dashboard';
  }
  if (mobileStartLink) {
    mobileStartLink.textContent = 'Ir para o painel';
    mobileStartLink.href = '/dashboard';
  }
}

menuToggle.addEventListener('click', () => {
  const open = navLinks.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('menu-open', open);
});
navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  navLinks.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('menu-open');
  track('nav_click', { destino: link.getAttribute('href') || '' });
}));

document.querySelectorAll('a[href^="/onboarding/"]').forEach(link => {
  link.addEventListener('click', () => {
    const href = link.getAttribute('href') || '';
    track('cta_funil', {
      caminho: href.includes('/curriculo/') ? 'sem_curriculo' : 'com_curriculo',
      rotulo: (link.textContent || '').trim(),
      secao: link.closest('section')?.className || 'rodape'
    });
  });
});

document.querySelectorAll('a[href="#jornadas"]').forEach(link => {
  link.addEventListener('click', () => {
    track('cta_funil', {
      caminho: 'seletor',
      rotulo: (link.textContent || '').trim(),
      secao: link.closest('header') ? 'cabecalho' : 'pagina'
    });
  });
});

const updateProgress = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  const value = max > 0 ? (scrollY / max) * 100 : 0;
  document.getElementById('progressBar').style.width = `${value}%`;
};
addEventListener('scroll', updateProgress, { passive: true });
updateProgress();

const testimonialScroll = document.getElementById('testimonialScroll');
const testimonialViewport = testimonialScroll?.querySelector('.testimonial-viewport');
const testimonialTrack = document.getElementById('testimonialTrack');

const updateTestimonials = () => {
  if (!testimonialScroll || !testimonialViewport || !testimonialTrack || reduceMotion) return;
  const rect = testimonialScroll.getBoundingClientRect();
  const travel = Math.max(1, testimonialScroll.offsetHeight - innerHeight);
  const progress = Math.max(0, Math.min(1, -rect.top / travel));
  const maxShift = Math.max(0, testimonialTrack.scrollWidth - testimonialViewport.clientWidth);
  testimonialTrack.style.transform = `translate3d(${-progress * maxShift}px,0,0)`;
};

addEventListener('scroll', updateTestimonials, { passive: true });
addEventListener('resize', updateTestimonials);
updateTestimonials();

const reveals = document.querySelectorAll('.reveal');
if (reduceMotion) {
  reveals.forEach(node => node.classList.add('is-visible'));
} else {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .12, rootMargin: '0px 0px -7% 0px' });
  reveals.forEach(node => revealObserver.observe(node));
}

const heroConversationTrack = document.getElementById('heroConversationTrack');
const heroDecisionCards = [...document.querySelectorAll('[data-decision-card]')];

/* Requisitos que aparecem em anúncio de QUALQUER área: vendas, saúde,
   administrativo, logística, tecnologia. Os comprimentos variam de propósito —
   é a variação que forma a borda irregular à direita. Linhas todas do mesmo
   tamanho, como eu tinha feito, colam num bloco reto e matam o efeito.

   A maioria sai "Já tem": é o que os dados mostram e é o que gera desejo em
   quem chega. "Falta" fica na rotação para a cena não prometer aprovação. */
const heroRequisitos = [
  { veredito: 'Já tem',  tone: 'tem',     text: 'Atendimento ao público' },
  { veredito: 'Revisar', tone: 'revisar', text: 'Inglês intermediário' },
  { veredito: 'Já tem',  tone: 'tem',     text: 'Excel' },
  { veredito: 'Falta',   tone: 'falta',   text: 'Liderança de equipe' },
  { veredito: 'Já tem',  tone: 'tem',     text: 'Organização de rotina e processos' },
  { veredito: 'Já tem',  tone: 'tem',     text: 'Trabalho em equipe' },
  { veredito: 'Revisar', tone: 'revisar', text: 'Disponibilidade para trabalho presencial' },
  { veredito: 'Já tem',  tone: 'tem',     text: 'Comunicação escrita' },
  { veredito: 'Já tem',  tone: 'tem',     text: 'Rotina administrativa e controle de prazos' }
];

const ONDA_SVG = '<svg viewBox="0 0 10 7" fill="none" aria-hidden="true">'
  + '<rect x="0" y="2" width="2" height="3" rx="1" fill="currentColor"/>'
  + '<rect x="4" y="0" width="2" height="7" rx="1" fill="currentColor"/>'
  + '<rect x="8" y="2.5" width="2" height="2" rx="1" fill="currentColor"/></svg>';

/* Escada de opacidade medida na referência, de cima para baixo. */
const OPACIDADES = ['.08', '.18', '.32', '.5', '1'];

if (heroConversationTrack && !reduceMotion) {
  let indice = 5;
  let cartaoAtivo = 0;

  const girarCartoes = () => {
    heroDecisionCards.forEach((card, i) => {
      const prof = (cartaoAtivo - i + heroDecisionCards.length) % heroDecisionCards.length;
      card.classList.remove('is-front', 'is-behind-one', 'is-behind-two', 'is-hidden');
      card.classList.add(prof === 0 ? 'is-front' : prof === 1 ? 'is-behind-one' : prof === 2 ? 'is-behind-two' : 'is-hidden');
    });
  };

  /* Reatribui a escada de baixo para cima. Sem transição de propósito: na
     referência as linhas saltam de slot e quem suaviza é a máscara. */
  const reordenar = () => {
    const linhas = [...heroConversationTrack.children];
    linhas.slice().reverse().forEach((linha, dedeBaixo) => {
      linha.style.setProperty('--op', OPACIDADES[OPACIDADES.length - 1 - dedeBaixo] || '0');
    });
    while (heroConversationTrack.children.length > OPACIDADES.length) {
      heroConversationTrack.firstElementChild.remove();
    }
  };

  const criarLinha = requisito => {
    const linha = document.createElement('div');
    linha.className = 'req-line';
    linha.style.setProperty('--op', '1');

    const chip = document.createElement('span');
    chip.className = 'verdict is-' + requisito.tone;
    chip.innerHTML = ONDA_SVG;
    chip.appendChild(document.createTextNode(requisito.veredito));

    const p = document.createElement('p');
    const palavras = requisito.text.split(' ');
    palavras.forEach((palavra, i) => {
      const w = document.createElement('i');
      w.textContent = palavra;
      p.appendChild(w);
      if (i < palavras.length - 1) p.appendChild(document.createTextNode('\u00a0'));
    });

    linha.append(chip, p);
    return linha;
  };

  setInterval(() => {
    const requisito = heroRequisitos[indice % heroRequisitos.length];
    const linha = criarLinha(requisito);
    heroConversationTrack.appendChild(linha);
    reordenar();
    // Revelação palavra a palavra: é ela, com a máscara, que dá a suavidade.
    linha.querySelectorAll('p i').forEach((w, i) => {
      setTimeout(() => w.classList.add('on'), 60 + i * 90);
    });
    /* Girava a cada 2 linhas. Com a cadência em 1s isso dava 2s por cartão,
       e como o conteúdo leva 0,6s para aparecer o cartão ficava vazio um terço
       do tempo. A cada 4 linhas o conteúdo fica legível 90% do ciclo. */
    if (indice % 4 === 3) { cartaoAtivo = (cartaoAtivo + 1) % heroDecisionCards.length; girarCartoes(); }
    indice += 1;
    // Cadência medida na referência: ~1s por linha. A 2,1s a cena parecia
    // apresentação de slides em vez de fluxo acontecendo.
  }, 1000);

  girarCartoes();
}

const heroActivityTrack = document.getElementById('heroActivityTrack');
const heroResultStack = document.getElementById('heroResultStack');
const heroActivityItems = [
  { label: 'Busca', tone: 'search', text: 'Vagas reunidas em um só lugar.' },
  { label: 'Análise', tone: 'analysis', text: 'Cada vaga comparada ao seu perfil.' },
  { label: 'Perfil', tone: 'profile', text: 'Forças do currículo reconhecidas.' },
  { label: 'Prioridade', tone: 'priority', text: 'Lacunas ordenadas por prioridade.' },
  { label: 'Currículo', tone: 'cv', text: 'Versão direcionada pronta para revisar.' },
  { label: 'Jornada', tone: 'journey', text: 'Próximo passo definido com clareza.' },
  { label: 'Entrevista', tone: 'interview', text: 'Perguntas preparadas para a entrevista.' }
];
const heroResultItems = [
  { text: 'Mostrar primeiro as vagas que mais combinam', tag: 'Busca' },
  { text: 'Destacar experiências que você já tem', tag: 'Perfil' },
  { text: 'Direcionar o currículo sem inventar', tag: 'VagaAI' },
  { text: 'Organizar cada candidatura até a entrevista', tag: 'Jornada' },
  { text: 'Treinar respostas com o contexto da vaga', tag: 'Entrevista' }
];

if (heroActivityTrack && heroResultStack && !reduceMotion) {
  const activityOpacity = ['.08', '.18', '.32', '.5', '1'];
  let activityIndex = 5;
  let resultIndex = 3;
  let activityTicks = 0;

  const updateActivityOpacity = () => {
    const rows = [...heroActivityTrack.children];
    [...rows].reverse().forEach((row, depth) => {
      row.style.setProperty('--op', activityOpacity[activityOpacity.length - 1 - depth] || '0');
    });
    if (rows.length > activityOpacity.length) {
      setTimeout(() => {
        while (heroActivityTrack.children.length > activityOpacity.length) heroActivityTrack.firstElementChild.remove();
      }, 610);
    }
  };

  const createActivityLine = item => {
    const row = document.createElement('div');
    row.className = 'activity-line';
    row.style.setProperty('--op', '0');

    const chip = document.createElement('span');
    chip.className = `activity-chip tone-${item.tone}`;
    chip.innerHTML = ONDA_SVG;
    chip.appendChild(document.createTextNode(item.label));

    const sentence = document.createElement('p');
    let characterIndex = 0;
    item.text.split(' ').forEach((word, wordIndex, words) => {
      const wordWrap = document.createElement('span');
      wordWrap.className = 'activity-word';
      [...word].forEach(character => {
        const letter = document.createElement('span');
        letter.className = 'activity-char';
        letter.textContent = character;
        letter.style.setProperty('--char-index', String(characterIndex++));
        wordWrap.appendChild(letter);
      });
      sentence.appendChild(wordWrap);
      if (wordIndex < words.length - 1) sentence.appendChild(document.createTextNode('\u00a0'));
    });

    row.append(chip, sentence);
    return row;
  };

  const pushResult = item => {
    const card = document.createElement('article');
    card.className = 'result-card is-entering';
    card.setAttribute('data-result-card', '');
    card.innerHTML = `<i>✦</i><b>${item.text}</b><em>${item.tag}</em>`;
    heroResultStack.appendChild(card);

    const cards = [...heroResultStack.children];
    [...cards].reverse().forEach((current, depth) => {
      if (current === card) return;
      current.classList.remove('is-front', 'is-middle', 'is-back', 'is-entering', 'is-leaving');
      current.classList.add(depth === 1 ? 'is-middle' : depth === 2 ? 'is-back' : 'is-leaving');
    });

    requestAnimationFrame(() => {
      card.classList.remove('is-entering');
      card.classList.add('is-front');
    });
    setTimeout(() => heroResultStack.querySelectorAll('.is-leaving').forEach(oldCard => oldCard.remove()), 650);
  };

  setInterval(() => {
    const item = heroActivityItems[activityIndex % heroActivityItems.length];
    const row = createActivityLine(item);
    heroActivityTrack.appendChild(row);
    updateActivityOpacity();
    row.querySelectorAll('.activity-char').forEach((character, index) => {
      setTimeout(() => character.classList.add('on'), 70 + index * 20);
    });

    activityIndex += 1;
    activityTicks += 1;
    if (activityTicks % 2 === 0) {
      pushResult(heroResultItems[resultIndex % heroResultItems.length]);
      resultIndex += 1;
    }
  }, 1200);
}

const steps = [...document.querySelectorAll('.story-step')];
const visuals = [...document.querySelectorAll('[data-visual]')];
const tabs = [...document.querySelectorAll('[data-tab]')];

function setStory(index) {
  steps.forEach((node, i) => node.classList.toggle('is-active', i === index));
  visuals.forEach((node, i) => node.classList.toggle('is-active', i === index));
  tabs.forEach((node, i) => node.classList.toggle('is-active', i === index));
}

const stepObserver = new IntersectionObserver(entries => {
  const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (visible) setStory(Number(visible.target.dataset.step));
}, { threshold: [.25, .45, .65], rootMargin: '-20% 0px -28% 0px' });
steps.forEach(step => stepObserver.observe(step));
tabs.forEach(tab => tab.addEventListener('click', () => {
  const index = Number(tab.dataset.tab);
  setStory(index);
  track('recurso_visualizado', { etapa: ['analisar', 'encontrar', 'preparar'][index] || String(index) });
  if (innerWidth > 980) steps[index].scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
}));

const billingButtons = [...document.querySelectorAll('[data-billing]')];
const priceValue = document.getElementById('priceValue');
const billingNote = document.getElementById('billingNote');
const planLink = document.getElementById('planLink');
billingButtons.forEach(button => button.addEventListener('click', () => {
  billingButtons.forEach(item => item.classList.toggle('is-active', item === button));
  const quarterly = button.dataset.billing === 'quarterly';
  priceValue.innerHTML = quarterly ? 'R$29,90<small>/mês</small>' : 'R$39,90<small>/mês</small>';
  billingNote.textContent = quarterly ? 'Cobrança trimestral, equivalente a R$29,90/mês' : 'Cobrança mensal, cancele quando quiser';
  planLink.href = quarterly ? 'https://buy.stripe.com/5kQaEX0WOd616Dd7yn9k40a' : 'https://buy.stripe.com/8x27sL6h8gidgdN4mb9k408';
  track('plano_periodicidade', { periodo: quarterly ? 'quarterly' : 'monthly' });
}));

/* O checkout passa pelo login para que o Stripe receba a referência da conta e
   o webhook consiga liberar o plano para a pessoa certa. */
planLink.addEventListener('click', event => {
  event.preventDefault();
  const checkoutUrl = planLink.getAttribute('href') || planLink.dataset.monthlyUrl;
  try {
    localStorage.setItem('vagaai_pending_checkout', JSON.stringify({ url: checkoutUrl, ts: Date.now() }));
  } catch (_) {}
  const activeBilling = billingButtons.find(button => button.classList.contains('is-active'));
  track('begin_checkout', { plan: 'pro', billing_period: activeBilling?.dataset.billing || 'monthly', currency: 'BRL' });
  window.location.href = '/login';
});

document.querySelectorAll('details').forEach(detail => {
  detail.addEventListener('toggle', () => {
    if (!detail.open) return;
    document.querySelectorAll('details[open]').forEach(other => {
      if (other !== detail) other.open = false;
    });
    track('faq_aberto', { pergunta: (detail.querySelector('summary')?.textContent || '').trim() });
  });
});

const cookiePrefs = document.getElementById('cookiePrefs');
if (cookiePrefs) {
  cookiePrefs.addEventListener('click', event => {
    if (!window.VagaAICookies?.open) return;
    event.preventDefault();
    window.VagaAICookies.open();
  });
}
