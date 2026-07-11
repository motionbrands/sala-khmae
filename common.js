/* ════════════════════════════════════════════════════════════════
   Sāla Khmae — Shared behaviour: sticky nav, availability calendar,
   booking form (Netlify Forms + WhatsApp fallback).
   Loaded on index.html, zimmer.html, restaurant.html.
   ════════════════════════════════════════════════════════════════ */

var WA_NUMBER = '85512345678';

/* ── Sticky nav: transparent over any top hero, solid once scrolled past ── */
(function () {
  var nav = document.getElementById('siteNav');
  if (!nav) return;
  var hero = document.querySelector('.hero, .page-hero');
  if (!hero) return;

  var ticking = false;
  function update() {
    ticking = false;
    var heroBottom = hero.getBoundingClientRect().bottom;
    nav.classList.toggle('scrolled', heroBottom < 80);
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();

/* ════════════════════════════════════════════════════════════════
   AVAILABILITY DATA
   Mock data for now. To wire up Google Sheets later: replace the
   body of getAvailability() with a fetch to a published Sheet
   (Apps Script Web App JSON endpoint or a CSV-to-JSON proxy) that
   resolves to the SAME shape:
     { "YYYY-MM-DD": { available: <0-4>, total: 4 }, ... }
   Dates not present in the map are treated as fully open (4/4).
   ════════════════════════════════════════════════════════════════ */
function getAvailability() {
  // TODO: swap for real data, e.g.:
  // return fetch('https://script.google.com/macros/s/XXXX/exec').then(r => r.json());
  var mock = {};
  var today = new Date();
  for (var i = 0; i < 90; i++) {
    var d = new Date(today);
    d.setDate(d.getDate() + i);
    var key = d.toISOString().slice(0, 10);
    var roll = (i * 37 + 11) % 10; // deterministic pseudo-pattern, no randomness on reload
    if (roll < 1) mock[key] = { available: 0, total: 4 };
    else if (roll < 3) mock[key] = { available: 1, total: 4 };
    else mock[key] = { available: 4, total: 4 };
  }
  return Promise.resolve(mock);
}

/* ════════════════════════════════════════════════════════════════
   CALENDAR
   ════════════════════════════════════════════════════════════════ */
(function () {
  var root = document.getElementById('availabilityCalendar');
  if (!root) return;

  var monthLabel = root.querySelector('.calendar__month');
  var grid       = root.querySelector('.calendar__grid');
  var prevBtn    = root.querySelector('.calendar__nav--prev');
  var nextBtn    = root.querySelector('.calendar__nav--next');
  var note       = root.querySelector('.calendar__note');
  var checkinInput = document.getElementById('bfCheckin');

  var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var view = new Date(today.getFullYear(), today.getMonth(), 1);
  var availability = {};
  var selectedKey = null;

  function key(d) { return d.toISOString().slice(0, 10); }

  function statusFor(d) {
    var a = availability[key(d)];
    if (!a) return 'open';
    if (a.available <= 0) return 'full';
    if (a.available <= 1) return 'limited';
    return 'open';
  }

  function render() {
    monthLabel.textContent = MONTH_NAMES[view.getMonth()] + ' ' + view.getFullYear();
    grid.innerHTML = '';

    DOW.forEach(function (d) {
      var el = document.createElement('div');
      el.className = 'calendar__dow';
      el.textContent = d;
      grid.appendChild(el);
    });

    var firstDow = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
    var daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();

    for (var i = 0; i < firstDow; i++) {
      var pad = document.createElement('div');
      pad.className = 'calendar__day empty';
      grid.appendChild(pad);
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var d = new Date(view.getFullYear(), view.getMonth(), day);
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'calendar__day';
      cell.textContent = day;

      if (d < today) {
        cell.classList.add('past');
      } else {
        var st = statusFor(d);
        cell.classList.add(st);
        if (key(d) === selectedKey) cell.classList.add('selected');
        cell.addEventListener('click', function (dateObj) {
          return function () {
            selectedKey = key(dateObj);
            if (checkinInput) checkinInput.value = selectedKey;
            var a = availability[selectedKey];
            var left = a ? a.available : 4;
            note.textContent = left > 0
              ? left + ' of 4 bungalows available on ' + selectedKey
              : 'Fully booked on ' + selectedKey;
            render();
          };
        }(d));
      }
      grid.appendChild(cell);
    }
  }

  prevBtn.addEventListener('click', function () {
    view.setMonth(view.getMonth() - 1);
    render();
  });
  nextBtn.addEventListener('click', function () {
    view.setMonth(view.getMonth() + 1);
    render();
  });

  getAvailability().then(function (data) {
    availability = data;
    render();
  });
})();

/* ════════════════════════════════════════════════════════════════
   BOOKING FORM — Netlify Forms (AJAX) + "Send via WhatsApp" fallback
   ════════════════════════════════════════════════════════════════ */
(function () {
  var form = document.getElementById('bookingForm');
  if (!form) return;

  var status = document.getElementById('bfStatus');
  var waBtn  = document.getElementById('bfWaBtn');

  function encode(data) {
    return Object.keys(data).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]);
    }).join('&');
  }

  function readFields() {
    return {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      checkin: form.checkin.value,
      checkout: form.checkout.value,
      guests: form.guests.value,
      package: form.package.value,
      message: form.message.value.trim()
    };
  }

  function waLink(f) {
    var lines = [
      'Hi, I\'d like to book a stay at Sāla Khmae.',
      f.name ? 'Name: ' + f.name : null,
      f.checkin ? 'Check-in: ' + f.checkin : null,
      f.checkout ? 'Check-out: ' + f.checkout : null,
      f.guests ? 'Guests: ' + f.guests : null,
      f.package ? 'Package: ' + f.package : null,
      f.message ? 'Message: ' + f.message : null
    ].filter(Boolean).join('\n');
    return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(lines);
  }

  // Keep the WhatsApp button's href in sync with whatever's typed
  form.addEventListener('input', function () {
    waBtn.href = waLink(readFields());
  });
  waBtn.href = waLink(readFields());

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // Honeypot: bots fill every field, humans never see this one
    if (form['bot-field'] && form['bot-field'].value) return;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    status.textContent = 'Sending…';
    status.classList.remove('error');

    var payload = readFields();
    payload['form-name'] = 'booking';

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encode(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error('Network response was not ok');
      status.textContent = 'Thank you — we’ll reply within 2 hours. You can also message us on WhatsApp any time.';
      form.reset();
    }).catch(function () {
      status.textContent = 'Couldn’t send — please use the WhatsApp button below instead.';
      status.classList.add('error');
    });
  });
})();
