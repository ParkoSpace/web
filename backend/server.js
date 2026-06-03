const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const uuid = require('uuid');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 8080;

// Load Env
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Setup middleware
app.use(cors({
  origin: true, // Allow all origins for dev or specify if needed
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from compiled React frontend
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Setup Session (30 days persistence matching Flask)
app.use(session({
  secret: process.env.SECRET_KEY || 'parkospace-dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  name: 'parkospace.sid',
  cookie: {
    secure: false, // Set true if using HTTPS
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// Initialize database tables & migrations
db.initDb().then(async () => {
  console.log(" [INFO] Database initialization complete.");
  try {
    const listings = await db.dbGetListings();
    if (!listings || listings.length === 0) {
      console.log(" [INFO] No listings found. Seeding public parking spots automatically...");
      const seeder = require('./seed_public_parkings');
      await seeder.seed();
    }
  } catch (seedErr) {
    console.warn(" [WARN] Auto-seeding check failed:", seedErr.message);
  }
}).catch((err) => {
  console.error(" [ERROR] Database initialization failed:", err);
});

// Default map center when GPS unavailable (geographical center of India)
const DEFAULT_LAT = 20.5937;
const DEFAULT_LNG = 78.9629;

// --- GEOLOCATION & GEOCODING HELPERS ---

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function googleMapsApiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY || '';
  if (!key || key === 'YOUR_GOOGLE_MAPS_API_KEY') {
    return null;
  }
  return key;
}

async function googleGeocodeForward(query) {
  const key = googleMapsApiKey();
  if (!key || !query) return { lat: null, lng: null, address: null };
  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address: query.trim(),
        key: key
      },
      timeout: 8000
    });
    const data = response.data;
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const r = data.results[0];
      const loc = r.geometry.location;
      return { lat: loc.lat, lng: loc.lng, address: r.formatted_address };
    }
  } catch (e) {
    console.warn(' [WARN] Google geocode forward failed:', e.message);
  }
  return { lat: null, lng: null, address: null };
}

async function googleGeocodeReverse(lat, lng) {
  const key = googleMapsApiKey();
  if (!key) return null;
  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        latlng: `${lat},${lng}`,
        key: key
      },
      timeout: 8000
    });
    const data = response.data;
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      return data.results[0].formatted_address;
    }
  } catch (e) {
    console.warn(' [WARN] Google geocode reverse failed:', e.message);
  }
  return null;
}

async function geocodeText(query) {
  // Google Geocoding API first
  const googleRes = await googleGeocodeForward(query);
  if (googleRes.lat && googleRes.lng) {
    return [googleRes.lat, googleRes.lng, googleRes.address];
  }
  // Nominatim Fallback
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: query.trim(),
        format: 'json',
        limit: 1,
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'parkospace_search_v1_node'
      },
      timeout: 6000
    });
    if (response.data && response.data.length > 0) {
      const loc = response.data[0];
      return [parseFloat(loc.lat), parseFloat(loc.lon), loc.display_name];
    }
  } catch (e) {
    console.warn(' [WARN] Nominatim geocode forward failed:', e.message);
  }
  return [null, null, null];
}

async function reverseGeocodeCoords(lat, lng) {
  // Google Geocoding API first
  const address = await googleGeocodeReverse(lat, lng);
  if (address) return address;

  // Nominatim Fallback
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        lat: lat,
        lon: lng,
        format: 'json',
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'parkospace_pro_v1_node'
      },
      timeout: 5000
    });
    if (response.data && response.data.display_name) {
      return response.data.display_name;
    }
  } catch (e) {
    console.warn(' [WARN] Nominatim geocode reverse failed:', e.message);
  }
  return null;
}

async function googlePlaceDetails(placeId) {
  const key = googleMapsApiKey();
  if (!key || !placeId) return { lat: null, lng: null, address: null };
  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: placeId,
        fields: 'geometry,formatted_address,name',
        key: key
      },
      timeout: 8000
    });
    const data = response.data;
    if (data.status === 'OK' && data.result && data.result.geometry) {
      const loc = data.result.geometry.location;
      const addr = data.result.formatted_address || data.result.name;
      return { lat: loc.lat, lng: loc.lng, address: addr };
    }
  } catch (e) {
    console.warn(' [WARN] Google place details failed:', e.message);
  }
  return { lat: null, lng: null, address: null };
}

function extractPlaceId(text) {
  if (!text) return null;
  const patterns = [
    /!1s(ChI[\w-]+)/,
    /place_id[=:](ChI[\w-]+)/,
    /"place_id"\s*:\s*"(ChI[\w-]+)"/
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1];
  }
  return null;
}

function normalizeMapInput(url) {
  let val = (url || '').trim();
  val = val.replace(/[\u200b-\u200d\ufeff]/g, '');
  if (val && !/^https?:\/\//i.test(val)) {
    val = 'https://' + val;
  }
  return val;
}

function coordsFromText(text) {
  if (!text) return { lat: null, lng: null };
  let decoded;
  try {
    decoded = decodeURIComponent(text);
  } catch (e) {
    // HTML or other text with invalid % sequences — just use raw text
    decoded = text;
  }

  // Raw coordinate match: "12.9927458, 77.6675577"
  const rawM = decoded.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
  if (rawM) {
    return { lat: parseFloat(rawM[1]), lng: parseFloat(rawM[2]) };
  }

  const latM = decoded.match(/!3d(-?\d+\.\d+)/);
  const lngM = decoded.match(/!4d(-?\d+\.\d+)/);
  if (latM && lngM) {
    return { lat: parseFloat(latM[1]), lng: parseFloat(lngM[1]) };
  }

  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/i,
    /center=(-?\d+\.\d+),(-?\d+\.\d+)/i,
    /ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /latlng=(-?\d+\.\d+)%2C(-?\d+\.\d+)/i,
    /latlng=(-?\d+\.\d+),(-?\d+\.\d+)/i,
    // Google's pb= param with lat/lng: !2d<lng>!3d<lat>
    /!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/,
    // data= param coords
    /data=.*!8m2!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/
  ];

  for (const pat of patterns) {
    const m = decoded.match(pat);
    if (m) {
      // The !2d!3d pattern is lng,lat (reversed)
      if (pat.source.startsWith('!2d')) {
        return { lat: parseFloat(m[2]), lng: parseFloat(m[1]) };
      }
      return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    }
  }

  return { lat: null, lng: null };
}

function placeNameFromText(text) {
  if (!text) return null;
  const patterns = [
    /\/place[s]?\/([^/@?&]+)/i,
    /\/maps\/search\/([^/@?&]+)/i
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      try {
        const name = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
        if (name && !name.match(/^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/)) {
          return name;
        }
      } catch (e) {}
    }
  }
  return null;
}

async function fetchMapsFinalUrl(url) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  // Strategy 1: Full GET with automatic redirect following (most reliable for short links)
  try {
    const resp = await axios.get(url, {
      headers,
      maxRedirects: 10,
      timeout: 12000,
      validateStatus: (status) => status >= 200 && status < 500
    });

    if (resp.status === 404) {
      return { finalUrl: "404_NOT_FOUND", html: '' };
    }

    // Check the final URL after all redirects
    const finalUrl = resp.request?.res?.responseUrl || resp.config?.url || url;
    const html = typeof resp.data === 'string' ? resp.data : '';
    
    // Check for coords in final URL
    const coords1 = coordsFromText(finalUrl);
    if (coords1.lat && coords1.lng) {
      return { finalUrl, html };
    }

    return { finalUrl, html };
  } catch (e1) {
    console.warn(' [WARN] fetchMapsFinalUrl strategy-1 failed:', e1.message);
  }

  // Strategy 2: Manual redirect tracer with HEAD then GET (fallback)
  let currUrl = url;
  for (let hop = 0; hop < 8; hop++) {
    const { lat, lng } = coordsFromText(currUrl);
    if (lat && lng) {
      return { finalUrl: currUrl, html: '' };
    }
    try {
      const resp = await axios.head(currUrl, {
        headers,
        maxRedirects: 0,
        timeout: 8000,
        validateStatus: (status) => status >= 200 && status < 400
      });
      
      if (resp.status === 404) {
        return { finalUrl: "404_NOT_FOUND", html: '' };
      }
      
      const loc = resp.headers.location;
      if (!loc) {
        const getResp = await axios.get(currUrl, {
          headers,
          maxRedirects: 0,
          timeout: 8000,
          validateStatus: (status) => status >= 200 && status < 400
        });
        if (getResp.status === 404) {
          return { finalUrl: "404_NOT_FOUND", html: '' };
        }
        const locGet = getResp.headers.location;
        if (!locGet) {
          return { finalUrl: currUrl, html: getResp.data || '' };
        }
        currUrl = locGet.startsWith('/') ? new URL(locGet, currUrl).href : locGet;
      } else {
        currUrl = loc.startsWith('/') ? new URL(loc, currUrl).href : loc;
      }
    } catch (e) {
      if (e.response && e.response.status === 404) {
        return { finalUrl: "404_NOT_FOUND", html: '' };
      }
      break;
    }
  }
  return { finalUrl: currUrl, html: '' };
}

async function resolveGoogleMapsUrl(url) {
  try {
    const normUrl = normalizeMapInput(url);
    if (!normUrl) return { lat: null, lng: null, address: null, is404: false };

    let { lat, lng } = coordsFromText(normUrl);
    let address = placeNameFromText(normUrl);

    if (!lat) {
      const { finalUrl, html } = await fetchMapsFinalUrl(normUrl);
      if (finalUrl === "404_NOT_FOUND") {
        return { lat: null, lng: null, address: null, is404: true };
      }
      const coords = coordsFromText(finalUrl);
      lat = coords.lat;
      lng = coords.lng;
      
      if (!address) {
        address = placeNameFromText(finalUrl) || placeNameFromText(normUrl);
      }
    }

    return { lat, lng, address, is404: false };

  } catch (e) {
    console.error(' [ERROR] Map Parsing Error:', e.message);
    return { lat: null, lng: null, address: null, is404: false };
  }
}

function buildExpandedMapsUrl(lat, lng, address = null) {
  const la = parseFloat(lat).toFixed(7);
  const ln = parseFloat(lng).toFixed(7);
  let label = 'Location';
  if (address) {
    label = encodeURIComponent(String(address).split(',')[0].substring(0, 100));
  }
  return `https://www.google.com/maps/place/${label}/@${la},${ln},17z/data=!3m1!4b1!4m6!3m5!1s0:0!8m2!3d${la}!4d${ln}`;
}

function mapParseSuccess(lat, lng, address) {
  const addrStr = address || 'Location Detected';
  return {
    success: true,
    lat,
    lng,
    address: addrStr,
    expanded_url: buildExpandedMapsUrl(lat, lng, addrStr)
  };
}

// --- OTP HELPERS ---

async function sendOtpEmail(email, subject = 'ParkoSpace Verification') {
  try {
    const response = await axios.post("https://otp-service-beta.vercel.app/api/otp/generate", {
      email,
      type: "numeric",
      organization: "ParkoSpace",
      subject
    }, { timeout: 10000 });

    if (response.status === 200 || response.status === 201) {
      console.log(`\n[EMAIL GATEWAY] OTP Sent to ${email}\n`);
      return { success: true, error: null };
    } else {
      console.error(`[ERROR] OTP Service Response: ${response.data}`);
      return { success: false, error: "Failed to send OTP. Check email." };
    }
  } catch (e) {
    console.error(`[ERROR] OTP Service Error: ${e.message}`);
    return { success: false, error: "OTP Service Unreachable" };
  }
}

async function verifyOtpCode(email, code) {
  try {
    const response = await axios.post("https://otp-service-beta.vercel.app/api/otp/verify", {
      email,
      otp: code
    }, { timeout: 10000 });
    return response.status === 200;
  } catch (e) {
    console.error(`[ERROR] OTP Verify Error: ${e.message}`);
    return false;
  }
}

function safeUserDict(owner) {
  const { password_hash, ...safe } = owner;
  return safe;
}

// --- API ROUTES ---

// Config
app.get('/api/config', (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY || '';
  const hasKey = !!(key && key !== 'YOUR_GOOGLE_MAPS_API_KEY');
  const mapId = process.env.GOOGLE_MAPS_MAP_ID || '6062647ef5491f7110b5de54';
  return res.json({
    googleMapsApiKey: key,
    googleMapsMapId: mapId,
    hasGoogleMaps: hasKey,
    hasGoogleGeocoding: hasKey
  });
});

// Listings (Retrieve & filter nearby)
app.get('/api/listings', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat || DEFAULT_LAT);
    const lng = parseFloat(req.query.lng || DEFAULT_LNG);
    const radius = parseFloat(req.query.radius || 2.0);
    const ownerPhone = req.query.owner_phone;

    const allListings = await db.dbGetListings(ownerPhone);

    if (ownerPhone) {
      return res.json(allListings);
    }

    const isIndiaDefault = (Math.abs(lat - 20.5937) < 0.01 && Math.abs(lng - 78.9629) < 0.01);
    const effectiveRadius = isIndiaDefault ? 5000.0 : radius;

    const filtered = [];
    for (const l of allListings) {
      if (!l.lat || !l.lng) continue;
      const dist = haversineDistance(lat, lng, l.lat, l.lng);
      if (dist <= effectiveRadius) {
        l.distance = Math.round(dist * 100) / 100;
        filtered.push(l);
      }
    }

    return res.json(filtered);
  } catch (e) {
    console.error(`Error fetching listings: ${e.message}`);
    return res.json([]);
  }
});

// Parse Maps URL
app.post('/api/utils/parse-map-url', async (req, res) => {
  const url = (req.body.url || '').trim();
  const landmark = (req.body.landmark || '').trim();
  
  if (!url && !landmark) {
    return res.json({ success: false, error: "No URL or Landmark provided" });
  }

  let lat = null, lng = null, address = null, is404 = false;
  if (url) {
    const resolved = await resolveGoogleMapsUrl(url);
    lat = resolved.lat;
    lng = resolved.lng;
    address = resolved.address;
    is404 = resolved.is404;
  }

  if (is404) {
    return res.json({
      success: false,
      error: "This Google Maps link is invalid or returned a 404 (Not Found) error from Google. Please verify the URL."
    });
  }

  // If coordinates were found directly in the URL (desktop URL format)
  if (lat && lng) {
    return res.json(mapParseSuccess(lat, lng, address));
  }

  // Fallback to client-side geocoding using the browser Google Maps library
  // This bypasses the referrer restriction of the Google Maps API Key
  if (address) {
    return res.json({
      success: true,
      needsFrontendGeocoding: true,
      addressText: address
    });
  }

  if (landmark) {
    return res.json({
      success: true,
      needsFrontendGeocoding: true,
      addressText: landmark
    });
  }

  return res.json({ success: false, error: "Could not detect location coordinates or address from link." });
});

// Reverse Geocode Coords
app.post('/api/utils/reverse-geocode', async (req, res) => {
  try {
    const lat = parseFloat(req.body.lat);
    const lng = parseFloat(req.body.lng);
    
    if (isNaN(lat) || isNaN(lng)) {
      return res.json({ success: false, error: "Invalid coordinates" });
    }

    const address = await reverseGeocodeCoords(lat, lng) || 'Current GPS Location';
    return res.json(mapParseSuccess(lat, lng, address));
  } catch (e) {
    return res.json({ success: false, error: "Geocoding error" });
  }
});

// Geocode query (search input)
app.post('/api/utils/search-location', async (req, res) => {
  const query = req.body.query;
  if (!query) return res.json({ success: false, error: "No query provided" });

  const [lat, lng, address] = await geocodeText(query);
  if (lat && lng) {
    return res.json({ success: true, lat, lng, address });
  }
  return res.json({ success: false, error: "Location not found" });
});

// Create listing
app.post('/api/create', async (req, res) => {
  try {
    const data = req.body;
    const newListing = {
      id: uuid.v4(),
      title: data.title,
      desc: data.desc,
      area_landmark: data.area_landmark || '',
      price_hourly: parseFloat(data.price_hourly || 50),
      price_daily: parseFloat(data.price_daily || 300),
      price_monthly: parseFloat(data.price_monthly || 2000),
      lat: parseFloat(data.lat || 0),
      lng: parseFloat(data.lng || 0),
      address_text: data.address_text || 'Unknown Location',
      length: parseFloat(data.length || 0),
      breadth: parseFloat(data.breadth || 0),
      amenities: data.amenities || [],
      gmap_link: data.gmap_link || '#',
      gmap_link_regen: data.gmap_link_regen || '#',
      image: "https://images.unsplash.com/photo-1506015391300-4802dc74de2e?auto=format&fit=crop&w=400&q=80", // working photo placeholder
      owner_phone: data.owner_phone,
      is_sold: !!data.is_sold,
      created_at: Date.now() / 1000
    };
    await db.dbAddListing(newListing);
    return res.json({ success: true, listing: newListing });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Update listing
app.post('/api/listings/update', async (req, res) => {
  try {
    const data = req.body;
    const lid = data.id;
    const ownerPhone = data.owner_phone;

    const updateData = {
      title: data.title,
      desc: data.desc,
      area_landmark: data.area_landmark || '',
      length: parseFloat(data.length || 0),
      breadth: parseFloat(data.breadth || 0),
      price_hourly: parseFloat(data.price_hourly),
      price_daily: parseFloat(data.price_daily),
      price_monthly: parseFloat(data.price_monthly),
      gmap_link: data.gmap_link,
      gmap_link_regen: data.gmap_link_regen,
      is_sold: !!data.is_sold,
      lat: data.lat,
      lng: data.lng,
      address_text: data.address_text,
      amenities: data.amenities
    };

    const success = await db.dbUpdateListing(lid, updateData, ownerPhone);
    if (success) {
      return res.json({ success: true });
    }
    return res.status(403).json({ success: false, error: "Update failed" });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Delete listing
app.post('/api/listings/delete', async (req, res) => {
  try {
    const data = req.body;
    const success = await db.dbDeleteListing(data.id, data.owner_phone);
    if (success) {
      return res.json({ success: true });
    }
    return res.status(403).json({ success: false, error: "Delete failed" });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Check duplicate owner email/phone
app.post('/api/auth/check-duplicate', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const phone = (req.body.phone || '').trim();

  if (email) {
    const existing = await db.dbGetOwnerByEmail(email);
    if (existing) {
      return res.json({
        duplicate: true,
        field: "email",
        message: "This email is already registered. Please login instead."
      });
    }
  }

  if (phone) {
    const existing = await db.dbGetOwner(phone);
    if (existing) {
      return res.json({
        duplicate: true,
        field: "phone",
        message: "This phone number is already registered. Please login instead."
      });
    }
  }

  return res.json({ duplicate: false });
});

// Register: Step 1 (Send OTP email)
app.post('/api/auth/register', async (req, res) => {
  const name = (req.body.name || '').trim();
  const phone = (req.body.phone || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!name || !phone || !email || !password) {
    return res.status(400).json({ success: false, error: "All fields are required" });
  }
  if (phone.length < 10) {
    return res.status(400).json({ success: false, error: "Phone must be at least 10 digits" });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
  }

  // Duplicate checks
  const existingEmail = await db.dbGetOwnerByEmail(email);
  if (existingEmail) {
    return res.status(409).json({ success: false, error: "This email is already registered. Please login instead." });
  }

  const existingPhone = await db.dbGetOwner(phone);
  if (existingPhone) {
    return res.status(409).json({ success: false, error: "This phone number is already registered. Please login instead." });
  }

  // Send OTP via Verel API
  const { success, error } = await sendOtpEmail(email, 'ParkoSpace Registration Verification');
  if (success) {
    return res.json({ success: true, message: "OTP sent to your email" });
  }
  return res.status(500).json({ success: false, error });
});

// Register: Step 2 (Verify OTP & Create account)
app.post('/api/auth/register/verify', async (req, res) => {
  const name = (req.body.name || '').trim();
  const phone = (req.body.phone || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const code = (req.body.code || '').trim();

  if (!name || !phone || !email || !password || !code) {
    return res.status(400).json({ success: false, error: "Missing fields" });
  }

  // Race condition duplicate guard
  const existingEmail = await db.dbGetOwnerByEmail(email);
  if (existingEmail) {
    return res.status(409).json({ success: false, error: "This email was just registered. Please login." });
  }

  const existingPhone = await db.dbGetOwner(phone);
  if (existingPhone) {
    return res.status(409).json({ success: false, error: "This phone number was just registered. Please login." });
  }

  // Verify OTP
  const isOtpValid = await verifyOtpCode(email, code);
  if (!isOtpValid) {
    return res.status(401).json({ success: false, error: "Invalid or expired OTP" });
  }

  // Save Owner
  const passwordHash = await bcrypt.hash(password, 10);
  const ownerData = {
    name,
    phone,
    email,
    password_hash: passwordHash,
    joined_at: Date.now() / 1000
  };
  await db.dbSaveOwner(ownerData);

  const safe = safeUserDict(ownerData);
  req.session.user = safe;
  return res.json({ success: true, user: safe });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!email || !password) {
    return res.status(400).json({ success: false, error: "Email and password are required" });
  }

  const owner = await db.dbGetOwnerByEmail(email);
  if (!owner) {
    return res.status(404).json({ success: false, error: "No account found with this email" });
  }

  const pwHash = owner.password_hash || '';
  if (!pwHash) {
    return res.status(403).json({ success: false, error: "This account has no password set. Use Forgot Password to set one." });
  }

  const isMatch = await bcrypt.compare(password, pwHash);
  if (!isMatch) {
    return res.status(401).json({ success: false, error: "Incorrect password" });
  }

  const safe = safeUserDict(owner);
  req.session.user = safe;
  return res.json({ success: true, user: safe });
});

// Forgot Password: Step 1 (Send OTP)
app.post('/api/auth/forgot-password', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ success: false, error: "Email is required" });
  }

  const owner = await db.dbGetOwnerByEmail(email);
  if (!owner) {
    return res.status(404).json({ success: false, error: "No account found with this email" });
  }

  const { success, error } = await sendOtpEmail(email, 'ParkoSpace Password Reset');
  if (success) {
    return res.json({ success: true, message: "OTP sent to your email" });
  }
  return res.status(500).json({ success: false, error });
});

// Forgot Password: Step 2 (Reset password)
app.post('/api/auth/reset-password', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const code = (req.body.code || '').trim();
  const newPassword = req.body.new_password || '';

  if (!email || !code || !newPassword) {
    return res.status(400).json({ success: false, error: "All fields are required" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
  }

  const owner = await db.dbGetOwnerByEmail(email);
  if (!owner) {
    return res.status(404).json({ success: false, error: "No account found" });
  }

  const isOtpValid = await verifyOtpCode(email, code);
  if (!isOtpValid) {
    return res.status(401).json({ success: false, error: "Invalid or expired OTP" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.dbUpdatePassword(owner.phone, passwordHash);

  const safe = safeUserDict(owner);
  req.session.user = safe;
  return res.json({ success: true, user: safe, message: "Password updated successfully" });
});

// Check Session / Current User
app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ success: true, user: req.session.user });
  }
  return res.json({ success: false, user: null });
});

// Update Profile Settings (Name & Phone)
app.post('/api/auth/update-profile', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, error: "Unauthorized. Please log in." });
  }

  const oldPhone = req.session.user.phone;
  const newName = (req.body.name || '').trim();
  const newPhone = (req.body.phone || '').trim();

  if (!newName || !newPhone) {
    return res.status(400).json({ success: false, error: "Name and Phone fields cannot be empty." });
  }

  if (newPhone.length < 10) {
    return res.status(400).json({ success: false, error: "Phone number must be at least 10 digits." });
  }

  try {
    await db.dbUpdateOwnerProfile(oldPhone, newPhone, newName);
    
    // Cascade update in active session
    req.session.user.name = newName;
    req.session.user.phone = newPhone;
    
    return res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error(`[ERROR] Profile update failed: ${err.message}`);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: "Logout failed" });
    }
    res.clearCookie('parkospace.sid');
    return res.json({ success: true });
  });
});

// Wildcard fallback for React routing (SPA index.html)
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(` PARKOSPACE SERVER RUNNING ON PORT ${PORT}`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
