(function () {
  if (window.YumiCart) return;

  var RESERVE_KEY = 'yumiCartReserveEnd';
  var GIFT_PROP = '_yumi_gift';
  var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  var syncing = false;
  var pendingSync = false;

  function drawer() {
    return document.querySelector('cart-drawer');
  }

  function jsonFetch(url, body) {
    var opts = body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }
      : { headers: { Accept: 'application/json' } };
    return fetch(url, opts).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw data;
        return data;
      });
    });
  }

  /* Reservation timer: one end time per browser session, survives drawer re-renders. */
  function tickReserve() {
    var els = document.querySelectorAll('[data-yc-time]');
    if (!els.length) return;
    var holder = document.querySelector('[data-yc-reserve]');
    var minutes = holder ? parseInt(holder.dataset.minutes, 10) || 10 : 10;
    var end = 0;
    try { end = parseInt(sessionStorage.getItem(RESERVE_KEY), 10) || 0; } catch (e) {}
    if (!end || end < Date.now()) {
      end = Date.now() + minutes * 60000;
      try { sessionStorage.setItem(RESERVE_KEY, String(end)); } catch (e) {}
    }
    var left = Math.max(0, Math.round((end - Date.now()) / 1000));
    var text = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
    els.forEach(function (el) { el.textContent = text; });
  }
  setInterval(tickReserve, 1000);

  /* Re-render drawer contents and the header cart bubble via the Section Rendering API. */
  function refreshDrawer() {
    var d = drawer();
    if (!d) return Promise.resolve();
    return fetch(root + '?sections=cart-drawer,cart-icon-bubble')
      .then(function (r) { return r.json(); })
      .then(function (sections) {
        var parser = new DOMParser();
        var html = parser.parseFromString(sections['cart-drawer'], 'text/html');
        var freshInner = html.querySelector('.drawer__inner');
        var inner = d.querySelector('.drawer__inner');
        if (freshInner && inner) inner.innerHTML = freshInner.innerHTML;
        var freshDrawer = html.querySelector('cart-drawer');
        if (freshDrawer) {
          d.classList.toggle('is-empty', freshDrawer.classList.contains('is-empty'));
          d.setAttribute('data-yc-gifts', freshDrawer.getAttribute('data-yc-gifts') || '[]');
        }
        var bubble = document.getElementById('cart-icon-bubble');
        if (bubble && sections['cart-icon-bubble']) {
          var bubbleHtml = parser.parseFromString(sections['cart-icon-bubble'], 'text/html').querySelector('.shopify-section');
          if (bubbleHtml) bubble.innerHTML = bubbleHtml.innerHTML;
        }
        tickReserve();
      })
      .catch(function (e) { console.error(e); });
  }

  function giftConfig() {
    var d = drawer();
    if (!d) return [];
    try { return JSON.parse(d.getAttribute('data-yc-gifts') || '[]'); } catch (e) { return []; }
  }

  function isGift(item) {
    return item.properties && item.properties[GIFT_PROP];
  }

  /* Add / remove automatic gifts based on the paid subtotal. */
  function syncGifts() {
    if (syncing) { pendingSync = true; return Promise.resolve(); }
    var gifts = giftConfig();
    syncing = true;
    return jsonFetch(root + 'cart.js')
      .then(function (cart) {
        var giftLines = cart.items.filter(isGift);
        if (!gifts.length && !giftLines.length) return false;
        var paid = cart.items.filter(function (i) { return !isGift(i); });
        var subtotal = paid.reduce(function (sum, i) { return sum + i.final_line_price; }, 0);
        var updates = {};
        var toAdd = [];

        gifts.forEach(function (gift) {
          var eligible = paid.length > 0 && subtotal >= gift.min;
          var line = giftLines.find(function (l) { return l.variant_id === gift.id; });
          if (eligible && !line) toAdd.push({ id: gift.id, quantity: 1, properties: { _yumi_gift: 'true' } });
          if (!eligible && line) updates[line.key] = 0;
          if (eligible && line && line.quantity !== 1) updates[line.key] = 1;
        });
        giftLines.forEach(function (line) {
          var configured = gifts.some(function (g) { return g.id === line.variant_id; });
          if (!configured) updates[line.key] = 0;
        });

        var chain = Promise.resolve(false);
        if (Object.keys(updates).length) {
          chain = chain.then(function () { return jsonFetch(root + 'cart/update.js', { updates: updates }); }).then(function () { return true; });
        }
        if (toAdd.length) {
          chain = chain.then(function (changed) {
            return jsonFetch(root + 'cart/add.js', { items: toAdd })
              .then(function () { return true; })
              .catch(function (e) { console.warn('YUMI gift could not be added', e); return changed; });
          });
        }
        return chain;
      })
      .then(function (changed) { return changed ? refreshDrawer() : null; })
      .catch(function (e) { console.error(e); })
      .finally(function () {
        syncing = false;
        if (pendingSync) { pendingSync = false; syncGifts(); }
      });
  }

  /* Upsell "add" buttons inside the drawer. */
  document.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-yc-add]');
    if (!btn) return;
    event.preventDefault();
    btn.setAttribute('aria-busy', 'true');
    jsonFetch(root + 'cart/add.js', { items: [{ id: parseInt(btn.dataset.ycAdd, 10), quantity: 1 }] })
      .then(function () { return syncGifts(); })
      .then(function () { return refreshDrawer(); })
      .catch(function (e) {
        btn.removeAttribute('aria-busy');
        var errors = document.getElementById('CartDrawer-CartErrors');
        if (errors) errors.textContent = (e && e.description) || (window.cartStrings && window.cartStrings.error) || '';
      });
  });

  function subscribeToCart() {
    if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
      subscribe(PUB_SUB_EVENTS.cartUpdate, function () { syncGifts(); });
    }
  }

  /* Theme editor: open the drawer while its section is selected. */
  document.addEventListener('shopify:section:select', function (event) {
    if (event.detail && event.detail.sectionId === 'cart-drawer' && drawer()) drawer().open();
  });
  document.addEventListener('shopify:section:deselect', function (event) {
    if (event.detail && event.detail.sectionId === 'cart-drawer' && drawer()) drawer().close();
  });

  function init() {
    subscribeToCart();
    tickReserve();
    if (!(window.Shopify && window.Shopify.designMode)) syncGifts();
  }

  window.YumiCart = { refresh: refreshDrawer, syncGifts: syncGifts };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
