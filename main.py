from flask import Flask, render_template, jsonify, request, session, make_response, send_from_directory
from dotenv import load_dotenv
import math
from datetime import timedelta
import time
import random
import uuid
import json
import os
import sqlite3
import requests
import re
import urllib.parse
import io
import base64
from geopy.geocoders import Nominatim

# Try importing psycopg2 for PostgreSQL, handle if missing
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False
    print(" [WARNING] psycopg2 module not found. Install it with: pip install psycopg2-binary")

# --- CONFIGURATION ---
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
DB_FILE = 'parkospace.db'

# Global State for DB Type
USE_POSTGRES = False

print("\n" + "="*60)
print(" PARKOSPACE SERVER STARTING")
if not DATABASE_URL:
    print(" [INFO] No DATABASE_URL found in .env, defaulting to SQLite.")
else:
    print(" [INFO] DATABASE_URL found, attempting Supabase connection...")
print("="*60)

# --- DATABASE CONNECTION FACTORY ---
def get_db_connection():
    global USE_POSTGRES

    # 1. Try PostgreSQL (Supabase)
    if PSYCOPG2_AVAILABLE and DATABASE_URL and ("postgres" in DATABASE_URL or "postgresql" in DATABASE_URL):
        try:
            conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor, sslmode='require')
            USE_POSTGRES = True
            return conn
        except Exception as e:
            print(f" [WARNING] Supabase Connection Failed: {e}")
            print("    Falling back to Local SQLite.")
            USE_POSTGRES = False

    # 2. Fallback to SQLite
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

# --- DATABASE INITIALIZATION ---
def init_db():
    conn = get_db_connection()
    cur = conn.cursor()

    if USE_POSTGRES:
        print(" [SUCCESS] Connected & Initializing Supabase (PostgreSQL)...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS owners (
                phone TEXT PRIMARY KEY,
                name TEXT,
                email TEXT,
                joined_at REAL
            );
        """)
        # Migration for email
        try:
            cur.execute("ALTER TABLE owners ADD COLUMN IF NOT EXISTS email TEXT;")
            conn.commit()
        except:
            conn.rollback()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS listings (
                id TEXT PRIMARY KEY,
                title TEXT,
                "desc" TEXT,
                price_hourly REAL,
                price_daily REAL,
                price_monthly REAL,
                lat REAL,
                lng REAL,
                length REAL,
                breadth REAL,
                amenities TEXT,
                gmap_link TEXT,
                image TEXT,
                owner_phone TEXT REFERENCES owners(phone),
                is_sold BOOLEAN,
                created_at REAL,
                address_text TEXT,
                area_landmark TEXT
            );
        """)
        try:
            cur.execute("ALTER TABLE listings ADD COLUMN IF NOT EXISTS area_landmark TEXT;")
            conn.commit()
        except:
            conn.rollback()

        conn.commit()
    else:
        print(" [INFO] Initializing Local SQLite Tables...")
        cur.execute('''
            CREATE TABLE IF NOT EXISTS owners (
                phone TEXT PRIMARY KEY,
                name TEXT,
                email TEXT,
                joined_at REAL
            )
        ''')
        # SQLite Migrations
        try: cur.execute('ALTER TABLE owners ADD COLUMN email TEXT')
        except: pass

        try: cur.execute('ALTER TABLE listings ADD COLUMN address_text TEXT')
        except: pass

        try: cur.execute('ALTER TABLE listings ADD COLUMN area_landmark TEXT')
        except: pass

        cur.execute('''
            CREATE TABLE IF NOT EXISTS listings (
                id TEXT PRIMARY KEY,
                title TEXT,
                desc TEXT,
                price_hourly REAL,
                price_daily REAL,
                price_monthly REAL,
                lat REAL,
                lng REAL,
                length REAL,
                breadth REAL,
                amenities TEXT,
                gmap_link TEXT,
                image TEXT,
                owner_phone TEXT,
                is_sold INTEGER,
                created_at REAL,
                address_text TEXT,
                area_landmark TEXT,
                FOREIGN KEY(owner_phone) REFERENCES owners(phone)
            )
        ''')
        conn.commit()

    conn.close()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'parkospace-dev-secret-change-in-prod')
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE']   = False   # set True if using HTTPS
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

init_db()

# Default map center when GPS unavailable (India geographic center)
DEFAULT_LAT = 20.5937
DEFAULT_LNG = 78.9629

def _geocode_query(text):
    """Use the user's place text as-is for worldwide geocoding."""
    return (text or '').strip()

def _google_maps_api_key():
    key = os.getenv('GOOGLE_MAPS_API_KEY', '')
    if not key or key == 'YOUR_GOOGLE_MAPS_API_KEY':
        return None
    return key

def _google_geocode_forward(query):
    """Forward geocode (address/place name → lat, lng) via Google Geocoding API."""
    key = _google_maps_api_key()
    if not key or not query:
        return None, None, None
    try:
        resp = requests.get(
            'https://maps.googleapis.com/maps/api/geocode/json',
            params={
                'address': _geocode_query(query),
                'key': key,
            },
            timeout=8,
        )
        data = resp.json()
        if data.get('status') == 'OK' and data.get('results'):
            r = data['results'][0]
            loc = r['geometry']['location']
            return loc['lat'], loc['lng'], r.get('formatted_address')
        if data.get('status') not in ('OK', 'ZERO_RESULTS'):
            print(f' [WARN] Google geocode status: {data.get("status")} {data.get("error_message", "")}')
    except Exception as e:
        print(f' [WARN] Google geocode: {e}')
    return None, None, None

def _google_geocode_reverse(lat, lng):
    """Reverse geocode (lat, lng → address) via Google Geocoding API."""
    key = _google_maps_api_key()
    if not key:
        return None
    try:
        resp = requests.get(
            'https://maps.googleapis.com/maps/api/geocode/json',
            params={'latlng': f'{lat},{lng}', 'key': key},
            timeout=8,
        )
        data = resp.json()
        if data.get('status') == 'OK' and data.get('results'):
            return data['results'][0].get('formatted_address')
    except Exception as e:
        print(f' [WARN] Google reverse geocode: {e}')
    return None

def _geocode_text(query):
    """Address or landmark → coordinates. Google first, then Nominatim."""
    lat, lng, address = _google_geocode_forward(query)
    if lat and lng:
        return lat, lng, address
    try:
        geolocator = Nominatim(user_agent='parkospace_search_v1', timeout=6)
        location = geolocator.geocode(_geocode_query(query), language='en', exactly_one=True)
        if location:
            return location.latitude, location.longitude, location.address
    except Exception as e:
        print(f' [WARN] Nominatim geocode: {e}')
    return None, None, None

def _reverse_geocode_coords(lat, lng):
    """Coordinates → formatted address. Google first, then Nominatim."""
    address = _google_geocode_reverse(lat, lng)
    if address:
        return address
    try:
        geolocator = Nominatim(user_agent='parkospace_pro_v1', timeout=5)
        location = geolocator.reverse(f'{lat}, {lng}', language='en', exactly_one=True)
        if location and location.address:
            return location.address
    except Exception as e:
        print(f' [WARN] Nominatim reverse: {e}')
    return None

def _google_place_details(place_id):
    """Resolve Google place_id → lat, lng, address (Places API)."""
    key = _google_maps_api_key()
    if not key or not place_id:
        return None, None, None
    try:
        resp = requests.get(
            'https://maps.googleapis.com/maps/api/place/details/json',
            params={
                'place_id': place_id,
                'fields': 'geometry,formatted_address,name',
                'key': key,
            },
            timeout=8,
        )
        data = resp.json()
        if data.get('status') == 'OK' and data.get('result', {}).get('geometry'):
            loc = data['result']['geometry']['location']
            addr = data['result'].get('formatted_address') or data['result'].get('name')
            return loc['lat'], loc['lng'], addr
    except Exception as e:
        print(f' [WARN] Google place details: {e}')
    return None, None, None

def _extract_place_id(text):
    if not text:
        return None
    for pat in (r'!1s(ChI[\w-]+)', r'place_id[=:](ChI[\w-]+)', r'"place_id"\s*:\s*"(ChI[\w-]+)"'):
        m = re.search(pat, text)
        if m:
            return m.group(1)
    return None

def _build_expanded_maps_url(lat, lng, address=None):
    """Canonical Maps URL with exact pin coordinates embedded."""
    lat = round(float(lat), 7)
    lng = round(float(lng), 7)
    label = 'Location'
    if address:
        label = urllib.parse.quote_plus(str(address).split(',')[0][:100])
    return (
        f'https://www.google.com/maps/place/{label}/@{lat},{lng},17z/'
        f'data=!3m1!4b1!4m6!3m5!1s0:0!8m2!3d{lat}!4d{lng}'
    )

def _map_parse_success(lat, lng, address):
    address = address or 'Location Detected'
    return {
        'success': True,
        'lat': lat,
        'lng': lng,
        'address': address,
        'expanded_url': _build_expanded_maps_url(lat, lng, address),
    }

# --- ADVANCED MAP PARSER ---
_MAP_UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
_MAP_UA_MOBILE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

def _normalize_map_input(url):
    url = (url or '').strip()
    url = re.sub(r'[\u200b-\u200d\ufeff]', '', url)
    if url and not re.match(r'^https?://', url, re.I):
        url = 'https://' + url
    return url

def _coords_from_text(text):
    """Extract pin coordinates; prefer !3d/!4d (exact pin) over @ (map center)."""
    if not text:
        return None, None
    lat_m = re.search(r'!3d(-?\d+\.\d+)', text)
    lng_m = re.search(r'!4d(-?\d+\.\d+)', text)
    if lat_m and lng_m:
        return float(lat_m.group(1)), float(lng_m.group(1))
    for pat in (
        r'@(-?\d+\.\d+),(-?\d+\.\d+)',
        r'[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)',
        r'center=(-?\d+\.\d+)%2C(-?\d+\.\d+)',
        r'll=(-?\d+\.\d+),(-?\d+\.\d+)',
    ):
        m = re.search(pat, text, re.I)
        if m:
            return float(m.group(1)), float(m.group(2))
    return None, None

def _place_name_from_text(text):
    if not text:
        return None
    for pat in (r'/place[s]?/([^/@?&]+)', r'/maps/search/([^/@?&]+)'):
        m = re.search(pat, text, re.I)
        if m:
            name = urllib.parse.unquote_plus(m.group(1).replace('+', ' ')).strip()
            if name and not re.match(r'^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$', name):
                return name
    return None

def _fetch_maps_final_url(url):
    session = requests.Session()
    for ua in (_MAP_UA_DESKTOP, _MAP_UA_MOBILE):
        headers = {'User-Agent': ua}
        try:
            resp = session.head(url, allow_redirects=True, headers=headers, timeout=8)
            final_url = resp.url
            lat, lng = _coords_from_text(final_url)
            if lat and lng:
                return final_url, ''
            if 'google.com/maps' in final_url:
                return final_url, ''
        except Exception:
            pass
        try:
            resp = session.get(url, allow_redirects=True, headers=headers, timeout=12)
            final_url = resp.url
            for hop in resp.history:
                lat, lng = _coords_from_text(hop.url)
                if lat and lng:
                    return hop.url, resp.text or ''
            return final_url, resp.text or ''
        except Exception:
            pass
    return url, ''

def resolve_google_maps_url(url):
    try:
        url = _normalize_map_input(url)
        if not url:
            return None, None, None

        lat, lng = _coords_from_text(url)
        address = _place_name_from_text(url)

        if not lat:
            final_url, html = _fetch_maps_final_url(url)
            lat, lng = _coords_from_text(final_url)
            if not lat and html:
                lat, lng = _coords_from_text(html[:100000])
            if not address:
                address = _place_name_from_text(final_url) or _place_name_from_text(url)

            place_id = (
                _extract_place_id(url)
                or _extract_place_id(final_url)
                or _extract_place_id(html[:100000] if html else '')
            )
            if not lat and place_id:
                g_lat, g_lng, g_addr = _google_place_details(place_id)
                if g_lat and g_lng:
                    lat, lng, address = g_lat, g_lng, g_addr or address

        if not lat and address:
            g_lat, g_lng, g_addr = _geocode_text(address)
            if g_lat and g_lng:
                lat, lng, address = g_lat, g_lng, g_addr

        if lat and lng and not address:
            address = _reverse_geocode_coords(lat, lng) or 'Location Detected'

        return lat, lng, address

    except Exception as e:
        print(f' [ERROR] Map Parsing Error: {e}')
        return None, None, None

# --- DATABASE OPERATIONS ---

def db_get_listings(owner_phone=None):
    conn = get_db_connection()
    cur = conn.cursor()

    if owner_phone:
        query = "SELECT * FROM listings WHERE owner_phone = %s" if USE_POSTGRES else "SELECT * FROM listings WHERE owner_phone = ?"
        cur.execute(query, (owner_phone,))
    else:
        cur.execute("SELECT * FROM listings")

    rows = cur.fetchall()
    conn.close()

    results = []
    for row in rows:
        d = dict(row)
        d['amenities'] = json.loads(d['amenities']) if d['amenities'] else []
        d['is_sold'] = bool(d['is_sold'])
        results.append(d)
    return results

def db_add_listing(data):
    conn = get_db_connection()
    cur = conn.cursor()
    amenities_json = json.dumps(data['amenities'])
    is_sold = data['is_sold']
    if not USE_POSTGRES: is_sold = 1 if is_sold else 0

    if USE_POSTGRES:
        query = """
            INSERT INTO listings (id, title, "desc", area_landmark, price_hourly, price_daily, price_monthly, lat, lng, length, breadth, amenities, gmap_link, image, owner_phone, is_sold, created_at, address_text)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        params = (
            data['id'], data['title'], data['desc'], data.get('area_landmark', ''),
            data['price_hourly'], data['price_daily'], data['price_monthly'],
            data['lat'], data['lng'], data['length'], data['breadth'],
            amenities_json, data['gmap_link'], data['image'], data['owner_phone'],
            is_sold, data['created_at'], data.get('address_text', '')
        )
    else:
        query = """
            INSERT INTO listings (id, title, desc, area_landmark, price_hourly, price_daily, price_monthly, lat, lng, length, breadth, amenities, gmap_link, image, owner_phone, is_sold, created_at, address_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        params = (
            data['id'], data['title'], data['desc'], data.get('area_landmark', ''),
            data['price_hourly'], data['price_daily'], data['price_monthly'],
            data['lat'], data['lng'], data['length'], data['breadth'],
            amenities_json, data['gmap_link'], data['image'], data['owner_phone'],
            is_sold, data['created_at'], data.get('address_text', '')
        )

    cur.execute(query, params)
    conn.commit()
    conn.close()

def db_update_listing(lid, data, owner_phone):
    conn = get_db_connection()
    cur = conn.cursor()
    is_sold = data['is_sold']
    if not USE_POSTGRES: is_sold = 1 if is_sold else 0

    base_query = """
        UPDATE listings SET
            title=%s, "desc"=%s, area_landmark=%s, length=%s, breadth=%s,
            price_hourly=%s, price_daily=%s, price_monthly=%s,
            gmap_link=%s, is_sold=%s
    """ if USE_POSTGRES else """
        UPDATE listings SET
            title=?, desc=?, area_landmark=?, length=?, breadth=?,
            price_hourly=?, price_daily=?, price_monthly=?,
            gmap_link=?, is_sold=?
    """

    params = [
        data['title'], data['desc'], data.get('area_landmark', ''),
        data['length'], data['breadth'],
        data['price_hourly'], data['price_daily'], data['price_monthly'],
        data['gmap_link'], is_sold
    ]

    if 'lat' in data and data['lat']:
        base_query += ", lat=%s, lng=%s, address_text=%s" if USE_POSTGRES else ", lat=?, lng=?, address_text=?"
        params.extend([data['lat'], data['lng'], data.get('address_text', '')])

    base_query += " WHERE id=%s AND owner_phone=%s" if USE_POSTGRES else " WHERE id=? AND owner_phone=?"
    params.extend([lid, owner_phone])

    cur.execute(base_query, tuple(params))
    conn.commit()
    count = cur.rowcount
    conn.close()
    return count > 0

def db_delete_listing(lid, owner_phone):
    conn = get_db_connection()
    cur = conn.cursor()
    query = "DELETE FROM listings WHERE id=%s AND owner_phone=%s" if USE_POSTGRES else "DELETE FROM listings WHERE id=? AND owner_phone=?"
    cur.execute(query, (lid, owner_phone))
    conn.commit()
    count = cur.rowcount
    conn.close()
    return count > 0

def db_get_owner(phone):
    conn = get_db_connection()
    cur = conn.cursor()
    query = "SELECT * FROM owners WHERE phone = %s" if USE_POSTGRES else "SELECT * FROM owners WHERE phone = ?"
    cur.execute(query, (phone,))
    owner = cur.fetchone()
    conn.close()
    return dict(owner) if owner else None

def db_save_owner(data):
    conn = get_db_connection()
    cur = conn.cursor()
    if USE_POSTGRES:
        query = """
            INSERT INTO owners (phone, name, email, joined_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (phone) DO UPDATE SET
                name = EXCLUDED.name,
                email = EXCLUDED.email
        """
        params = (data['phone'], data['name'], data.get('email', ''), data['joined_at'])
    else:
        query = "INSERT OR REPLACE INTO owners (phone, name, email, joined_at) VALUES (?, ?, ?, ?)"
        params = (data['phone'], data['name'], data.get('email', ''), data['joined_at'])
    cur.execute(query, params)
    conn.commit()
    conn.close()

# --- BACKEND LOGIC ---

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2) * math.sin(dLat/2) + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
        math.sin(dLon/2) * math.sin(dLon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

# --- API ROUTES ---

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json', mimetype='application/manifest+json')

@app.route('/sw.js')
def service_worker():
    resp = make_response(send_from_directory('static', 'sw.js', mimetype='application/javascript'))
    resp.headers['Cache-Control'] = 'no-cache'
    resp.headers['Service-Worker-Allowed'] = '/'
    return resp

@app.route('/api/config', methods=['GET'])
def get_config():
    """Safely expose non-secret config (API keys needed by frontend) to the browser."""
    key = os.getenv('GOOGLE_MAPS_API_KEY', '')
    has_key = bool(key and key != 'YOUR_GOOGLE_MAPS_API_KEY')
    map_id = os.getenv('GOOGLE_MAPS_MAP_ID', '6062647ef5491f7110b5de54')
    return jsonify({
        'googleMapsApiKey': key,
        'googleMapsMapId': map_id,
        'hasGoogleMaps': has_key,
        'hasGoogleGeocoding': has_key,
    })

@app.route('/api/listings', methods=['GET'])
def get_listings():
    try:
        lat = float(request.args.get('lat', DEFAULT_LAT))
        lng = float(request.args.get('lng', DEFAULT_LNG))
        radius = float(request.args.get('radius', 5.0))
        owner_phone = request.args.get('owner_phone')

        all_listings = db_get_listings(owner_phone)

        if owner_phone:
            return jsonify(all_listings)

        filtered = []
        for l in all_listings:
            if not l.get('lat') or not l.get('lng'): continue
            dist = haversine_distance(lat, lng, l['lat'], l['lng'])
            if dist <= radius:
                l['distance'] = round(dist, 2)
                filtered.append(l)

        return jsonify(filtered)
    except Exception as e:
        print(f"Error fetching listings: {e}")
        return jsonify([])

@app.route('/api/utils/parse-map-url', methods=['POST'])
def parse_map_url():
    data = request.get_json(silent=True) or {}
    url = (data.get('url') or request.form.get('url') or '').strip()
    landmark = (data.get('landmark') or '').strip()
    if not url and not landmark:
        return jsonify({"success": False, "error": "No URL provided"})

    lat, lng, address = (None, None, None)
    if url:
        lat, lng, address = resolve_google_maps_url(url)

    if not lat and landmark:
        lat, lng, address = _geocode_text(landmark)

    if lat and lng:
        return jsonify(_map_parse_success(lat, lng, address))
    return jsonify({"success": False, "error": "Could not detect location. Try a standard Google Maps link."})

@app.route('/api/utils/reverse-geocode', methods=['POST'])
def reverse_geocode():
    data = request.get_json(silent=True) or {}
    try:
        lat = float(data.get('lat'))
        lng = float(data.get('lng'))
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Invalid coordinates"})

    address = _reverse_geocode_coords(lat, lng) or 'Current GPS Location'
    return jsonify(_map_parse_success(lat, lng, address))

@app.route('/api/utils/search-location', methods=['POST'])
def search_location():
    query = request.json.get('query')
    if not query: return jsonify({"success": False, "error": "No query provided"})

    lat, lng, address = _geocode_text(query)
    if lat and lng:
        return jsonify({"success": True, "lat": lat, "lng": lng, "address": address})
    return jsonify({"success": False, "error": "Location not found"})

@app.route('/api/create', methods=['POST'])
def create_listing():
    data = request.json
    new_listing = {
        "id": str(uuid.uuid4()),
        "title": data['title'],
        "desc": data['desc'],
        "area_landmark": data.get('area_landmark', ''),
        "price_hourly": float(data.get('price_hourly', 50)),
        "price_daily": float(data.get('price_daily', 300)),
        "price_monthly": float(data.get('price_monthly', 2000)),
        "lat": float(data.get('lat', 0)),
        "lng": float(data.get('lng', 0)),
        "address_text": data.get('address_text', 'Unknown Location'),
        "length": float(data.get('length', 0)),
        "breadth": float(data.get('breadth', 0)),
        "amenities": data.get('amenities', []),
        "gmap_link": data.get('gmap_link', '#'),
        "image": "https://source.unsplash.com/random/400x300?parking,city,car",
        "owner_phone": data.get('owner_phone'),
        "is_sold": data.get('is_sold', False),
        "created_at": time.time()
    }
    db_add_listing(new_listing)
    return jsonify({"success": True, "listing": new_listing})

@app.route('/api/listings/update', methods=['POST'])
def update_listing():
    data = request.json
    lid = data.get('id')
    owner_phone = data.get('owner_phone')

    update_data = {
        'title': data['title'],
        'desc': data['desc'],
        'area_landmark': data.get('area_landmark', ''),
        'length': float(data.get('length', 0)),
        'breadth': float(data.get('breadth', 0)),
        'price_hourly': float(data['price_hourly']),
        'price_daily': float(data['price_daily']),
        'price_monthly': float(data['price_monthly']),
        'gmap_link': data['gmap_link'],
        'is_sold': data.get('is_sold', False),
        'lat': data.get('lat'),
        'lng': data.get('lng'),
        'address_text': data.get('address_text')
    }

    if db_update_listing(lid, update_data, owner_phone):
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "Update failed"}), 403

@app.route('/api/listings/delete', methods=['POST'])
def delete_listing():
    data = request.json
    if db_delete_listing(data.get('id'), data.get('owner_phone')):
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "Delete failed"}), 403

# --- EMAIL OTP INTEGRATION ---
@app.route('/api/auth/send-otp', methods=['POST'])
def send_otp():
    email = request.json.get('email')
    if not email: return jsonify({"error": "Email is required for OTP"}), 400

    # Using public free-otp-service (sauravhathi)
    try:
        response = requests.post("https://otp-service-beta.vercel.app/api/otp/generate", json={
            "email": email,
            "type": "numeric",
            "organization": "ParkoSpace",
            "subject": "ParkoSpace Login Verification"
        }, timeout=10)

        if response.status_code in [200, 201]:
            print(f"\n[EMAIL GATEWAY] OTP Sent to {email}\n")
            return jsonify({"success": True, "message": "OTP sent to email"})
        else:
            print(f"[ERROR] Service Response: {response.text}")
            return jsonify({"success": False, "error": "Failed to send OTP. Check email."}), 500

    except Exception as e:
        print(f"[ERROR] OTP Service Error: {e}")
        return jsonify({"success": False, "error": "OTP Service Unreachable"}), 500

@app.route('/api/auth/verify-owner', methods=['POST'])
def verify_owner():
    data = request.json
    phone = data.get('phone')
    email = data.get('email')
    code = data.get('code')
    name = data.get('name')

    if not email or not code:
        return jsonify({"success": False, "error": "Missing Email or OTP"}), 400

    # Verify with external service
    try:
        response = requests.post("https://otp-service-beta.vercel.app/api/otp/verify", json={
            "email": email,
            "otp": code
        }, timeout=10)

        # Check if the service says it's valid
        if response.status_code == 200:
            # Login Success - Create/Update User
            existing = db_get_owner(phone)
            if not existing:
                existing = {"name": name, "phone": phone, "email": email, "joined_at": time.time()}
                db_save_owner(existing)
            else:
                # Update email if changed
                existing['email'] = email
                db_save_owner(existing)

            session.permanent = True
            session['user'] = existing
            return jsonify({"success": True, "user": existing})
        else:
            return jsonify({"success": False, "error": "Invalid OTP Code"}), 401

    except Exception as e:
        print(f"[ERROR] Verify Error: {e}")
        return jsonify({"success": False, "error": "Verification Failed"}), 500


# ── SESSION AUTH ROUTES ────────────────────────────────────────

@app.route('/api/auth/me', methods=['GET'])
def auth_me():
    """Return currently logged-in user from session cookie, or null."""
    user = session.get('user')
    if user:
        return jsonify({"success": True, "user": user})
    return jsonify({"success": False, "user": None})

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    session.clear()
    return jsonify({"success": True})

# ── AI INFERENCE PROXY ──────────────────────────────────────────
if __name__ == '__main__':
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
