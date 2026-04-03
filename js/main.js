/* ═══════════════════════════════════════════
   iStore — Main JavaScript
   ═══════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════════════════════
   THREE.JS SCROLL-DRIVEN VIDEO ANIMATION
   On mobile: autoplay video, no scroll-seeking (performance).
   On desktop: full scroll-driven animation with Three.js.
   ══════════════════════════════════════════════════════ */
const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

(function initScrollAnimation() {
  const canvas      = document.getElementById('gl-canvas');
  const scrollScene = document.getElementById('scroll-scene');
  const video       = document.getElementById('scroll-video');
  if (!canvas || !scrollScene || !video) return;

  /* ── Chapter definitions ── */
  const chapters = [
    { el: document.getElementById('ch-0'), start: 0,    end: 0.12 },
    { el: document.getElementById('ch-1'), start: 0.12, end: 0.35 },
    { el: document.getElementById('ch-2'), start: 0.35, end: 0.57 },
    { el: document.getElementById('ch-3'), start: 0.57, end: 0.78 },
    { el: document.getElementById('ch-4'), start: 0.78, end: 1.00 },
  ];

  const progressFill = document.getElementById('scene-progress-fill');
  const scrollHint   = document.getElementById('scrollIndicator');

  function updateOverlay(p) {
    chapters.forEach(ch => {
      if (!ch.el) return;
      ch.el.classList.toggle('active', p >= ch.start && p <= ch.end);
      const localP  = (p - ch.start) / Math.max(ch.end - ch.start, 0.001);
      const clamped = Math.max(0, Math.min(1, localP));
      const inner   = ch.el.querySelector('.scene-chapter__inner');
      if (inner) inner.style.transform = `translateY(${clamped * -24}px)`;
    });
    if (p >= 0.78 && chapters[4].el) chapters[4].el.classList.add('active');
    if (scrollHint) scrollHint.style.opacity = p > 0.04 ? '0' : '1';
    if (progressFill) progressFill.style.transform = `scaleX(${p})`;
  }

  /* ════ MOBILE: autoplay video, chapters based on scroll ════ */
  if (isMobile) {
    // Show video directly, hide Three.js canvas
    canvas.style.display = 'none';
    video.style.cssText = 'display:block;position:absolute;inset:0;width:100%;height:100%;object-fit:contain;visibility:visible;';

    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.play().catch(() => {});

    // Chapters still follow scroll
    window.addEventListener('scroll', () => {
      const maxScroll = scrollScene.offsetHeight - window.innerHeight;
      const p = maxScroll > 0 ? Math.max(0, Math.min(1, window.scrollY / maxScroll)) : 0;
      updateOverlay(p);
    }, { passive: true });

    // Show first chapter
    updateOverlay(0);
    return;
  }

  /* ════ DESKTOP: full Three.js scroll-driven animation ════ */
  if (typeof THREE === 'undefined') return;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0xffffff, 1);

  const scene  = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const videoTexture = new THREE.VideoTexture(video);
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      map:        { value: videoTexture },
      coverScale: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec2 coverScale;
      varying vec2 vUv;
      void main() {
        vec2 uv = (vUv - 0.5) * coverScale + 0.5;
        vec3 color = vec3(1.0);
        if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
          color = texture2D(map, uv).rgb;
          float fadeW = 0.10;
          float ax = smoothstep(0.0, fadeW, min(uv.x, 1.0 - uv.x));
          float ay = smoothstep(0.0, fadeW, min(uv.y, 1.0 - uv.y));
          color = mix(vec3(1.0), color, ax * ay);
        }
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);

  function updateCoverScale() {
    const vw = video.videoWidth  || 1920;
    const vh = video.videoHeight || 1080;
    const vAspect   = window.innerWidth  / window.innerHeight;
    const vidAspect = vw / vh;
    let sx, sy;
    if (vAspect > vidAspect) { sx = vAspect / vidAspect; sy = 1; }
    else { sx = 1; sy = vidAspect / vAspect; }
    material.uniforms.coverScale.value.set(sx, sy);
  }
  updateCoverScale();

  let rawProgress = 0, smoothProgress = 0;

  window.addEventListener('scroll', () => {
    const maxScroll = scrollScene.offsetHeight - window.innerHeight;
    rawProgress = maxScroll > 0 ? Math.max(0, Math.min(1, window.scrollY / maxScroll)) : 0;
  }, { passive: true });

  video.addEventListener('loadedmetadata', updateCoverScale);

  function unlockVideo() {
    video.play().then(() => { video.pause(); video.currentTime = 0; }).catch(() => {});
  }
  video.load();
  unlockVideo();
  window.addEventListener('scroll', unlockVideo, { once: true });

  let pendingTime = null;
  video.addEventListener('seeked', () => {
    if (pendingTime !== null) { video.currentTime = pendingTime; pendingTime = null; }
  });
  function seekTo(t) {
    if (video.seeking) { pendingTime = t; }
    else { pendingTime = null; video.currentTime = t; }
  }

  let lastSeekTime = -1;
  function animate() {
    requestAnimationFrame(animate);
    smoothProgress += (rawProgress - smoothProgress) * 0.08;
    if (video.duration > 0) {
      const targetTime = Math.round(smoothProgress * video.duration * 30) / 30;
      if (targetTime !== lastSeekTime) {
        seekTo(targetTime);
        lastSeekTime = targetTime;
        videoTexture.needsUpdate = true;
      }
    }
    updateOverlay(smoothProgress);
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateCoverScale();
  });

  animate();
})();

/* ══════════════════════════════════════════════════════
   SPOTLIGHT SCROLL ANIMATION  (ipadgirando.mp4)
   On mobile: autoplay. On desktop: scroll-driven seeking.
   ══════════════════════════════════════════════════════ */
(function initSpotlightAnimation() {
  const sceneEl = document.getElementById('spotlight-scene');
  const video   = document.getElementById('spotlight-video');
  if (!sceneEl || !video) return;

  /* ════ MOBILE: just autoplay ════ */
  if (isMobile) {
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.play().catch(() => {});
    return;
  }

  /* ════ DESKTOP: scroll-driven seeking ════ */
  let rawP = 0, smoothP = 0;
  window.addEventListener('scroll', () => {
    const top = sceneEl.getBoundingClientRect().top + window.scrollY;
    const max = sceneEl.offsetHeight - window.innerHeight;
    rawP = Math.max(0, Math.min(1, (window.scrollY - top) / max));
  }, { passive: true });

  let pendingTime = null;
  video.addEventListener('seeked', () => {
    if (pendingTime !== null) { video.currentTime = pendingTime; pendingTime = null; }
  });
  function seekTo(t) {
    if (video.seeking) { pendingTime = t; }
    else { pendingTime = null; video.currentTime = t; }
  }

  function unlock() {
    video.play().then(() => { video.pause(); video.currentTime = 0; }).catch(() => {});
  }
  video.load();
  unlock();
  window.addEventListener('scroll', unlock, { once: true });

  let lastT = -1;
  function animate() {
    requestAnimationFrame(animate);
    smoothP += (rawP - smoothP) * 0.08;
    if (video.duration > 0) {
      const t = Math.round(smoothP * video.duration * 30) / 30;
      if (t !== lastT) { seekTo(t); lastT = t; }
    }
  }

  animate();
})();

/* ── Nav Scroll Effect ── */
const nav = document.getElementById('nav');
const backToTop = document.getElementById('backToTop');
const scrollIndicator = document.getElementById('scrollIndicator');

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;

  // Nav glass effect
  nav.classList.toggle('scrolled', scrollY > 40);

  // Back to top button
  backToTop.classList.toggle('visible', scrollY > 600);

  // Hide scroll indicator
  if (scrollIndicator) {
    scrollIndicator.style.opacity = scrollY > 100 ? '0' : '';
  }
}, { passive: true });

// Back to top
backToTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ── Mobile Nav ── */
const navBurger = document.getElementById('navBurger');
const navMobile = document.getElementById('navMobile');

navBurger.addEventListener('click', () => {
  const isOpen = navMobile.classList.toggle('open');
  navBurger.classList.toggle('active', isOpen);
  document.body.style.overflow = isOpen ? 'hidden' : '';
});

// Close mobile nav on link click
document.querySelectorAll('.mobile-link').forEach(link => {
  link.addEventListener('click', () => {
    navMobile.classList.remove('open');
    navBurger.classList.remove('active');
    document.body.style.overflow = '';
  });
});

/* ── Scroll Reveal (Intersection Observer) ── */
const revealElements = document.querySelectorAll('.reveal, .reveal-right');

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      // Stagger siblings
      const siblings = [...entry.target.parentElement.querySelectorAll('.reveal, .reveal-right')];
      const index = siblings.indexOf(entry.target);
      const delay = index * 80;

      setTimeout(() => {
        entry.target.classList.add('visible');
      }, delay);

      revealObserver.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
});

revealElements.forEach(el => revealObserver.observe(el));

/* ── Animated Stat Counters ── */
const statNumbers = document.querySelectorAll('.stat__number');

const countObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCounter(entry.target);
      countObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

statNumbers.forEach(el => countObserver.observe(el));

function animateCounter(el) {
  const target = parseInt(el.dataset.target, 10);
  const duration = 2000;
  const start = performance.now();

  function update(time) {
    const elapsed = time - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(eased * target);

    el.textContent = current.toLocaleString('pt-BR');

    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

/* ── iPhone Color Switcher ── */
const colorDots = document.querySelectorAll('.color-dot');
const wallpaper = document.querySelector('.wallpaper-aurora');

const colorPalettes = {
  '#B4B4B4': { from: 'rgba(41,151,255,0.6)', to: 'rgba(127,90,240,0.5)', accent: 'rgba(255,107,107,0.3)' },
  '#4A4A4A': { from: 'rgba(20,20,60,0.9)', to: 'rgba(10,10,40,0.8)', accent: 'rgba(80,80,180,0.4)' },
  '#F0E6C8': { from: 'rgba(245,180,80,0.4)', to: 'rgba(200,120,40,0.3)', accent: 'rgba(255,200,100,0.3)' },
  '#FFFFFF': { from: 'rgba(100,180,255,0.5)', to: 'rgba(180,140,255,0.4)', accent: 'rgba(255,255,255,0.2)' },
};

colorDots.forEach(dot => {
  dot.addEventListener('click', () => {
    colorDots.forEach(d => d.classList.remove('color-dot--active'));
    dot.classList.add('color-dot--active');

    const color = dot.dataset.color;
    const palette = colorPalettes[color];

    if (palette && wallpaper) {
      wallpaper.style.background = `
        radial-gradient(ellipse 100% 60% at 30% 40%, ${palette.from} 0%, transparent 60%),
        radial-gradient(ellipse 80% 80% at 70% 70%, ${palette.to} 0%, transparent 60%),
        radial-gradient(ellipse 60% 60% at 50% 20%, ${palette.accent} 0%, transparent 50%),
        linear-gradient(160deg, #050510 0%, #0a0020 100%)
      `;
    }
  });
});


/* ── Smooth Anchor Scrolling ── */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const href = anchor.getAttribute('href');
    if (href === '#') return;

    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      const offset = 70;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

/* ── Product Card Parallax Tilt ── */
document.querySelectorAll('.product-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    card.style.transform = `
      translateY(-4px)
      scale(1.01)
      perspective(600px)
      rotateY(${x * 5}deg)
      rotateX(${-y * 5}deg)
    `;
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
});

/* ── Lineup Card Tilt ── */
document.querySelectorAll('.lineup-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    card.style.transform = `
      translateY(-4px)
      perspective(800px)
      rotateY(${x * 4}deg)
      rotateX(${-y * 4}deg)
    `;
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
});

/* ── WhatsApp Float Button (optional) ── */
// Creates a floating WhatsApp CTA for mobile users
function createWhatsAppFloat() {
  if (window.innerWidth > 768) return;

  const floatBtn = document.createElement('a');
  floatBtn.href = 'https://wa.me/5511999999999';
  floatBtn.target = '_blank';
  floatBtn.rel = 'noopener';
  floatBtn.setAttribute('aria-label', 'Falar no WhatsApp');
  floatBtn.style.cssText = `
    position: fixed;
    bottom: 1.5rem;
    left: 1.5rem;
    width: 52px;
    height: 52px;
    background: #25d366;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px rgba(37,211,102,0.5);
    z-index: 100;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    text-decoration: none;
  `;
  floatBtn.innerHTML = `
    <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
    </svg>
  `;

  floatBtn.addEventListener('mouseenter', () => {
    floatBtn.style.transform = 'scale(1.1)';
    floatBtn.style.boxShadow = '0 6px 28px rgba(37,211,102,0.65)';
  });
  floatBtn.addEventListener('mouseleave', () => {
    floatBtn.style.transform = '';
    floatBtn.style.boxShadow = '0 4px 20px rgba(37,211,102,0.5)';
  });

  document.body.appendChild(floatBtn);
}

createWhatsAppFloat();

/* ── Page Load Animation ── */
window.addEventListener('load', () => {
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.5s ease';
  requestAnimationFrame(() => {
    document.body.style.opacity = '1';
  });
});
