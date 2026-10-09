(function () {
  if (window.YumiPdp) return;

  function initGallery(root) {
    root.querySelectorAll('[data-y-gallery]').forEach(function (gallery) {
      if (gallery.dataset.yReady) return;
      gallery.dataset.yReady = 'true';
      var track = gallery.querySelector('.y-gallery__track');
      var slides = Array.prototype.slice.call(gallery.querySelectorAll('.y-gallery__slide'));
      var thumbs = Array.prototype.slice.call(gallery.querySelectorAll('.y-gallery__thumb'));
      var dots = Array.prototype.slice.call(gallery.querySelectorAll('.y-gallery__dots span'));
      if (!track || !slides.length) return;

      var thumbRow = gallery.querySelector('.y-gallery__thumbs');
      function setActive(index) {
        thumbs.forEach(function (t, i) { t.setAttribute('aria-current', i === index ? 'true' : 'false'); });
        dots.forEach(function (d, i) { d.classList.toggle('is-active', i === index); });
        var active = thumbs[index];
        if (thumbRow && active && thumbRow.scrollWidth > thumbRow.clientWidth) {
          var target = active.offsetLeft - thumbRow.offsetLeft - (thumbRow.clientWidth - active.offsetWidth) / 2;
          thumbRow.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
        }
      }
      function goTo(index) {
        track.scrollTo({ left: slides[index].offsetLeft - track.offsetLeft, behavior: 'smooth' });
        setActive(index);
      }
      gallery.yGoTo = goTo;

      thumbs.forEach(function (thumb, i) {
        thumb.addEventListener('click', function () { goTo(i); });
      });

      var ticking = false;
      track.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          var index = Math.round(track.scrollLeft / track.clientWidth);
          setActive(Math.max(0, Math.min(index, slides.length - 1)));
        });
      });
    });
  }

  function formatTime(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return [h, m, s].map(function (n) { return String(n).padStart(2, '0'); }).join(':');
  }

  function initCountdowns(root) {
    root.querySelectorAll('[data-y-countdown]').forEach(function (el) {
      if (el.dataset.yReady) return;
      el.dataset.yReady = 'true';
      function tick() {
        var now = new Date();
        var end = new Date(now);
        end.setHours(24, 0, 0, 0);
        el.textContent = formatTime(end - now);
      }
      tick();
      setInterval(tick, 1000);
    });
  }

  function initProduct(root) {
    root.querySelectorAll('[data-y-product]').forEach(function (product) {
      if (product.dataset.yReady) return;
      product.dataset.yReady = 'true';
      var dataEl = product.querySelector('[data-y-variants]');
      var picker = product.querySelector('[data-y-picker]');
      var variants = dataEl ? JSON.parse(dataEl.textContent) : [];
      var mainAtc = product.querySelector('[data-y-main-atc]');
      var sticky = product.querySelector('[data-y-sticky]');

      if (picker && variants.length) {
        picker.addEventListener('change', function () {
          var selected = Array.prototype.map.call(picker.querySelectorAll('fieldset'), function (fs) {
            var checked = fs.querySelector('input:checked');
            return checked ? checked.value : null;
          });
          var variant = variants.find(function (v) {
            return v.options.every(function (opt, i) { return opt === selected[i]; });
          });
          updateVariant(product, variant);
        });
      }

      if (sticky && mainAtc) {
        var stickyBtn = sticky.querySelector('[data-y-sticky-btn]');
        if (stickyBtn) {
          stickyBtn.addEventListener('click', function () {
            var btn = product.querySelector('[data-y-main-atc] button[type="submit"]');
            if (btn) btn.click();
          });
        }
        var queued = false;
        var updateSticky = function () {
          queued = false;
          sticky.classList.toggle('is-visible', mainAtc.getBoundingClientRect().bottom < 0);
        };
        var queueSticky = function () {
          if (queued) return;
          queued = true;
          requestAnimationFrame(updateSticky);
        };
        window.addEventListener('scroll', queueSticky, { passive: true });
        window.addEventListener('resize', queueSticky);
        updateSticky();
      }
    });
  }

  function updateVariant(product, variant) {
    var buttons = product.querySelectorAll('[data-y-atc-button]');
    var labels = product.querySelectorAll('[data-y-atc-label]');
    if (!variant) {
      buttons.forEach(function (b) { b.setAttribute('disabled', 'disabled'); });
      labels.forEach(function (l) { l.textContent = l.dataset.unavailable; });
      return;
    }
    product.querySelectorAll('input[name="id"]').forEach(function (input) {
      input.value = variant.id;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    product.querySelectorAll('[data-y-price]').forEach(function (el) { el.innerHTML = variant.price; });
    product.querySelectorAll('[data-y-compare]').forEach(function (el) {
      el.innerHTML = variant.compare || '';
      el.hidden = !variant.compare;
    });
    product.querySelectorAll('[data-y-save]').forEach(function (el) {
      el.textContent = (el.dataset.template || '').replace('[percent]', variant.save + '%');
      el.hidden = !variant.save;
    });
    product.querySelectorAll('[data-y-installment]').forEach(function (el) { el.innerHTML = variant.installment; });
    buttons.forEach(function (b) {
      if (variant.available) b.removeAttribute('disabled'); else b.setAttribute('disabled', 'disabled');
    });
    labels.forEach(function (l) {
      l.textContent = variant.available ? l.dataset.available : l.dataset.soldout;
    });
    product.querySelectorAll('[data-y-atc-price]').forEach(function (el) {
      el.innerHTML = variant.price;
      el.parentElement.hidden = !variant.available;
    });
    if (variant.media_id) {
      var gallery = product.querySelector('[data-y-gallery]');
      var slide = gallery && gallery.querySelector('[data-media-id="' + variant.media_id + '"]');
      if (slide && gallery.yGoTo) gallery.yGoTo(Array.prototype.indexOf.call(slide.parentElement.children, slide));
    }
    if (!window.Shopify || !window.Shopify.designMode) {
      var url = new URL(window.location.href);
      url.searchParams.set('variant', variant.id);
      window.history.replaceState({}, '', url.toString());
    }
  }

  function initSliders(root) {
    root.querySelectorAll('[data-y-slider]').forEach(function (slider) {
      if (slider.dataset.yReady) return;
      slider.dataset.yReady = 'true';
      var track = slider.querySelector('.y-slider__track');
      var prev = slider.querySelector('.y-slider__arrow--prev');
      var next = slider.querySelector('.y-slider__arrow--next');
      if (!track) return;
      function step() {
        var item = track.firstElementChild;
        return item ? item.getBoundingClientRect().width + 16 : track.clientWidth;
      }
      function update() {
        if (prev) prev.disabled = track.scrollLeft <= 4;
        if (next) next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      }
      if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
      if (next) next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); });
      track.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      update();
    });
  }

  function initCompare(root) {
    root.querySelectorAll('[data-y-compare-frame]').forEach(function (frame) {
      if (frame.dataset.yReady) return;
      frame.dataset.yReady = 'true';
      var range = frame.querySelector('.y-compare__range');
      if (!range) return;
      function set() { frame.style.setProperty('--pos', range.value + '%'); }
      range.addEventListener('input', set);
      set();
    });
  }

  function init(root) {
    root = root || document;
    initGallery(root);
    initCountdowns(root);
    initProduct(root);
    initSliders(root);
    initCompare(root);
  }

  window.YumiPdp = { init: init };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }
  document.addEventListener('shopify:section:load', function (event) { init(event.target); });
})();
