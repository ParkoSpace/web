// ═══════════════════════════════════════════════════════════════
//  PARKOSPACE — app.js  (Google Maps Edition)
//  Map: Google Maps JS API (loaded dynamically from /api/config)
//  Auth: Flask session cookies (30-day persistent)
// ═══════════════════════════════════════════════════════════════

const state = {
  view: 'landing',
  listings: [],
  userLoc: null,
  radius: 5,
  map: null,           // google.maps.Map instance
  currentUser: null,
  editMode: false,
  editId: null,
  parsedLocation: null,
  userMarker: null,    // google.maps.Marker
  searchMarker: null,
  _listingMarkers: [],
  _infoWindow: null,
  _radiusTm: null,
  _gmapsLoaded: false,
  _gmapsKey: '',
  _gmapsMapId: '6062647ef5491f7110b5de54',
};

// Default map center when GPS is unavailable (wide India view)
const MAP_DEFAULT = { lat: 20.5937, lng: 78.9629 };

// ── TOAST ──────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  let tc = document.getElementById('toast-container');
  if (!tc) { tc = document.createElement('div'); tc.id = 'toast-container'; document.body.appendChild(tc); }
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  tc.appendChild(t);
  setTimeout(() => t.remove(), 3100);
}

// ── GOOGLE MAPS LOADER ─────────────────────────────────────────
// Loads the Google Maps JS SDK dynamically using the key from /api/config
async function loadGoogleMaps() {
  if (state._gmapsLoaded) return true;

  try {
    const cfg = await fetch('/api/config').then(r => r.json());
    if (!cfg.hasGoogleMaps) {
      console.warn('[Maps] No Google Maps key configured — using OpenStreetMap fallback');
      return false;
    }
    state._gmapsKey = cfg.googleMapsApiKey;
    if (cfg.googleMapsMapId) state._gmapsMapId = cfg.googleMapsMapId;
  } catch (e) {
    console.error('[Maps] Could not fetch config:', e);
    return false;
  }

  return new Promise((resolve) => {
    window._gmapsCallback = () => { state._gmapsLoaded = true; resolve(true); };
    const mapIds = encodeURIComponent(state._gmapsMapId);
    const script = document.createElement('script');
    // map_ids + v=weekly required for cloud styles (monochrome / light / hybrid)
    script.src = `https://maps.googleapis.com/maps/api/js?key=${state._gmapsKey}&loading=async&v=weekly&libraries=places,marker&map_ids=${mapIds}&callback=_gmapsCallback&language=en`;
    script.async = true;
    script.defer = true;
    script.onerror = () => { console.error('[Maps] Failed to load Google Maps SDK'); resolve(false); };
    document.head.appendChild(script);
  });
}

// ── GPS ─────────────────────────────────────────────────────────
function locateUser(onSuccess, silent = false) {
  const btn = document.getElementById('btn-locate');
  if (btn) { btn.innerHTML = '<i data-lucide="loader" class="animate-spin w-4 h-4"></i>'; lucide.createIcons(); }

  if (!navigator.geolocation) { 
    if (!silent) toast('Geolocation not supported', 'error'); 
    if (btn) { btn.innerHTML = '<i data-lucide="crosshair" class="w-4 h-4"></i>'; lucide.createIcons(); }
    return; 
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
      state.userLoc = { lat, lng };
      toast(`GPS locked ±${Math.round(acc)}m`, 'success');
      if (state.map) {
        state.map.panTo({ lat, lng });
        state.map.setZoom(16);
        placeUserMarker(lat, lng);
      }
      if (onSuccess) onSuccess(lat, lng); else fetchAndRenderListings();
      if (btn) { btn.innerHTML = '<i data-lucide="crosshair" class="w-4 h-4"></i>'; lucide.createIcons(); }
    },
    (err) => {
      const msgs = { 1: 'Location permission denied', 2: 'Position unavailable', 3: 'GPS timed out' };
      if (!silent) toast(msgs[err.code] || 'Could not get location', 'error');
      else console.warn('GPS location request failed:', msgs[err.code] || err.message);
      if (btn) { btn.innerHTML = '<i data-lucide="crosshair" class="w-4 h-4"></i>'; lucide.createIcons(); }
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

// ── GOOGLE MAPS — USER MARKER ───────────────────────────────────
function placeUserMarker(lat, lng) {
  if (!state.map || !state._gmapsLoaded) return;

  if (state.userMarker) state.userMarker.setMap(null);

  state.userMarker = new google.maps.Marker({
    position: { lat, lng },
    map: state.map,
    title: 'You are here',
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: '#00d4ff',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2.5,
    },
    zIndex: 999,
  });

  // Pulsing ring using a second marker overlay
  if (state._userRingMarker) state._userRingMarker.setMap(null);
  state._userRingMarker = new google.maps.Marker({
    position: { lat, lng },
    map: state.map,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 22,
      fillColor: '#00d4ff',
      fillOpacity: 0.12,
      strokeColor: '#00d4ff',
      strokeWeight: 1.5,
      strokeOpacity: 0.4,
    },
    zIndex: 998,
  });

  state._infoWindow = state._infoWindow || new google.maps.InfoWindow();
  state._infoWindow.setContent('<b style="color:#00d4ff;font-family:monospace;font-size:13px">📍 You are here</b>');
  state._infoWindow.open(state.map, state.userMarker);
}

// ── GOOGLE MAPS — LISTING MARKERS ──────────────────────────────
function updateMapMarkers() {
  if (!state.map || !state._gmapsLoaded) return;

  // Clear old markers
  state._listingMarkers.forEach(m => m.setMap(null));
  state._listingMarkers = [];

  const iw = new google.maps.InfoWindow();

  state.listings.forEach(l => {
    const color  = l.is_sold ? '#f72585' : '#06ffa5';
    const label  = l.is_sold ? 'SOLD' : `₹${l.price_hourly}/h`;

    // Custom div overlay label
    const pin = document.createElement('div');
    pin.style.cssText = `
    background:#06060f;
    border:2px solid ${color};
    color:white;
    padding:5px 11px;
    border-radius:10px;
    font-weight:800;
    font-family:monospace;
    font-size:12px;
    box-shadow:0 0 16px ${color}55;
    white-space:nowrap;
    cursor:pointer;
    transition:transform 0.15s;
    `;
    pin.textContent = label;
    pin.onmouseover = () => { pin.style.transform = 'scale(1.1)'; };
    pin.onmouseout  = () => { pin.style.transform = 'scale(1)'; };

    const marker = new google.maps.marker.AdvancedMarkerElement({
      position: { lat: l.lat, lng: l.lng },
      map: state.map,
      title: l.title,
      content: pin,
    });

    bindAdvancedMarkerClick(marker, () => {
      iw.setContent(buildInfoWindowHtml(l));
      iw.open(state.map, marker);
      setTimeout(() => lucide.createIcons(), 50);
    });

    state._listingMarkers.push(marker);
  });

  if (state.userLoc) placeUserMarker(state.userLoc.lat, state.userLoc.lng);
}

// ── GOOGLE MAPS — INFO WINDOW HTML ─────────────────────────────
function buildInfoWindowHtml(l) {
  return `
  <div style="min-width:210px;font-family:'Space Grotesk',sans-serif;padding:4px 0">
  <h3 style="font-weight:800;font-size:14px;margin-bottom:5px;color:white">${l.title}</h3>
  ${l.area_landmark ? `<p style="font-size:11px;color:#00d4ff;margin-bottom:7px">📍 ${l.area_landmark}</p>` : ''}
  ${l.is_sold ? `<div style="background:#f7258520;border:1px solid #f72585;color:#f72585;text-align:center;padding:4px;border-radius:6px;font-size:11px;font-weight:800;margin-bottom:8px">SOLD OUT</div>` : ''}
  <div style="background:rgba(255,255,255,0.04);padding:10px;border-radius:10px;margin-bottom:10px;border:1px solid rgba(255,255,255,0.08)">
  <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px">
  <span style="color:#9ca3af">Hourly</span><span style="color:#00d4ff;font-weight:700">₹${l.price_hourly}</span>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px">
  <span style="color:#9ca3af">Daily</span><span style="color:#06ffa5;font-weight:700">₹${l.price_daily}</span>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:12px">
  <span style="color:#9ca3af">Size</span><span style="color:white;font-weight:700">${l.length}×${l.breadth}m</span>
  </div>
  </div>
  ${!l.is_sold ? `
    <div style="display:flex;gap:7px">
    <a href="${l.gmap_link}" target="_blank" style="flex:1;background:#00d4ff;color:#05050f;padding:8px;border-radius:9px;font-size:12px;font-weight:800;text-align:center;text-decoration:none">Navigate</a>
    <a href="tel:${l.owner_phone}" style="flex:1;border:1px solid #06ffa5;color:#06ffa5;padding:8px;border-radius:9px;font-size:12px;font-weight:800;text-align:center;text-decoration:none">Call</a>
    </div>` : ''}
    </div>`;
}

// ── GOOGLE MAPS DARK STYLE ──────────────────────────────────────
const DARK_MAP_STYLE = [
  { elementType: 'geometry',           stylers: [{ color: '#0b0b18' }] },
{ elementType: 'labels.text.stroke', stylers: [{ color: '#06060f' }] },
{ elementType: 'labels.text.fill',   stylers: [{ color: '#746855' }] },
{ featureType: 'road',               elementType: 'geometry',           stylers: [{ color: '#18182a' }] },
{ featureType: 'road',               elementType: 'geometry.stroke',    stylers: [{ color: '#212135' }] },
{ featureType: 'road',               elementType: 'labels.text.fill',   stylers: [{ color: '#9ca5b3' }] },
{ featureType: 'road.highway',       elementType: 'geometry',           stylers: [{ color: '#1e1e35' }] },
{ featureType: 'road.highway',       elementType: 'geometry.stroke',    stylers: [{ color: '#1f2651' }] },
{ featureType: 'road.highway',       elementType: 'labels.text.fill',   stylers: [{ color: '#f3d19c' }] },
{ featureType: 'water',              elementType: 'geometry',           stylers: [{ color: '#050514' }] },
{ featureType: 'water',              elementType: 'labels.text.fill',   stylers: [{ color: '#515c6d' }] },
{ featureType: 'water',              elementType: 'labels.text.stroke', stylers: [{ color: '#17263c' }] },
{ featureType: 'poi',                elementType: 'geometry',           stylers: [{ color: '#0f1628' }] },
{ featureType: 'poi',                elementType: 'labels.text.fill',   stylers: [{ color: '#d59563' }] },
{ featureType: 'poi.park',           elementType: 'geometry',           stylers: [{ color: '#0a1a0a' }] },
{ featureType: 'poi.park',           elementType: 'labels.text.fill',   stylers: [{ color: '#6b9a76' }] },
{ featureType: 'transit',            elementType: 'geometry',           stylers: [{ color: '#2f3948' }] },
{ featureType: 'transit.station',    elementType: 'labels.text.fill',   stylers: [{ color: '#d59563' }] },
{ featureType: 'administrative',     elementType: 'geometry.stroke',    stylers: [{ color: '#4b6878' }] },
{ featureType: 'administrative.land_parcel', elementType: 'geometry.stroke', stylers: [{ color: '#37475a' }] },
{ featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#ae9e90' }] },
];

// ── PLACES AUTOCOMPLETE ─────────────────────────────────────────
function initPlacesAutocomplete() {
  const input = document.getElementById('map-search-input');
  if (!input || !state._gmapsLoaded) return;

  const ac = new google.maps.places.Autocomplete(input, {
    fields: ['geometry', 'formatted_address', 'name'],
  });

  ac.addListener('place_changed', () => {
    const place = ac.getPlace();
    if (!place.geometry) { toast('Location not found', 'error'); return; }

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    state.userLoc = { lat, lng };

    state.map.panTo({ lat, lng });
    state.map.setZoom(15);

    if (state.searchMarker) state.searchMarker.setMap(null);
    state.searchMarker = new google.maps.Marker({ position: { lat, lng }, map: state.map });

    fetchAndRenderListings();
    toast(`Moved to: ${(place.name || place.formatted_address).split(',')[0]}`, 'info');
  });
}

// ── MAP URL PARSER ──────────────────────────────────────────────
function normalizeMapUrl(raw) {
  let url = (raw || '').trim().replace(/[\u200b-\u200d\ufeff]/g, '');
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function buildExpandedMapUrl(lat, lng, address) {
  const label = encodeURIComponent((address || 'Location').split(',')[0].slice(0, 100));
  const la = Number(lat).toFixed(7);
  const ln = Number(lng).toFixed(7);
  return `https://www.google.com/maps/place/${label}/@${la},${ln},17z/data=!3m1!4b1!4m6!3m5!1s0:0!8m2!3d${la}!4d${ln}`;
}

function parseCoordsFromUrl(raw) {
  const url = normalizeMapUrl(raw);
  if (!url) return null;
  const direct = url.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
  if (direct) {
    const lat = parseFloat(direct[1]);
    const lng = parseFloat(direct[2]);
    return { lat, lng, address: 'Pinned Location', expanded_url: buildExpandedMapUrl(lat, lng, 'Pinned Location') };
  }
  let lat = null;
  let lng = null;
  const pin3d = url.match(/!3d(-?\d+\.\d+).*?!4d(-?\d+\.\d+)/);
  if (pin3d) {
    lat = parseFloat(pin3d[1]);
    lng = parseFloat(pin3d[2]);
  } else {
    const patterns = [
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,
      /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
      /center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/i,
      /ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) { lat = parseFloat(m[1]); lng = parseFloat(m[2]); break; }
    }
  }
  if (lat == null || lng == null) return null;
  let address = 'Location Detected';
  const place = url.match(/\/place[s]?\/([^/@?&]+)/i);
  if (place) {
    try { address = decodeURIComponent(place[1].replace(/\+/g, ' ')).trim() || address; } catch (_) {}
  }
  return { lat, lng, address, expanded_url: buildExpandedMapUrl(lat, lng, address) };
}

function showMapUrlSuccess(statusDiv, data, urlEl) {
  const expanded = data.expanded_url || buildExpandedMapUrl(data.lat, data.lng, data.address);
  state.parsedLocation = { lat: data.lat, lng: data.lng, address: data.address, expanded_url: expanded };
  // Only set the URL if the field is empty (GPS mode) — preserve the owner's original pasted link
  if (urlEl && !urlEl.value.trim()) urlEl.value = expanded;
  statusDiv.innerHTML = `
  <div style="margin-top:8px;background:rgba(6,255,165,0.06);border:1px solid rgba(6,255,165,0.2);padding:12px;border-radius:12px;font-size:0.78rem">
  <div style="color:var(--green);font-weight:700;display:flex;align-items:center;gap:4px;margin-bottom:4px"><i data-lucide="check-circle" class="w-3 h-3"></i> Location Verified</div>
  <div style="color:#e2e8f0;font-weight:600">${data.address}</div>
  <div style="font-family:var(--font-mono);color:rgba(255,255,255,0.3);margin-top:4px;font-size:0.65rem">${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}</div>
  <div style="color:rgba(0,212,255,0.55);font-size:0.65rem;margin-top:6px">Coordinates extracted · Your link is preserved for navigation</div>
  </div>`;
  lucide.createIcons();
  toast('Location verified — original link is preserved for navigation', 'success');
}

function mapUrlErrorHtml(message) {
  return `<span style="color:var(--pink);font-size:0.75rem;font-weight:700;display:block;margin-bottom:8px">✕ ${message}</span>`;
}

async function parseMapUrl() {
  const urlEl     = document.getElementById('in-gmap-confirm');
  const statusDiv = document.getElementById('url-status');
  const rawVal    = urlEl.value.trim();
  const url       = normalizeMapUrl(rawVal);
  const landmark  = document.getElementById('in-landmark')?.value?.trim() || '';
  if (!url && !landmark) { toast('Paste a Maps link or fill Area/Landmark', 'error'); return; }
  if (url) urlEl.value = url;

  // Check if we can parse the coordinates locally on the client side first
  const localParsed = parseCoordsFromUrl(rawVal);
  if (localParsed) {
    showMapUrlSuccess(statusDiv, localParsed, urlEl);
    return;
  }

  statusDiv.innerHTML = `<span style="color:var(--cyan);font-size:0.75rem;display:flex;align-items:center;gap:4px"><i data-lucide="loader" class="animate-spin w-3 h-3"></i> Geocoding & updating link…</span>`;
  lucide.createIcons();

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const res  = await fetch('/api/utils/parse-map-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url || '', landmark }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    if (data.success) {
      showMapUrlSuccess(statusDiv, data, urlEl);
    } else {
      statusDiv.innerHTML = mapUrlErrorHtml(data.error || 'Could not detect location');
      lucide.createIcons();
      toast(data.error || 'Could not detect location', 'error');
    }
  } catch (e) {
    statusDiv.innerHTML = mapUrlErrorHtml(e.name === 'AbortError' ? 'Request timed out' : 'Connection error');
    lucide.createIcons();
    if (e.name === 'AbortError') toast('Request timed out', 'error');
    else toast('Connection error', 'error');
  }
}

// ── LOCATION SEARCH FALLBACK (Enter key) ───────────────────────
async function searchLocation(e) {
  if (e.key !== 'Enter') return;
  const query = e.target.value.trim();
  if (!query) return;
  try {
    const res  = await fetch('/api/utils/search-location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    const data = await res.json();
    if (data.success) {
      state.userLoc = { lat: data.lat, lng: data.lng };
      if (state.map) {
        state.map.panTo({ lat: data.lat, lng: data.lng });
        state.map.setZoom(15);
        fetchAndRenderListings();
      }
      toast(`Moved to: ${data.address.split(',')[0]}`, 'info');
    } else toast('Location not found', 'error');
  } catch (err) { toast('Search failed', 'error'); }
}

// ── CHAT ANIMATION ──────────────────────────────────────────────
async function startChatAnimation() {
  const msgs = [
    { id: 'chat-1', text: "I finally bought my first car today! I'm so happy. I just pulled into our lane… but now I can't find any parking near my home.", delay: 500 },
    { id: 'chat-2', text: "Yeah, man. These days getting a parking space is nearly impossible. Everywhere is full.", delay: 1000 },
    { id: 'chat-3', text: "No problem. We've got you covered! Find verified nearby parking spots instantly — safe, easy, and affordable.", delay: 1000, speed: 20 },
  ];
  for (const item of msgs) {
    await new Promise(r => setTimeout(r, item.delay));
    const el = document.getElementById(item.id);
    if (!el) continue;
    const bubble = el.querySelector('.msg-bubble');
    el.classList.add('visible');
    bubble.classList.add('typing-cursor');
    for (let i = 0; i < item.text.length; i++) {
      bubble.textContent += item.text[i];
      await new Promise(r => setTimeout(r, item.speed || 38));
    }
    bubble.classList.remove('typing-cursor');
  }
}

// ── LANDING ─────────────────────────────────────────────────────
function renderLanding() {
  state.view = 'landing';
  document.getElementById('app').innerHTML = `
  <div style="background:var(--bg);min-height:100vh;overflow-x:hidden">

  <!-- NAV -->
  <nav style="position:fixed;top:0;left:0;right:0;z-index:50;padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center" class="nav-blur">
  <div style="display:flex;align-items:center;gap:12px">
  <img src="/static/logo.png" alt="ParkoSpace" style="height:36px;width:36px;object-fit:contain">
  <div style="font-family:var(--font-display);font-size:1.6rem;letter-spacing:0.04em;color:var(--cyan);line-height:1">
  PARKO<span style="color:rgba(255,255,255,0.6)">SPACE</span>
  <span style="display:block;font-family:var(--font-mono);font-size:0.5rem;color:rgba(255,255,255,0.2);letter-spacing:0.2em;margin-top:2px">PARK SMARTER · ANYWHERE</span>
  </div>
  </div>
  <div style="display:flex;gap:8px;align-items:center">
  <button onclick="checkOwnerAuth()" class="nav-partner-btn">${state.currentUser
    ? `<span class="nav-dash-stack"><span class="nav-dash-line">Dash</span><span class="nav-dash-line">board</span></span>`
    : 'Partner'}</button>
  <button onclick="goToMap()" class="btn-glow" style="background:var(--cyan);color:#05050f;font-size:0.875rem;font-family:var(--font-body);font-weight:700;padding:10px 22px;border-radius:12px;border:none;cursor:pointer">Find Parking</button>
  </div>
  </nav>

  <!-- HERO — full viewport, everything centred -->
  <section style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:100px 24px 60px;position:relative;overflow:hidden">

  <!-- Ambient blobs -->
  <div style="position:absolute;top:10%;left:-10%;width:500px;height:500px;border-radius:50%;background:radial-gradient(ellipse,rgba(155,93,229,0.14),transparent 70%);filter:blur(60px);pointer-events:none"></div>
  <div style="position:absolute;bottom:10%;right:-10%;width:500px;height:500px;border-radius:50%;background:radial-gradient(ellipse,rgba(0,212,255,0.1),transparent 70%);filter:blur(60px);pointer-events:none"></div>

  <!-- Badge -->
  <div class="mono-tag" style="margin-bottom:2rem;display:inline-flex">
  <span style="width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block;flex-shrink:0;box-shadow:0 0 10px var(--green)"></span>
  VERIFIED PARKING
  </div>

  <!-- Headline -->
  <h1 style="font-family:var(--font-display);font-size:clamp(2.2rem,10vw,8.5rem);letter-spacing:0.02em;line-height:0.92;color:white;margin-bottom:0.2em">
  SMART PARKING
  </h1>
  <h2 class="gradient-headline" style="font-family:var(--font-display);font-size:clamp(2.2rem,10vw,8.5rem);letter-spacing:0.02em;line-height:0.92;margin-bottom:1.8rem">
  REIMAGINED
  </h2>

  <!-- Sub -->
  <p style="color:rgba(180,195,220,0.6);line-height:1.85;font-weight:300;font-size:clamp(1rem,2vw,1.15rem);max-width:480px;margin:0 auto 2.5rem auto">
  Your driveway is an asset.<br/>Someone else's car needs a home.<br/>
  We connect the two — <strong style="color:var(--cyan);font-weight:600">instantly.</strong>
  </p>

  <!-- CTA buttons — centred row -->
  <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;align-items:center">
  <button onclick="goToMap()" class="btn-glow" style="background:var(--cyan);color:#05050f;font-family:var(--font-body);font-weight:700;font-size:1rem;padding:14px 36px;border-radius:14px;border:none;cursor:pointer;display:flex;align-items:center;gap:8px">
  <i data-lucide="search" style="width:20px;height:20px"></i> Find a Spot
  </button>
  <button onclick="checkOwnerAuth()" class="btn-glow" style="border:2px solid var(--pink);color:var(--pink);font-family:var(--font-body);font-weight:700;font-size:1rem;padding:14px 36px;border-radius:14px;background:transparent;cursor:pointer;display:flex;align-items:center;gap:8px">
  <i data-lucide="plus" style="width:20px;height:20px"></i> List My Space
  </button>
  </div>

  <!-- Scroll hint -->
  <div style="position:absolute;bottom:28px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.15);animation:float 3s ease-in-out infinite">
  <i data-lucide="chevrons-down" style="width:28px;height:28px"></i>
  </div>
  </section>

  <!-- PROBLEM / SOLUTION -->
  <section style="padding:80px 24px;background:rgba(0,0,0,0.25);border-top:1px solid rgba(255,255,255,0.05)">
  <div style="max-width:760px;margin:0 auto">

  <!-- Section header — centred -->
  <div style="text-align:center;margin-bottom:3rem">
  <div class="mono-tag" style="display:inline-flex;margin-bottom:1.2rem">THE STORY</div>
  <h2 style="font-family:var(--font-display);font-size:clamp(2rem,5vw,3.5rem);letter-spacing:0.04em;color:white;margin-bottom:1rem">
  THE <span style="color:var(--cyan)">PROBLEM</span> &amp; <span style="color:var(--purple)">SOLUTION</span>
  </h2>
  <div class="section-line" style="margin:0 auto"></div>
  </div>

  <!-- Chat — centred and full width of its container -->
  <div class="chat-container" style="margin:0 auto">
  <div class="chat-message msg-arjun" id="chat-1"><div class="sender-name">Arjun</div><div class="msg-bubble"></div></div>
  <div class="chat-message msg-rohan" id="chat-2"><div class="sender-name">Rohan</div><div class="msg-bubble"></div></div>
  <div class="chat-message msg-parkospace" id="chat-3"><div class="sender-name">ParkoSpace</div><div class="msg-bubble"></div></div>
  </div>
  </div>
  </section>

  <!-- HOW IT WORKS -->
  <section style="padding:80px 24px;border-top:1px solid rgba(255,255,255,0.05)">
  <div style="max-width:960px;margin:0 auto">

  <div style="text-align:center;margin-bottom:3.5rem">
  <div class="mono-tag" style="display:inline-flex;margin-bottom:1.2rem">FOR EVERYONE</div>
  <h2 style="font-family:var(--font-display);font-size:clamp(2rem,5vw,3.5rem);letter-spacing:0.04em;color:white;margin-bottom:1rem">
  HOW IT <span style="color:var(--cyan)">WORKS</span>
  </h2>
  <div class="section-line" style="margin:0 auto"></div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px">
  ${[
    { n:'01', icon:'map-pin',    title:'Find Your Area',    desc:'Search any city or neighbourhood. Verified parking spots appear on a live Google Map.',          c:'var(--cyan)'   },
    { n:'02', icon:'phone-call', title:'Contact the Owner', desc:'Call the space owner directly — no middleman, no booking fee. Just a direct phone call.',                   c:'var(--purple)' },
    { n:'03', icon:'car',        title:'Park & Go',         desc:'Navigate with Google Maps, reach the spot, and settle with the owner directly. Done.',                        c:'var(--green)'  },
  ].map(({ n, icon, title, desc, c }) => `
  <div class="glass-card" style="padding:28px;position:relative;overflow:hidden">
  <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,${c},transparent)"></div>
  <div style="font-family:var(--font-display);font-size:3.2rem;color:${c};opacity:0.1;line-height:1;margin-bottom:14px">${n}</div>
  <div style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;background:${c}18;border:1px solid ${c}30">
  <i data-lucide="${icon}" style="width:20px;height:20px;color:${c}"></i>
  </div>
  <h3 style="font-family:var(--font-body);font-weight:700;color:white;font-size:1rem;margin-bottom:10px">${title}</h3>
  <p style="font-size:0.875rem;color:rgba(255,255,255,0.38);line-height:1.8">${desc}</p>
  </div>`).join('')}
  </div>
  </div>
  </section>

  <!-- FOOTER -->
  <footer style="padding:40px 24px;text-align:center;border-top:1px solid rgba(255,255,255,0.05)">
  <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:10px">
  <img src="/static/logo.png" alt="Logo" style="height:22px;width:22px;object-fit:contain;opacity:0.5">
  <span style="font-family:var(--font-display);font-size:1.1rem;color:var(--cyan);letter-spacing:0.06em">PARKOSPACE</span>
  </div>
  <p style="font-family:var(--font-mono);font-size:0.6rem;color:rgba(255,255,255,0.15);letter-spacing:0.08em">PARKING MARKETPLACE · MIT LICENSE · 2026</p>
  </footer>

  </div>`;
  lucide.createIcons();
  setTimeout(startChatAnimation, 800);
}

function goToMap() {
  if (confirm("Allow ParkoSpace to access your location? This helps us show nearby parking spots.")) {
    state.userLoc = MAP_DEFAULT;
    buildMapUI();
    locateUser(null, false);
  } else {
    state.userLoc = MAP_DEFAULT;
    buildMapUI();
  }
}

async function fetchAndRenderListings() {
  const loc = state.userLoc || MAP_DEFAULT;
  const res  = await fetch(`/api/listings?lat=${loc.lat}&lng=${loc.lng}&radius=${state.radius}`);
  state.listings = await res.json();
  updateMapMarkers();
  updateSidebar();
}

// ── MAP UI ──────────────────────────────────────────────────────
function buildMapUI() {
  state.view = 'map';
  document.getElementById('app').innerHTML = `
  <div class="h-screen flex flex-col" style="background:var(--bg)">

  <!-- Map nav -->
  <div class="nav-blur flex items-center justify-between px-4 z-30 flex-shrink-0" style="height:58px">
  <div onclick="renderLanding()" class="hidden md:flex items-center gap-2.5 cursor-pointer">
  <img src="/static/logo.png" class="h-7 w-7 object-contain">
  <span style="font-family:var(--font-display);font-size:1.2rem;color:var(--cyan);letter-spacing:0.04em">PARKO<span style="color:rgba(255,255,255,0.4)">SPACE</span></span>
  </div>

  <!-- Search box — Google Places Autocomplete attaches here -->
  <div class="flex-1 max-w-lg mx-1.5 sm:mx-4 flex gap-2">
  <div class="relative flex-1">
  <span class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style="color:rgba(255,255,255,0.25)">
  <i data-lucide="search" class="w-4 h-4"></i>
  </span>
  <input id="map-search-input" type="text"
  placeholder="Search city or area (e.g. Mumbai, Delhi, London)…"
  onkeypress="searchLocation(event)"
  class="w-full py-2.5 pl-10 pr-4 rounded-full outline-none transition"
  style="background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.08);color:white;font-family:var(--font-body);font-size:0.9rem">
  </div>
  <button id="btn-locate" onclick="locateUser()" title="Use Current GPS"
  class="p-2.5 rounded-full flex items-center justify-center transition border flex-shrink-0 cursor-pointer"
  style="background:rgba(0,0,0,0.5);border-color:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7)">
  <i data-lucide="crosshair" class="w-4 h-4"></i>
  </button>
  </div>

  <div class="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg flex-shrink-0" style="background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.06)">
  <span class="hidden sm:block" style="font-family:var(--font-mono);font-size:0.6rem;color:rgba(255,255,255,0.25);letter-spacing:0.1em">RADIUS</span>
  <input type="range" min="1" max="20" value="${state.radius}" onchange="updateRadius(this.value)"
  class="h-1 w-16 md:w-24 cursor-pointer" style="accent-color:var(--cyan)">
  <span id="radius-label" style="font-family:var(--font-mono);color:var(--cyan);font-size:0.82rem;width:2.8rem;text-align:right">${state.radius}km</span>
  </div>
  </div>

  <div class="flex-1 flex overflow-hidden relative">
  <!-- Sidebar -->
  <div class="hidden md:flex flex-col overflow-y-auto z-20 flex-shrink-0" style="width:336px;background:var(--bg-2);border-right:1px solid rgba(255,255,255,0.05)">
  <div class="flex items-center justify-between p-4 flex-shrink-0" style="border-bottom:1px solid rgba(255,255,255,0.04)">
  <h2 class="font-bold flex items-center gap-2" style="color:white;font-family:var(--font-body);font-size:0.9rem">
  <i data-lucide="map-pin" class="w-4 h-4" style="color:var(--pink)"></i> Nearby Spots
  </h2>
  <span id="spots-count" class="px-2.5 py-0.5 rounded-full" style="background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.35);font-family:var(--font-mono);font-size:0.72rem">…</span>
  </div>
  <div id="sidebar-list" class="p-3 space-y-3 pb-20"></div>
  </div>

  <!-- Google Map (hybrid + cloud style from Map ID) -->
  <div id="map-container" class="flex-1 relative" style="background:#e8e4df"></div>

  <!-- Floating Radius Control for Mobile -->
  <div class="absolute bottom-6 left-4 z-20 sm:hidden flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl backdrop-blur-md" style="background:rgba(8,8,22,0.85);border:1px solid rgba(0,212,255,0.25);box-shadow:0 8px 32px rgba(0,0,0,0.5)">
    <span style="font-family:var(--font-mono);font-size:0.6rem;color:rgba(255,255,255,0.25);letter-spacing:0.1em">RADIUS</span>
    <input type="range" min="1" max="20" value="${state.radius}" onchange="updateRadius(this.value)"
    class="h-1 w-24 cursor-pointer" style="accent-color:var(--cyan)">
    <span id="radius-label-mobile" style="font-family:var(--font-mono);color:var(--cyan);font-size:0.82rem;width:2.8rem;text-align:right">${state.radius}km</span>
  </div>

  <!-- Loading overlay -->
  <div id="map-loading" class="absolute inset-0 flex items-center justify-center z-30 pointer-events-none" style="background:rgba(5,5,14,0.7)">
  <div class="text-center">
  <div class="w-10 h-10 border-2 border-t-transparent rounded-full mx-auto mb-3 spin-slow" style="border-color:var(--cyan);border-top-color:transparent"></div>
  <p style="font-family:var(--font-mono);font-size:0.72rem;color:var(--cyan);letter-spacing:0.1em">LOADING MAP…</p>
  </div>
  </div>
  </div>
  </div>`;

  lucide.createIcons();
  initGoogleMap();
}

async function initGoogleMap() {
  const loaded = await loadGoogleMaps();
  const loadingEl = document.getElementById('map-loading');

  if (!loaded) {
    // Fallback: show a message if no API key
    if (loadingEl) {
      loadingEl.style.pointerEvents = 'auto';
      loadingEl.innerHTML = `
      <div class="text-center p-8">
      <div style="font-size:2.5rem;margin-bottom:1rem">🗺️</div>
      <p style="font-family:var(--font-body);color:white;font-weight:700;margin-bottom:8px">Google Maps Not Configured</p>
      <p style="font-family:var(--font-mono);font-size:0.72rem;color:rgba(255,255,255,0.35)">Add GOOGLE_MAPS_API_KEY to your .env file</p>
      </div>`;
    }
    return;
  }

  if (loadingEl) loadingEl.style.display = 'none';

  const loc = state.userLoc || MAP_DEFAULT;
  const isReal = state.userLoc && !(state.userLoc.lat === MAP_DEFAULT.lat && state.userLoc.lng === MAP_DEFAULT.lng);

  const mapEl = document.getElementById('map-container');
  if (mapEl) mapEl.style.background = '#e8e4df';

  const mapOpts = {
    center: loc,
    zoom: isReal ? 16 : 5,
    mapId: state._gmapsMapId,
    mapTypeId: google.maps.MapTypeId.HYBRID,
    disableDefaultUI: true,
    zoomControl: true,
    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
    fullscreenControl: false,
    streetViewControl: false,
    mapTypeControl: false,
    gestureHandling: 'greedy',
  };
  if (google.maps.ColorScheme) {
    mapOpts.colorScheme = google.maps.ColorScheme.LIGHT;
  }
  // Cloud style: monochrome + light + hybrid (Google Style Editor) — never use `styles` here
  state.map = new google.maps.Map(mapEl, mapOpts);

  // Custom zoom control position
  state.map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(
    document.createElement('div')
  );

  initPlacesAutocomplete();

  if (state.userLoc) placeUserMarker(state.userLoc.lat, state.userLoc.lng);

  fetchAndRenderListings();
}

function updateMapMarkers() {
  if (!state.map || !state._gmapsLoaded) return;
  state._listingMarkers.forEach(m => {
    if (m.setMap) m.setMap(null); else m.map = null;
  });
    state._listingMarkers = [];

    const iw = new google.maps.InfoWindow({
      pixelOffset: new google.maps.Size(0, -8),
    });

    state.listings.forEach(l => {
      const color = l.is_sold ? '#f72585' : '#06ffa5';
      const label = l.is_sold ? 'SOLD' : `₹${l.price_hourly}/h`;

      const pin = document.createElement('div');
      pin.style.cssText = `background:#06060f;border:2px solid ${color};color:white;padding:5px 12px;border-radius:10px;font-weight:800;font-family:monospace;font-size:12px;box-shadow:0 0 18px ${color}44;white-space:nowrap;cursor:pointer;user-select:none;`;
      pin.textContent = label;

      let marker;
      try {
        marker = new google.maps.marker.AdvancedMarkerElement({
          position: { lat: l.lat, lng: l.lng },
          map: state.map,
          title: l.title,
          content: pin,
        });
        bindAdvancedMarkerClick(marker, () => {
          iw.setContent(buildInfoWindowHtml(l));
          iw.open({ map: state.map, anchor: marker });
        });
      } catch (_) {
        // Fallback to basic Marker if AdvancedMarkerElement not available
        marker = new google.maps.Marker({
          position: { lat: l.lat, lng: l.lng },
          map: state.map,
          title: l.title,
          label: { text: label, color: color, fontWeight: '800', fontSize: '11px' },
        });
        marker.addListener('click', () => {
          iw.setContent(buildInfoWindowHtml(l));
          iw.open(state.map, marker);
        });
      }

      state._listingMarkers.push(marker);
    });

    if (state.userLoc) placeUserMarker(state.userLoc.lat, state.userLoc.lng);
}

// ── SIDEBAR ─────────────────────────────────────────────────────
function updateSidebar() {
  const list    = document.getElementById('sidebar-list');
  const countEl = document.getElementById('spots-count');
  if (!list) return;
  if (countEl) countEl.textContent = `${state.listings.length} spots`;

  if (state.listings.length === 0) {
    list.innerHTML = `
    <div class="text-center py-14 px-4" style="border:1px dashed rgba(255,255,255,0.07);border-radius:16px;margin-top:8px">
    <div style="font-size:2.2rem;margin-bottom:0.75rem">🅿️</div>
    <p style="color:rgba(255,255,255,0.25);font-size:0.875rem;font-family:var(--font-body)">No spots in ${state.radius}km</p>
    <p style="font-family:var(--font-mono);font-size:0.65rem;color:rgba(255,255,255,0.15);margin-top:6px">Try increasing the range</p>
    </div>`;
    return;
  }

  list.innerHTML = state.listings.map(l => `
  <div class="map-sidebar-card p-3.5 rounded-xl cursor-pointer"
  style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06)"
  onclick="flyToLoc(${l.lat},${l.lng})">
  <div class="flex justify-between items-start mb-2.5 gap-2">
  <div class="flex-1 min-w-0">
  <h3 class="font-bold truncate" style="color:white;font-size:0.9rem;font-family:var(--font-body)">${l.title}</h3>
  ${l.area_landmark ? `<p class="flex items-center gap-1 mt-0.5 truncate" style="font-size:0.72rem;color:var(--cyan)"><i data-lucide="map-pin" class="inline w-3 h-3 mr-0.5"></i>${l.area_landmark}</p>` : ''}
  </div>
  <span class="badge ${l.is_sold ? 'badge-sold' : 'badge-active'} flex-shrink-0">${l.is_sold ? 'SOLD' : 'OPEN'}</span>
  </div>
  <div class="grid grid-cols-3 gap-1.5 mb-3">
  <div class="text-center p-1.5 rounded-lg" style="background:rgba(0,0,0,0.3)">
  <div style="font-family:var(--font-mono);font-size:0.55rem;color:rgba(255,255,255,0.25);margin-bottom:2px">DIST</div>
  <div class="font-bold" style="font-size:0.8rem;color:white">${l.distance}km</div>
  </div>
  <div class="text-center p-1.5 rounded-lg" style="background:rgba(0,0,0,0.3)">
  <div style="font-family:var(--font-mono);font-size:0.55rem;color:rgba(255,255,255,0.25);margin-bottom:2px">DAILY</div>
  <div class="font-bold" style="font-size:0.8rem;color:var(--green)">₹${l.price_daily}</div>
  </div>
  <div class="text-center p-1.5 rounded-lg" style="background:rgba(0,0,0,0.3)">
  <div style="font-family:var(--font-mono);font-size:0.55rem;color:rgba(255,255,255,0.25);margin-bottom:2px">SIZE</div>
  <div class="font-bold" style="font-size:0.8rem;color:white">${l.length}×${l.breadth}</div>
  </div>
  </div>
  ${!l.is_sold ? `
    <div class="flex gap-2">
    <a href="${l.gmap_link}" target="_blank" onclick="event.stopPropagation()"
    class="flex-1 py-1.5 rounded-lg font-bold text-center text-xs transition"
    style="background:var(--cyan);color:#05050f;font-family:var(--font-body)">Navigate</a>
    <a href="tel:${l.owner_phone}" onclick="event.stopPropagation()"
    class="flex-1 py-1.5 rounded-lg font-bold text-center text-xs transition"
    style="border:1px solid var(--green);color:var(--green);font-family:var(--font-body)">Call</a>
    </div>` :
    `<div class="text-center py-1.5 rounded-lg font-bold text-xs" style="background:rgba(247,37,133,0.08);border:1px solid rgba(247,37,133,0.2);color:var(--pink)">SOLD OUT</div>`}
    </div>`).join('');
    lucide.createIcons();
}

function flyToLoc(lat, lng) {
  if (!state.map) return;
  state.map.panTo({ lat, lng });
  state.map.setZoom(17);
}

async function updateRadius(val) {
  state.radius = val;
  const lbl = document.getElementById('radius-label');
  if (lbl) lbl.textContent = `${val}km`;
  const lblMobile = document.getElementById('radius-label-mobile');
  if (lblMobile) lblMobile.textContent = `${val}km`;
  clearTimeout(state._radiusTm);
  state._radiusTm = setTimeout(() => fetchAndRenderListings(), 400);
}

// ── DASHBOARD ───────────────────────────────────────────────────
async function renderDashboard() {
  state.view = 'dashboard';
  const user = state.currentUser;
  const res  = await fetch(`/api/listings?owner_phone=${user.phone}`);
  const myListings = await res.json();
  state.myListings = myListings;

  document.getElementById('app').innerHTML = `
  <div class="owner-dashboard min-h-screen pb-24" style="background:var(--bg)">
  <div class="page-container max-w-6xl mx-auto px-4 sm:px-6 md:px-8">

  <header class="dash-header flex flex-col md:flex-row justify-between items-start md:items-center py-6 mb-6 gap-4">
  <div class="dash-header-text">
  <div class="mono-tag inline-flex mb-2">
  <i data-lucide="user-check" class="w-3 h-3"></i> VERIFIED PARTNER
  </div>
  <h1 class="dash-title font-black text-white">OWNER DASHBOARD</h1>
  <p class="dash-subtitle">${user.name} · ${user.phone}</p>
  </div>
  <div class="flex gap-2 flex-wrap w-full md:w-auto">
  <button onclick="renderLanding()" class="dash-btn-secondary flex-1 md:flex-none">Home</button>
  <button onclick="logout()" class="dash-btn-logout flex-1 md:flex-none">Log Out</button>
  </div>
  </header>

  <!-- Stats -->
  <div class="grid grid-cols-3 gap-2 sm:gap-4 mb-8">
  <div class="dash-stat" style="--accent-color:var(--cyan)">
  <div class="dash-stat-num" style="color:var(--cyan)">${myListings.length}</div>
  <div class="dash-stat-label">TOTAL</div>
  </div>
  <div class="dash-stat" style="--accent-color:var(--green)">
  <div class="dash-stat-num" style="color:var(--green)">${myListings.filter(l => !l.is_sold).length}</div>
  <div class="dash-stat-label">ACTIVE</div>
  </div>
  <div class="dash-stat" style="--accent-color:var(--pink)">
  <div class="dash-stat-num" style="color:var(--pink)">${myListings.filter(l => l.is_sold).length}</div>
  <div class="dash-stat-label">BOOKED</div>
  </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">

  <!-- FORM -->
  <div class="lg:col-span-5">
  <div class="glass-card form-card p-5 sm:p-6 md:p-7 relative" style="border-top:2px solid rgba(0,212,255,0.45)">
  <div class="form-badge">${state.editMode ? 'EDITING' : 'NEW LISTING'}</div>
  <h2 class="form-heading font-bold text-white flex items-center gap-2">
  <i data-lucide="${state.editMode ? 'pencil' : 'plus-circle'}" class="w-5 h-5" style="color:var(--cyan)"></i>
  ${state.editMode ? 'Edit Property' : 'Add Property'}
  </h2>

  <div class="form-stack">
  <input id="in-title"    type="text" placeholder="Space Title (e.g. Covered Spot near Central Station)" class="ps-input">
  <input id="in-landmark" type="text" placeholder="Area / Landmark (e.g. neighbourhood, mall, landmark)" class="ps-input">
  <textarea id="in-desc"  placeholder="Short description of the space…" rows="3" class="ps-input resize-none"></textarea>

  <!-- Pricing tip -->
  <div class="tip-box flex items-start gap-3 p-4 rounded-xl">
  <div class="tip-box-icon flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5">
  <i data-lucide="info" class="w-4 h-4" style="color:var(--cyan)"></i>
  </div>
  <div>
  <div class="tip-box-title font-semibold mb-1">Pricing tip</div>
  <div class="tip-box-text">Hourly: ₹30–80 · Daily: ₹150–400 · Monthly: ₹1000–3000 depending on area and amenities.</div>
  </div>
  </div>

  <!-- Dimensions -->
  <div class="form-section">
  <div class="form-label">Dimensions</div>
  <div class="grid grid-cols-2 gap-3">
  <div>
  <label class="field-label">Length (m)</label>
  <input id="in-len" type="number" step="0.1" min="0" oninput="calcPreview()" value="5" class="ps-input text-center">
  </div>
  <div>
  <label class="field-label">Breadth (m)</label>
  <input id="in-bre" type="number" step="0.1" min="0" oninput="calcPreview()" value="3" class="ps-input text-center">
  </div>
  </div>
  <div id="area-prev" class="area-preview">Area: 15.00 m²</div>
  </div>

  <!-- Google Maps link -->
  <div class="form-section">
  <div class="form-label">Google Maps Link</div>
  <input id="in-gmap" type="text" inputmode="url" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Paste Google Maps link" class="ps-input gmap-input" style="width:100%;margin-bottom:12px">
  <div class="form-label" style="margin-top:8px">Confirm Link</div>
  <div class="gmap-row">
  <input id="in-gmap-confirm" type="text" inputmode="url" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Paste link again to confirm" class="ps-input gmap-input" onpaste="setTimeout(parseMapUrl,200)" onblur="parseMapUrl()">
  <button onclick="parseMapUrl()" title="Extract coordinates" type="button" class="gmap-btn">
  <i data-lucide="wand-2" class="w-4 h-4"></i>
  </button>
  </div>
  <div id="url-status"></div>
  </div>

  <!-- Sold toggle -->
  <label class="sold-toggle" for="in-sold">
  <input id="in-sold" type="checkbox" class="sold-checkbox">
  <span class="sold-toggle-text">Mark as Sold / Booked</span>
  </label>

  <!-- Pricing -->
  <div class="pricing-box rounded-xl p-4">
  <div class="pricing-box-title">Pricing (₹)</div>
  <div class="space-y-3">
  <div class="price-row">
  <label class="price-label">Hourly ₹</label>
  <input id="in-hourly" type="number" value="50" class="price-input price-input-hourly">
  </div>
  <div class="price-row">
  <label class="price-label">Daily ₹</label>
  <input id="in-daily" type="number" value="300" class="price-input price-input-daily">
  </div>
  <div class="price-row price-row-last">
  <label class="price-label">Monthly ₹</label>
  <input id="in-monthly" type="number" value="0" class="price-input price-input-monthly">
  </div>
  </div>
  <div class="pricing-auto-hint">Auto monthly = area × ₹100/m²</div>
  </div>

  <div class="flex gap-3 pt-1">
  ${state.editMode ? `<button onclick="cancelEdit()" class="flex-1 font-semibold py-3.5 rounded-xl text-sm" style="background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.45);border:1px solid rgba(255,255,255,0.08);font-family:var(--font-body)">Cancel</button>` : ''}
  <button onclick="handleFormSubmit()" class="btn-glow font-black py-3.5 rounded-xl text-sm" style="flex:2;background:var(--cyan);color:#05050f;font-family:var(--font-body)">${state.editMode ? 'UPDATE LISTING' : 'PUBLISH LISTING'}</button>
  </div>
  </div>
  </div>
  </div>

  <!-- LISTINGS -->
  <div class="lg:col-span-7">
  <div class="flex items-center gap-3 mb-5">
  <h2 class="portfolio-heading font-bold text-white flex items-center gap-2">
  <i data-lucide="layout-grid" class="w-5 h-5"></i> Your Portfolio
  </h2>
  <span class="portfolio-count">${myListings.length}</span>
  </div>
  <div class="space-y-3 overflow-y-auto pr-1" style="max-height:680px">
  ${myListings.length === 0
    ? `<div class="glass-card p-12 text-center" style="border-style:dashed;border-color:rgba(255,255,255,0.06)">
    <div style="font-size:3rem;margin-bottom:1rem">🅿️</div>
    <div class="font-bold text-white mb-1" style="font-family:var(--font-body)">No listings yet</div>
    <div style="font-size:0.85rem;color:rgba(255,255,255,0.25)">Add your first space using the form →</div>
    </div>`
    : myListings.map(l => `
    <div class="listing-card glass-card p-4" style="border-color:rgba(255,255,255,0.06)">
    <div class="flex justify-between items-start gap-3">
    <div class="flex-1 min-w-0">
    <div class="flex items-center gap-2 mb-2 flex-wrap">
    <h3 class="font-bold text-white" style="font-family:var(--font-body);font-size:0.95rem">${l.title}</h3>
    <span class="badge ${l.is_sold ? 'badge-sold' : 'badge-active'}">${l.is_sold ? 'BOOKED' : 'ACTIVE'}</span>
    </div>
    ${l.area_landmark ? `<p class="flex items-center gap-1 mb-1.5" style="font-size:0.75rem;color:var(--cyan)"><i data-lucide="map-pin" class="w-3 h-3"></i>${l.area_landmark}</p>` : ''}
    <p class="listing-desc mb-2">${l.desc}</p>
    <div class="listing-prices flex items-center gap-3 flex-wrap">
    <span><span class="price-val-cyan">₹${l.price_hourly}</span><span class="price-unit">/hr</span></span>
    <span><span class="price-val-green">₹${l.price_daily}</span><span class="price-unit">/day</span></span>
    <span><span class="price-val-purple">₹${l.price_monthly}</span><span class="price-unit">/mo</span></span>
    ${l.length && l.breadth ? `<span class="listing-size">${l.length}×${l.breadth}m = ${(l.length * l.breadth).toFixed(1)}m²</span>` : ''}
    </div>
    ${l.address_text ? `<div class="listing-address mt-2">📍 ${l.address_text}</div>` : ''}
    </div>
    <div class="flex flex-col gap-2 flex-shrink-0">
    <button onclick="loadForEditById('${l.id}')" class="p-2.5 rounded-xl transition" style="background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.07)"><i data-lucide="pencil" class="w-4 h-4"></i></button>
    <button onclick='deleteListing("${l.id}")' class="p-2.5 rounded-xl transition" style="background:rgba(247,37,133,0.06);color:var(--pink);border:1px solid rgba(247,37,133,0.14)"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
    </div>
    </div>
    </div>`).join('')}
    </div>
    </div>

    </div>
    </div>
    </div>`;
    lucide.createIcons();
    calcPreview();
}

// ── FORM HELPERS ────────────────────────────────────────────────
function calcPreview() {
  const w    = parseFloat(document.getElementById('in-len')?.value || 0);
  const h    = parseFloat(document.getElementById('in-bre')?.value || 0);
  const area = w * h;
  const el   = document.getElementById('area-prev');
  if (el) el.textContent = `Area: ${area.toFixed(2)} m²`;
  const monthly = document.getElementById('in-monthly');
  if (monthly && area > 0) monthly.value = (area * 100).toFixed(0);
}

function loadForEditById(id) {
  const l = state.myListings?.find(x => x.id === id);
  if (l) loadForEdit(l);
}

function loadForEdit(l) {
  state.editMode = true; state.editId = l.id;
  state.parsedLocation = { lat: l.lat, lng: l.lng, address: l.address_text, expanded_url: l.gmap_link_regen || '' };
  renderDashboard().then(() => {
    document.getElementById('in-title').value    = l.title;
    document.getElementById('in-desc').value     = l.desc;
    document.getElementById('in-landmark').value = l.area_landmark || '';
    document.getElementById('in-len').value      = l.length;
    document.getElementById('in-bre').value      = l.breadth;
    document.getElementById('in-gmap').value         = l.gmap_link;
    document.getElementById('in-gmap-confirm').value = l.gmap_link_regen || l.gmap_link || '';
    document.getElementById('in-hourly').value   = l.price_hourly;
    document.getElementById('in-daily').value    = l.price_daily;
    document.getElementById('in-monthly').value  = l.price_monthly;
    document.getElementById('in-sold').checked   = l.is_sold || false;
    if (l.address_text) {
      document.getElementById('url-status').innerHTML =
      `<div style="margin-top:8px;background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.18);padding:10px;border-radius:12px;font-family:var(--font-mono);font-size:0.72rem;color:var(--cyan)">${l.address_text}</div>`;
    }
    calcPreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function cancelEdit() { state.editMode = false; state.editId = null; state.parsedLocation = null; renderDashboard(); }

async function handleFormSubmit() {
  if (!state.currentUser) { toast('Session expired', 'error'); renderAuthPage(); return; }
  const title = document.getElementById('in-title').value.trim();
  if (!title) { toast('Title is required', 'error'); return; }
  const data = {
    title,
    desc:          document.getElementById('in-desc').value,
    area_landmark: document.getElementById('in-landmark').value,
    length:        parseFloat(document.getElementById('in-len').value) || 0,
    breadth:       parseFloat(document.getElementById('in-bre').value) || 0,
    price_hourly:  parseFloat(document.getElementById('in-hourly').value) || 0,
    price_daily:   parseFloat(document.getElementById('in-daily').value) || 0,
    price_monthly: parseFloat(document.getElementById('in-monthly').value) || 0,
    gmap_link:     document.getElementById('in-gmap').value,
    gmap_link_regen: state.parsedLocation?.expanded_url || document.getElementById('in-gmap-confirm').value || '#',
    is_sold:       document.getElementById('in-sold').checked,
    owner_phone:   state.currentUser.phone,
  };
  if (state.parsedLocation) {
    data.lat = state.parsedLocation.lat;
    data.lng = state.parsedLocation.lng;
    data.address_text = state.parsedLocation.address;
  } else if (!state.editMode && state.userLoc) {
    data.lat = state.userLoc.lat + (Math.random() * 0.001 - 0.0005);
    data.lng = state.userLoc.lng + (Math.random() * 0.001 - 0.0005);
  }
  const url = state.editMode ? '/api/listings/update' : '/api/create';
  if (state.editMode) data.id = state.editId;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (res.ok) { toast(state.editMode ? 'Listing updated!' : 'Listing published!', 'success'); cancelEdit(); }
  else toast('Something went wrong', 'error');
}

async function deleteListing(id) {
  if (!confirm('Remove this listing?')) return;
  const res = await fetch('/api/listings/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, owner_phone: state.currentUser.phone }) });
  if (res.ok) { toast('Listing removed', 'info'); renderDashboard(); }
  else toast('Delete failed', 'error');
}

function logout() {
  if (confirm('Log out?')) {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    state.currentUser = null;
    renderLanding();
    toast('Logged out', 'info');
  }
}

// ── AUTH ────────────────────────────────────────────────────────
function checkOwnerAuth() { state.currentUser ? renderDashboard() : renderAuthPage(); }

function renderAuthPage(initialTab = 'login') {
  state.view = 'auth';
  const isLogin = initialTab === 'login';
  document.getElementById('app').innerHTML = `
  <div class="min-h-screen flex items-center justify-center px-4 py-12 relative" style="background:var(--bg)">
  <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] pointer-events-none" style="background:radial-gradient(ellipse,rgba(0,212,255,0.06),transparent 60%);filter:blur(40px)"></div>

  <div class="auth-page relative z-10">
  <div class="text-center mb-8">
  <div class="relative inline-block mb-5">
  <div class="deco-ring" style="width:64px;height:64px;top:-8px;left:-8px"></div>
  <div class="deco-ring-2" style="width:80px;height:80px;top:-16px;left:-16px"></div>
  <img src="/static/logo.png" class="h-12 w-12 relative z-10 object-contain">
  </div>
  <h1 class="font-black text-white mb-2" style="font-family:var(--font-display);font-size:2.2rem;letter-spacing:0.05em">PARTNER ACCESS</h1>
  <p style="font-family:var(--font-mono);font-size:0.7rem;color:rgba(255,255,255,0.22);letter-spacing:0.12em">LIST YOUR PARKING SPACE</p>
  </div>

  <div class="auth-card p-7 md:p-9">

  <!-- Tab Switcher -->
  <div class="auth-tabs" style="display:flex;gap:4px;background:rgba(0,0,0,0.3);border-radius:12px;padding:4px;margin-bottom:1.5rem">
  <button id="tab-login" onclick="switchAuthTab('login')" class="auth-tab ${isLogin ? 'auth-tab-active' : ''}" style="flex:1;padding:10px;border-radius:10px;font-family:var(--font-body);font-weight:700;font-size:0.85rem;border:none;cursor:pointer;transition:all 0.25s">Login</button>
  <button id="tab-register" onclick="switchAuthTab('register')" class="auth-tab ${!isLogin ? 'auth-tab-active' : ''}" style="flex:1;padding:10px;border-radius:10px;font-family:var(--font-body);font-weight:700;font-size:0.85rem;border:none;cursor:pointer;transition:all 0.25s">Register</button>
  </div>

  <!-- LOGIN FORM -->
  <div id="auth-login" class="${isLogin ? '' : 'hidden'}">
  <div class="auth-form-stack">
  <div class="auth-field">
  <label class="auth-label" for="login-email">Email Address</label>
  <input id="login-email" type="email" placeholder="your@email.com" class="ps-input auth-input" autocomplete="email">
  </div>
  <div class="auth-field">
  <label class="auth-label" for="login-password">Password</label>
  <div style="position:relative">
  <input id="login-password" type="password" placeholder="Your password" class="ps-input auth-input" style="padding-right:48px" autocomplete="current-password">
  <button type="button" onclick="togglePasswordVisibility('login-password', this)" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:rgba(255,255,255,0.35);cursor:pointer;padding:4px">
  <i data-lucide="eye" class="w-4 h-4"></i>
  </button>
  </div>
  </div>
  <button id="btn-login" onclick="authLogin()" class="btn-glow w-full font-bold py-4 rounded-xl mt-1" style="background:var(--cyan);color:#05050f;font-family:var(--font-body);font-size:0.95rem">
  LOGIN
  </button>
  <button type="button" onclick="showForgotPassword()" style="background:none;border:none;color:rgba(0,212,255,0.6);font-family:var(--font-body);font-size:0.82rem;cursor:pointer;padding:8px;margin-top:4px;text-align:center;width:100%">Forgot Password?</button>
  </div>
  </div>

  <!-- REGISTER FORM -->
  <div id="auth-register" class="${!isLogin ? '' : 'hidden'}">

  <!-- Step 1: fields -->
  <div id="reg-step-1" class="auth-form-stack">
  <div class="auth-field">
  <label class="auth-label" for="reg-name">Your Name</label>
  <input id="reg-name" type="text" placeholder="e.g. Priya Sharma" class="ps-input auth-input" autocomplete="name">
  </div>
  <div class="auth-field">
  <label class="auth-label" for="reg-phone">Phone Number</label>
  <input id="reg-phone" type="tel" placeholder="10-digit mobile" class="ps-input auth-input" maxlength="10" autocomplete="tel">
  </div>
  <div class="auth-field">
  <label class="auth-label" for="reg-email">Email Address</label>
  <input id="reg-email" type="email" placeholder="OTP will be sent here" class="ps-input auth-input" autocomplete="email">
  </div>
  <div class="auth-field">
  <label class="auth-label" for="reg-password">Create Password</label>
  <div style="position:relative">
  <input id="reg-password" type="password" placeholder="Minimum 6 characters" class="ps-input auth-input" style="padding-right:48px" autocomplete="new-password">
  <button type="button" onclick="togglePasswordVisibility('reg-password', this)" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:rgba(255,255,255,0.35);cursor:pointer;padding:4px">
  <i data-lucide="eye" class="w-4 h-4"></i>
  </button>
  </div>
  </div>
  <div class="auth-field">
  <label class="auth-label" for="reg-confirm">Confirm Password</label>
  <input id="reg-confirm" type="password" placeholder="Re-enter password" class="ps-input auth-input" autocomplete="new-password">
  </div>
  <button id="btn-register" onclick="authRegisterSendOTP()" class="btn-glow w-full font-bold py-4 rounded-xl mt-1" style="background:var(--cyan);color:#05050f;font-family:var(--font-body);font-size:0.95rem">
  SEND OTP & REGISTER
  </button>
  </div>

  <!-- Step 2: OTP verification -->
  <div id="reg-step-2" class="hidden">
  <div class="text-center mb-6 p-4 rounded-xl" style="background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.15)">
  <p style="font-size:0.85rem;color:rgba(255,255,255,0.45)">OTP sent to</p>
  <p id="reg-disp-email" style="font-family:var(--font-mono);color:var(--cyan);font-weight:700;font-size:0.95rem;margin-top:3px"></p>
  </div>
  <div class="auth-field">
  <label class="auth-label" for="reg-otp">Enter OTP</label>
  <input id="reg-otp" type="text" placeholder="6-digit code" class="ps-input auth-input auth-input-otp text-center font-bold" maxlength="6" inputmode="numeric">
  </div>
  <button id="btn-reg-verify" onclick="authRegisterVerify()" class="btn-glow w-full font-bold py-4 rounded-xl mt-4" style="background:var(--green);color:#05050f;font-family:var(--font-body);font-size:0.95rem">
  VERIFY & CREATE ACCOUNT
  </button>
  </div>

  </div>

  <!-- FORGOT PASSWORD FORM (hidden by default) -->
  <div id="auth-forgot" class="hidden">

  <!-- Step 1: email -->
  <div id="forgot-step-1" class="auth-form-stack">
  <div style="text-align:center;margin-bottom:12px">
  <div style="font-family:var(--font-body);font-weight:700;color:white;font-size:1rem;margin-bottom:4px">Reset Password</div>
  <div style="font-family:var(--font-mono);font-size:0.72rem;color:rgba(255,255,255,0.35)">We'll send an OTP to verify your identity</div>
  </div>
  <div class="auth-field">
  <label class="auth-label" for="forgot-email">Email Address</label>
  <input id="forgot-email" type="email" placeholder="your@email.com" class="ps-input auth-input" autocomplete="email">
  </div>
  <button id="btn-forgot-send" onclick="authForgotSendOTP()" class="btn-glow w-full font-bold py-4 rounded-xl mt-1" style="background:var(--purple);color:white;font-family:var(--font-body);font-size:0.95rem">
  SEND RESET OTP
  </button>
  <button type="button" onclick="switchAuthTab('login')" style="background:none;border:none;color:rgba(255,255,255,0.3);font-family:var(--font-body);font-size:0.82rem;cursor:pointer;padding:8px;margin-top:4px;text-align:center;width:100%">← Back to Login</button>
  </div>

  <!-- Step 2: OTP + new password -->
  <div id="forgot-step-2" class="hidden">
  <div class="text-center mb-6 p-4 rounded-xl" style="background:rgba(155,93,229,0.08);border:1px solid rgba(155,93,229,0.2)">
  <p style="font-size:0.85rem;color:rgba(255,255,255,0.45)">OTP sent to</p>
  <p id="forgot-disp-email" style="font-family:var(--font-mono);color:var(--purple);font-weight:700;font-size:0.95rem;margin-top:3px"></p>
  </div>
  <div class="auth-form-stack">
  <div class="auth-field">
  <label class="auth-label" for="forgot-otp">Enter OTP</label>
  <input id="forgot-otp" type="text" placeholder="6-digit code" class="ps-input auth-input auth-input-otp text-center font-bold" maxlength="6" inputmode="numeric">
  </div>
  <div class="auth-field">
  <label class="auth-label" for="forgot-newpw">New Password</label>
  <div style="position:relative">
  <input id="forgot-newpw" type="password" placeholder="Minimum 6 characters" class="ps-input auth-input" style="padding-right:48px" autocomplete="new-password">
  <button type="button" onclick="togglePasswordVisibility('forgot-newpw', this)" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:rgba(255,255,255,0.35);cursor:pointer;padding:4px">
  <i data-lucide="eye" class="w-4 h-4"></i>
  </button>
  </div>
  </div>
  <div class="auth-field">
  <label class="auth-label" for="forgot-confirm">Confirm New Password</label>
  <input id="forgot-confirm" type="password" placeholder="Re-enter new password" class="ps-input auth-input" autocomplete="new-password">
  </div>
  <button id="btn-forgot-reset" onclick="authForgotVerify()" class="btn-glow w-full font-bold py-4 rounded-xl mt-1" style="background:var(--green);color:#05050f;font-family:var(--font-body);font-size:0.95rem">
  RESET PASSWORD & LOGIN
  </button>
  </div>
  </div>

  </div>

  <button onclick="renderLanding()" class="w-full mt-5 py-2 text-sm transition" style="color:rgba(255,255,255,0.22);font-family:var(--font-body)">← Back to Home</button>
  </div>
  </div>
  </div>`;
  lucide.createIcons();
}

function switchAuthTab(tab) {
  const loginPane    = document.getElementById('auth-login');
  const registerPane = document.getElementById('auth-register');
  const forgotPane   = document.getElementById('auth-forgot');
  const tabLogin     = document.getElementById('tab-login');
  const tabRegister  = document.getElementById('tab-register');

  // Hide forgot password pane whenever switching tabs
  if (forgotPane) forgotPane.classList.add('hidden');

  if (tab === 'login') {
    loginPane.classList.remove('hidden');
    registerPane.classList.add('hidden');
    tabLogin.classList.add('auth-tab-active');
    tabRegister.classList.remove('auth-tab-active');
  } else {
    loginPane.classList.add('hidden');
    registerPane.classList.remove('hidden');
    tabLogin.classList.remove('auth-tab-active');
    tabRegister.classList.add('auth-tab-active');
  }
}

function showForgotPassword() {
  document.getElementById('auth-login').classList.add('hidden');
  document.getElementById('auth-register').classList.add('hidden');
  document.getElementById('auth-forgot').classList.remove('hidden');
  document.getElementById('tab-login').classList.remove('auth-tab-active');
  document.getElementById('tab-register').classList.remove('auth-tab-active');
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.innerHTML = isHidden
    ? '<i data-lucide="eye-off" class="w-4 h-4"></i>'
    : '<i data-lucide="eye" class="w-4 h-4"></i>';
  lucide.createIcons();
}

// ── LOGIN ──
async function authLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { toast('Enter email and password', 'error'); return; }

  const btn = document.getElementById('btn-login');
  btn.textContent = 'LOGGING IN…'; btn.disabled = true;
  try {
    const res  = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (data.success) {
      state.currentUser = data.user;
      toast(`Welcome back, ${data.user.name}!`, 'success');
      renderDashboard();
    } else {
      toast(data.error || 'Login failed', 'error');
    }
  } catch (e) { toast('Connection failed', 'error'); }
  finally { btn.textContent = 'LOGIN'; btn.disabled = false; }
}

// ── REGISTER STEP 1: Send OTP ──
async function authRegisterSendOTP() {
  const name     = document.getElementById('reg-name').value.trim();
  const phone    = document.getElementById('reg-phone').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm  = document.getElementById('reg-confirm').value;

  if (!name)                    { toast('Enter your name', 'error'); return; }
  if (phone.length < 10)       { toast('Enter a valid 10-digit phone', 'error'); return; }
  if (!email.includes('@'))    { toast('Enter a valid email', 'error'); return; }
  if (password.length < 6)     { toast('Password must be at least 6 characters', 'error'); return; }
  if (password !== confirm)    { toast('Passwords do not match', 'error'); return; }

  const btn = document.getElementById('btn-register');
  btn.textContent = 'CHECKING…'; btn.disabled = true;
  try {
    const res  = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone, email, password }) });
    const data = await res.json();
    if (data.success) {
      document.getElementById('reg-step-1').classList.add('hidden');
      document.getElementById('reg-step-2').classList.remove('hidden');
      document.getElementById('reg-disp-email').textContent = email;
      toast('OTP sent to your email!', 'success');
    } else {
      toast(data.error || 'Registration failed', 'error');
    }
  } catch (e) { toast('Connection failed', 'error'); }
  finally { btn.textContent = 'SEND OTP & REGISTER'; btn.disabled = false; }
}

// ── REGISTER STEP 2: Verify OTP & create account ──
async function authRegisterVerify() {
  const name     = document.getElementById('reg-name').value.trim();
  const phone    = document.getElementById('reg-phone').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const code     = document.getElementById('reg-otp').value.trim();

  if (!code) { toast('Enter the OTP', 'error'); return; }

  const btn = document.getElementById('btn-reg-verify');
  btn.textContent = 'VERIFYING…'; btn.disabled = true;
  try {
    const res  = await fetch('/api/auth/register/verify', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone, email, password, code }) });
    const data = await res.json();
    if (data.success) {
      state.currentUser = data.user;
      toast(`Welcome, ${data.user.name}! Account created.`, 'success');
      renderDashboard();
    } else {
      toast(data.error || 'Verification failed', 'error');
    }
  } catch (e) { toast('Connection failed', 'error'); }
  finally { btn.textContent = 'VERIFY & CREATE ACCOUNT'; btn.disabled = false; }
}

// ── FORGOT PASSWORD STEP 1: Send OTP ──
async function authForgotSendOTP() {
  const email = document.getElementById('forgot-email').value.trim();
  if (!email.includes('@')) { toast('Enter a valid email', 'error'); return; }

  const btn = document.getElementById('btn-forgot-send');
  btn.textContent = 'SENDING…'; btn.disabled = true;
  try {
    const res  = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const data = await res.json();
    if (data.success) {
      document.getElementById('forgot-step-1').classList.add('hidden');
      document.getElementById('forgot-step-2').classList.remove('hidden');
      document.getElementById('forgot-disp-email').textContent = email;
      toast('Reset OTP sent!', 'success');
    } else {
      toast(data.error || 'Failed', 'error');
    }
  } catch (e) { toast('Connection failed', 'error'); }
  finally { btn.textContent = 'SEND RESET OTP'; btn.disabled = false; }
}

// ── FORGOT PASSWORD STEP 2: Verify OTP & set new password ──
async function authForgotVerify() {
  const email       = document.getElementById('forgot-email').value.trim();
  const code        = document.getElementById('forgot-otp').value.trim();
  const newPassword = document.getElementById('forgot-newpw').value;
  const confirm     = document.getElementById('forgot-confirm').value;

  if (!code)                       { toast('Enter the OTP', 'error'); return; }
  if (newPassword.length < 6)      { toast('Password must be at least 6 characters', 'error'); return; }
  if (newPassword !== confirm)     { toast('Passwords do not match', 'error'); return; }

  const btn = document.getElementById('btn-forgot-reset');
  btn.textContent = 'RESETTING…'; btn.disabled = true;
  try {
    const res  = await fetch('/api/auth/reset-password', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code, new_password: newPassword }) });
    const data = await res.json();
    if (data.success) {
      state.currentUser = data.user;
      toast('Password reset! You are now logged in.', 'success');
      renderDashboard();
    } else {
      toast(data.error || 'Reset failed', 'error');
    }
  } catch (e) { toast('Connection failed', 'error'); }
  finally { btn.textContent = 'RESET PASSWORD & LOGIN'; btn.disabled = false; }
}

function setView(v) { if (v === 'map') goToMap(); else if (v === 'dashboard') renderDashboard(); else renderLanding(); }

// ── START ───────────────────────────────────────────────────────
(async function init() {
  try {
    const res  = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await res.json();
    if (data.success && data.user) state.currentUser = data.user;
  } catch (e) { /* offline */ }
  renderLanding();
})();
