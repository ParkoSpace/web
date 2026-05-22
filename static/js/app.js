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
};

// Default map center: Bengaluru
const BENGALURU_DEFAULT = { lat: 12.9716, lng: 77.5946 };
const BENGALURU_BOUNDS = { south: 12.834, west: 77.460, north: 13.143, east: 77.780 };

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
  } catch (e) {
    console.error('[Maps] Could not fetch config:', e);
    return false;
  }

  return new Promise((resolve) => {
    window._gmapsCallback = () => { state._gmapsLoaded = true; resolve(true); };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${state._gmapsKey}&libraries=places&callback=_gmapsCallback&language=en&region=IN`;
    script.async = true;
    script.defer = true;
    script.onerror = () => { console.error('[Maps] Failed to load Google Maps SDK'); resolve(false); };
    document.head.appendChild(script);
  });
}

// ── GPS ─────────────────────────────────────────────────────────
function locateUser(onSuccess) {
  const btn = document.getElementById('btn-locate');
  if (btn) { btn.innerHTML = '<i data-lucide="loader" class="animate-spin w-4 h-4"></i>'; lucide.createIcons(); }

  if (!navigator.geolocation) { toast('Geolocation not supported', 'error'); return; }

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
      toast(msgs[err.code] || 'Could not get location', 'error');
      if (btn) { btn.innerHTML = '<i data-lucide="crosshair" class="w-4 h-4"></i>'; lucide.createIcons(); }
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
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

    marker.addEventListener('click', () => {
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
    bounds: new google.maps.LatLngBounds(
      { lat: BENGALURU_BOUNDS.south, lng: BENGALURU_BOUNDS.west },
      { lat: BENGALURU_BOUNDS.north, lng: BENGALURU_BOUNDS.east }
    ),
    strictBounds: false,
    componentRestrictions: { country: 'in' },
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

function parseCoordsFromUrl(raw) {
  const url = normalizeMapUrl(raw);
  if (!url) return null;
  const direct = url.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
  if (direct) return { lat: parseFloat(direct[1]), lng: parseFloat(direct[2]), address: 'Pinned Location' };
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+).*?!4d(-?\d+\.\d+)/,
    /center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/i,
    /ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) {
      const place = url.match(/\/place[s]?\/([^/@?&]+)/i);
      let address = null;
      if (place) {
        try { address = decodeURIComponent(place[1].replace(/\+/g, ' ')).trim(); } catch (_) {}
      }
      return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), address: address || 'Location Detected' };
    }
  }
  return null;
}

function showMapUrlSuccess(statusDiv, data) {
  state.parsedLocation = { lat: data.lat, lng: data.lng, address: data.address };
  statusDiv.innerHTML = `
  <div style="margin-top:8px;background:rgba(6,255,165,0.06);border:1px solid rgba(6,255,165,0.2);padding:12px;border-radius:12px;font-size:0.78rem">
  <div style="color:var(--green);font-weight:700;display:flex;align-items:center;gap:4px;margin-bottom:4px"><i data-lucide="check-circle" class="w-3 h-3"></i> Location Verified</div>
  <div style="color:#e2e8f0;font-weight:600">${data.address}</div>
  <div style="font-family:var(--font-mono);color:rgba(255,255,255,0.3);margin-top:4px;font-size:0.65rem">${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}</div>
  </div>`;
  lucide.createIcons();
  toast('Location extracted!', 'success');
}

function mapUrlErrorHtml(message) {
  return `<span style="color:var(--pink);font-size:0.75rem;font-weight:700;display:block;margin-bottom:8px">✕ ${message}</span>
  <button type="button" onclick="useGpsForListing()" class="gps-fallback-btn">
  <i data-lucide="crosshair" class="w-4 h-4"></i> Use GPS instead
  </button>`;
}

function useGpsForListing() {
  const urlEl     = document.getElementById('in-gmap');
  const statusDiv = document.getElementById('url-status');
  if (!navigator.geolocation) {
    statusDiv.innerHTML = mapUrlErrorHtml('GPS not supported on this device');
    lucide.createIcons();
    return;
  }
  statusDiv.innerHTML = `<span style="color:var(--cyan);font-size:0.75rem;display:flex;align-items:center;gap:4px"><i data-lucide="loader" class="animate-spin w-3 h-3"></i> Getting GPS location…</span>`;
  lucide.createIcons();
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      urlEl.value = `https://www.google.com/maps?q=${lat},${lng}`;
      let address = 'Current GPS Location';
      try {
        const res  = await fetch('/api/utils/reverse-geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng }),
        });
        const data = await res.json();
        if (data.success && data.address) address = data.address;
      } catch (_) {}
      showMapUrlSuccess(statusDiv, { lat, lng, address });
    },
    () => {
      statusDiv.innerHTML = mapUrlErrorHtml('Could not get GPS — allow location permission in browser settings');
      lucide.createIcons();
      toast('Allow location permission and try GPS again', 'error');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

async function parseMapUrl() {
  const urlEl     = document.getElementById('in-gmap');
  const statusDiv = document.getElementById('url-status');
  const url       = normalizeMapUrl(urlEl.value);
  const landmark  = document.getElementById('in-landmark')?.value?.trim() || '';
  if (!url && !landmark) { toast('Paste a Maps link or fill Area/Landmark, or use GPS', 'error'); return; }
  if (url) urlEl.value = url;

  const local = url ? parseCoordsFromUrl(url) : null;
  if (local) {
    showMapUrlSuccess(statusDiv, local);
    return;
  }

  statusDiv.innerHTML = `<span style="color:var(--cyan);font-size:0.75rem;display:flex;align-items:center;gap:4px"><i data-lucide="loader" class="animate-spin w-3 h-3"></i> Reading map link…</span>`;
  lucide.createIcons();

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const res  = await fetch('/api/utils/parse-map-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, landmark }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    if (data.success) {
      showMapUrlSuccess(statusDiv, data);
    } else {
      statusDiv.innerHTML = mapUrlErrorHtml(data.error || 'Could not detect location');
      lucide.createIcons();
      toast(data.error || 'Could not detect location', 'error');
    }
  } catch (e) {
    statusDiv.innerHTML = mapUrlErrorHtml(e.name === 'AbortError' ? 'Request timed out' : 'Connection error');
    lucide.createIcons();
    if (e.name === 'AbortError') toast('Request timed out — try GPS', 'error');
    else toast('Connection error — try GPS', 'error');
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
  <span style="display:block;font-family:var(--font-mono);font-size:0.5rem;color:rgba(255,255,255,0.2);letter-spacing:0.2em;margin-top:2px">BENGALURU · PARK SMARTER</span>
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
    { n:'01', icon:'map-pin',    title:'Find Your Area',    desc:'Search any Bengaluru neighbourhood or tap GPS. Verified parking spots appear on a live Google Map.',          c:'var(--cyan)'   },
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
  <span style="font-family:var(--font-display);font-size:1.1rem;color:var(--cyan);letter-spacing:0.06em">PARKOSPACE<span style="color:rgba(255,255,255,0.28)"> BENGALURU</span></span>
  </div>
  <p style="font-family:var(--font-mono);font-size:0.6rem;color:rgba(255,255,255,0.15);letter-spacing:0.08em">BENGALURU PARKING MARKETPLACE · MIT LICENSE · 2026</p>
  </footer>

  </div>`;
  lucide.createIcons();
  setTimeout(startChatAnimation, 800);
}

// ── MAP NAVIGATION ──────────────────────────────────────────────
function goToMap() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => { state.userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude }; buildMapUI(); },
                                             ()    => { state.userLoc = BENGALURU_DEFAULT; buildMapUI(); toast('Showing Bengaluru — enable GPS or search your area', 'info'); },
                                             { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  } else {
    state.userLoc = BENGALURU_DEFAULT;
    buildMapUI();
    toast('Showing Bengaluru — enable GPS or search your area', 'info');
  }
}

async function fetchAndRenderListings() {
  const loc = state.userLoc || BENGALURU_DEFAULT;
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
  placeholder="Search Bengaluru area (e.g. Koramangala, Indiranagar)…"
  onkeypress="searchLocation(event)"
  class="w-full py-2.5 pl-10 pr-4 rounded-full outline-none transition"
  style="background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.08);color:white;font-family:var(--font-body);font-size:0.9rem">
  </div>
  <button id="btn-locate" onclick="locateUser()" title="Use GPS"
  class="p-2.5 rounded-full flex-shrink-0 transition"
  style="background:rgba(0,212,255,0.1);color:var(--cyan);border:1px solid rgba(0,212,255,0.2)">
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

  <!-- Google Map -->
  <div id="map-container" class="flex-1 relative" style="background:#05050e"></div>

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

  const loc = state.userLoc || BENGALURU_DEFAULT;
  const isReal = state.userLoc && !(state.userLoc.lat === BENGALURU_DEFAULT.lat && state.userLoc.lng === BENGALURU_DEFAULT.lng);

  state.map = new google.maps.Map(document.getElementById('map-container'), {
    center: loc,
    zoom: isReal ? 16 : 13,
    styles: DARK_MAP_STYLE,
    disableDefaultUI: true,
    zoomControl: true,
    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
    fullscreenControl: false,
    streetViewControl: false,
    mapTypeControl: false,
    gestureHandling: 'greedy',
    mapId: 'parkospace_dark',
  });

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
        marker.addEventListener('click', () => {
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
  <input id="in-title"    type="text" placeholder="Space Title (e.g. Covered Spot near Koramangala Metro)" class="ps-input">
  <input id="in-landmark" type="text" placeholder="Area / Landmark (e.g. BTM Layout, near Forum Mall)" class="ps-input">
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
  <div class="form-label">Location</div>
  <div class="gmap-row">
  <input id="in-gmap" type="text" inputmode="url" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Paste Google Maps link for exact location" class="ps-input gmap-input" onpaste="setTimeout(parseMapUrl,200)">
  <button onclick="parseMapUrl()" title="Extract coordinates" type="button" class="gmap-btn">
  <i data-lucide="wand-2" class="w-4 h-4"></i>
  </button>
  </div>
  <div class="location-actions">
  <button type="button" onclick="useGpsForListing()" class="loc-action-btn">
  <i data-lucide="crosshair" class="w-3.5 h-3.5"></i> Use GPS
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
    <button onclick='loadForEdit(${JSON.stringify(l).replace(/'/g, "&apos;")})' class="p-2.5 rounded-xl transition" style="background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.07)"><i data-lucide="pencil" class="w-4 h-4"></i></button>
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

function loadForEdit(l) {
  state.editMode = true; state.editId = l.id;
  state.parsedLocation = { lat: l.lat, lng: l.lng, address: l.address_text };
  renderDashboard().then(() => {
    document.getElementById('in-title').value    = l.title;
    document.getElementById('in-desc').value     = l.desc;
    document.getElementById('in-landmark').value = l.area_landmark || '';
    document.getElementById('in-len').value      = l.length;
    document.getElementById('in-bre').value      = l.breadth;
    document.getElementById('in-gmap').value     = l.gmap_link;
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
  if (!state.currentUser) { toast('Session expired', 'error'); renderOwnerSignup(); return; }
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
function checkOwnerAuth() { state.currentUser ? renderDashboard() : renderOwnerSignup(); }

function renderOwnerSignup() {
  state.view = 'auth';
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
  <div id="step-1" class="auth-form-stack">
  <div class="auth-field">
  <label class="auth-label" for="signup-name">Your Name</label>
  <input id="signup-name" type="text" placeholder="e.g. Priya Sharma" class="ps-input auth-input" autocomplete="name">
  </div>
  <div class="auth-field">
  <label class="auth-label" for="signup-phone">Phone Number</label>
  <input id="signup-phone" type="tel" placeholder="10-digit mobile" class="ps-input auth-input" maxlength="10" autocomplete="tel">
  </div>
  <div class="auth-field">
  <label class="auth-label" for="signup-email">Email Address</label>
  <input id="signup-email" type="email" placeholder="OTP will be sent here" class="ps-input auth-input" autocomplete="email">
  </div>
  <button id="btn-otp" onclick="sendOTP()" class="btn-glow w-full font-bold py-4 rounded-xl mt-1" style="background:var(--cyan);color:#05050f;font-family:var(--font-body);font-size:0.95rem">
  SEND OTP TO EMAIL
  </button>
  </div>

  <div id="step-2" class="hidden">
  <div class="text-center mb-6 p-4 rounded-xl" style="background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.15)">
  <p style="font-size:0.85rem;color:rgba(255,255,255,0.45)">OTP sent to</p>
  <p id="disp-email" style="font-family:var(--font-mono);color:var(--cyan);font-weight:700;font-size:0.95rem;margin-top:3px"></p>
  </div>
  <div class="auth-field">
  <label class="auth-label" for="signup-otp">Enter OTP</label>
  <input id="signup-otp" type="text" placeholder="6-digit code" class="ps-input auth-input auth-input-otp text-center font-bold" maxlength="6" inputmode="numeric">
  </div>
  <button id="btn-verify" onclick="verifyOTP()" class="btn-glow w-full font-bold py-4 rounded-xl mt-4" style="background:var(--green);color:#05050f;font-family:var(--font-body);font-size:0.95rem">
  VERIFY &amp; ENTER
  </button>
  </div>

  <button onclick="renderLanding()" class="w-full mt-5 py-2 text-sm transition" style="color:rgba(255,255,255,0.22);font-family:var(--font-body)">← Back to Home</button>
  </div>
  </div>
  </div>`;
  lucide.createIcons();
}

async function sendOTP() {
  const name  = document.getElementById('signup-name').value.trim();
  const phone = document.getElementById('signup-phone').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  if (!name || phone.length < 10 || !email.includes('@')) { toast('Fill in all fields correctly', 'error'); return; }
  const btn = document.getElementById('btn-otp'); btn.textContent = 'SENDING…'; btn.disabled = true;
  try {
    const res  = await fetch('/api/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, phone }) });
    const data = await res.json();
    if (data.success) {
      document.getElementById('step-1').classList.add('hidden');
      document.getElementById('step-2').classList.remove('hidden');
      document.getElementById('disp-email').textContent = email;
      toast('OTP sent!', 'success');
    } else toast(data.error || 'Failed to send OTP', 'error');
  } catch (e) { toast('Connection failed', 'error'); }
  finally { btn.textContent = 'SEND OTP TO EMAIL'; btn.disabled = false; }
}

async function verifyOTP() {
  const name  = document.getElementById('signup-name').value.trim();
  const phone = document.getElementById('signup-phone').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const otp   = document.getElementById('signup-otp').value.trim();
  const btn   = document.getElementById('btn-verify'); btn.textContent = 'VERIFYING…'; btn.disabled = true;
  try {
    const res  = await fetch('/api/auth/verify-owner', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, email, code: otp, name }) });
    const data = await res.json();
    if (data.success) { state.currentUser = data.user; toast(`Welcome, ${data.user.name}!`, 'success'); renderDashboard(); }
    else toast('Invalid OTP', 'error');
  } catch (e) { toast('Verification failed', 'error'); }
  finally { btn.textContent = 'VERIFY & ENTER'; btn.disabled = false; }
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
