(function () {
  'use strict';

  var page = document.querySelector('.landing-page');
  if (!page) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var heroItems = [
    document.querySelector('.lp-kicker'),
    document.querySelector('.lp-hero h1'),
    document.querySelector('.lp-lead'),
    document.querySelector('.lp-actions'),
    document.querySelector('.lp-app')
  ].filter(Boolean);

  var revealGroups = [
    ['.lp-problem-intro', '.lp-problem'],
    ['.lp-section .lp-title', '.lp-step'],
    ['.lp-audience-section .lp-title', '.lp-audience', '.lp-availability'],
    ['.lp-philosophy-panel > div:first-child', '.lp-belief', '.lp-quote'],
    ['.lp-final-panel']
  ];

  heroItems.forEach(function (item, index) {
    item.classList.add('lp-load-item');
    item.style.setProperty('--reveal-delay', (index * 70) + 'ms');
  });

  var revealItems = [];
  revealGroups.forEach(function (selectors) {
    var delay = 0;
    selectors.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (item) {
        item.classList.add('lp-reveal');
        item.style.setProperty('--reveal-delay', delay + 'ms');
        revealItems.push(item);
        delay += 70;
      });
    });
  });

  if (reduceMotion || !('IntersectionObserver' in window)) {
    heroItems.concat(revealItems).forEach(function (item) { item.classList.add('is-visible'); });
    return;
  }

  page.classList.add('lp-motion-ready');
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      heroItems.forEach(function (item) { item.classList.add('is-visible'); });
    });
  });

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  revealItems.forEach(function (item) { observer.observe(item); });

  var scrollTicking = false;
  window.addEventListener('scroll', function () {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(function () {
      revealItems.forEach(function (item) {
        if (item.classList.contains('is-visible')) return;
        var rect = item.getBoundingClientRect();
        if (rect.top < window.innerHeight * 1.08 || rect.bottom < 0) {
          item.classList.add('is-visible');
          observer.unobserve(item);
        }
      });
      scrollTicking = false;
    });
  }, { passive: true });

  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    document.querySelectorAll('.lp-load-item, .lp-reveal').forEach(function (item) {
      item.classList.add('is-visible');
    });
  });
})();
