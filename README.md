# ParkoSpace

A peer-to-peer parking marketplace for any city. Space owners list driveways and private parking spots. People looking for parking find them on a live map and contact owners directly. No middlemen, no booking fees.

Built with Flask, Google Maps, and a dark-themed progressive web app.

---

## What It Does

**For people looking for parking**

- Open the map, allow location access, or search any city or neighbourhood worldwide
- Browse nearby parking spots as price pins on Google Maps
- Call the owner from the listing card
- Open directions via the listing’s Google Maps link

**For space owners**

- Register with phone number and email OTP verification
- List a space with title, landmark, Google Maps link (or GPS), dimensions, and pricing
- Paste a Maps link and tap the wand — coordinates are geocoded and the link is rewritten with exact lat/lng
- Edit or remove listings from the owner dashboard
- Mark spaces as booked when no longer available

---

## Tech Stack

| Layer       | Technology                                      |
|-------------|-------------------------------------------------|
| Backend     | Python, Flask                                   |
| Database    | SQLite (local) or PostgreSQL via Supabase        |
| Maps        | Google Maps JavaScript API, Places API, Geocoding API |
| Auth        | Email OTP, Flask sessions (30-day cookies)      |
| Frontend    | Vanilla JS, Tailwind CSS (CDN), Lucide Icons    |
| Hosting     | Gunicorn — Render, Railway, VPS, or local       |

---

## Project Structure

```
main.py                 Flask app and API routes
requirements.txt        Python dependencies
.env                    Environment variables (not committed)
static/
  css/styles.css        Styles and design tokens
  js/app.js             Frontend (views, map, auth, listings)
  manifest.json         PWA manifest
  sw.js                 Service worker
  logo.png              Brand logo
templates/
  index.html            App shell
```

---

## Setup

**1. Clone and enter the project**

```bash
git clone https://github.com/ParkoSpace/in.git
cd in
```

**2. Install dependencies**

```bash
pip install -r requirements.txt
```

**3. Create `.env` next to `main.py`**

```env
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
GOOGLE_MAPS_MAP_ID=6062647ef5491f7110b5de54
SECRET_KEY=change_this_to_a_long_random_string
```

`GOOGLE_MAPS_MAP_ID` is the Map ID from Google Cloud → **Map Management** (linked to your custom map style). Optional if you keep the default above.

**Custom map style (hybrid + monochrome light):** In [Map styles](https://console.cloud.google.com/google/maps-apis/studio/styles), associate the style with this Map ID, enable **Hybrid** under map types, click **Publish**, and use the same API key project.

Optional — PostgreSQL (otherwise SQLite is used automatically):

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

**4. Enable Google APIs**

In [Google Cloud Console](https://console.cloud.google.com/), enable:

- Maps JavaScript API
- Places API
- Geocoding API

Restrict the key to your domains (and server IP if you use server-side geocoding). See [API key best practices](https://developers.google.com/maps/api-security-best-practices).

**5. Run**

```bash
python main.py
```

Open `http://localhost:5000`.

---

## Environment Variables

| Variable              | Required | Description |
|-----------------------|----------|-------------|
| `GOOGLE_MAPS_API_KEY` | Yes      | Maps JS, Places, and Geocoding |
| `GOOGLE_MAPS_MAP_ID`  | No       | Cloud map style Map ID (default: your ParkoSpace style) |
| `SECRET_KEY`          | Yes      | Flask session secret (use a strong random value in production) |
| `DATABASE_URL`        | No       | PostgreSQL connection string; omit for SQLite |

The Maps key is loaded by the browser from `/api/config` and used on the server for link parsing and geocoding.

---

## Location & Geocoding

- Works for **any location** — no city lock-in; search and geocoding use the place name or Maps link you provide
- **Map link wand**: resolves coordinates (Google Geocoding / Places when configured, OpenStreetMap Nominatim as fallback), then **rewrites the input** with a full `google.com/maps/place/.../@lat,lng` URL
- **GPS button** on the owner form sets location when a short link cannot be parsed
- **Area / Landmark** field can be geocoded if the link alone fails

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Frontend shell |
| GET | `/api/config` | Public config (Maps key, flags) |
| GET | `/api/listings` | Listings by `lat`, `lng`, `radius` (km) |
| POST | `/api/create` | Create listing |
| POST | `/api/listings/update` | Update listing |
| POST | `/api/listings/delete` | Delete listing |
| POST | `/api/utils/parse-map-url` | Parse/geocode Maps URL; returns `expanded_url` |
| POST | `/api/utils/reverse-geocode` | lat/lng → address + expanded URL |
| POST | `/api/utils/search-location` | Place name → coordinates |
| POST | `/api/auth/send-otp` | Send email OTP |
| POST | `/api/auth/verify-owner` | Verify OTP, create session |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/logout` | Log out |

---

## Authentication

Owners sign in with email OTP. A 30-day session cookie is set after verification. The app calls `/api/auth/me` on load to restore the session.

---

## Deployment

```bash
gunicorn main:app --bind 0.0.0.0:$PORT --workers 2
```

On HTTPS hosts, set `SESSION_COOKIE_SECURE = True` in `main.py` for production.

---

## License

MIT License. Free to use, modify, and distribute.
