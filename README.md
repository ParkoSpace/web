# ParkoSpace — V2

A Bengaluru-focused peer-to-peer parking marketplace. Space owners list their driveways and private parking areas. People looking for parking find and contact them directly through a live map. No middlemen, no booking fees.

Built with Flask, Google Maps, and a dark-themed frontend.

---

## What It Does

**For people looking for parking**

- Open the map and allow location access, or search any Bengaluru neighbourhood
- Browse nearby parking spots shown as price pins on a live Google Map
- Call the owner directly from the listing card
- Navigate to the spot using the built-in Google Maps link

**For space owners**

- Register with a phone number and email OTP verification
- List a parking space with title, location, dimensions, and pricing
- Edit or remove listings at any time from the owner dashboard
- Listings stay active until you mark them as booked or delete them

---

## Tech Stack

| Layer       | Technology                                      |
|-------------|-------------------------------------------------|
| Backend     | Python, Flask                                   |
| Database    | SQLite (local) or PostgreSQL via Supabase        |
| Maps        | Google Maps JavaScript API, Places API          |
| Auth        | Email OTP via external OTP service, Flask sessions with 30-day cookies |
| Frontend    | Vanilla JS, Tailwind CSS (CDN), Lucide Icons    |
| Fonts       | Bebas Neue, Space Grotesk, JetBrains Mono       |
| Hosting     | Gunicorn-compatible, deployable on Render, Railway, or any VPS |

---

## Project Structure

```
files/
    main.py               Flask application, all API routes
    requirements.txt      Python dependencies
    .env                  Environment variables (not committed)
    static/
        css/
            styles.css    All custom styles and design tokens
        js/
            app.js        Frontend — all views, Google Maps, auth flow
        logo.png          Brand logo
    templates/
        index.html        Single HTML shell, loads app.js
```

---

## Setup

**1. Clone the repository**

```bash
git clone https://github.com/your-username/parkospace.git
cd parkospace/files
```

**2. Install dependencies**

```bash
pip install flask python-dotenv psycopg2-binary requests geopy gunicorn
```

**3. Create the .env file**

Create a file named `.env` in the same folder as `main.py` with the following content:

```
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
SECRET_KEY=change_this_to_a_random_string
```

To get a Google Maps API key, go to the Google Cloud Console, create a project, and enable these three APIs:

- Maps JavaScript API
- Places API
- Geocoding API

**4. Run the server**

```bash
python main.py
```

The app runs at `http://localhost:5000` by default.

---

## Environment Variables

| Variable              | Required | Description                                                    |
|-----------------------|----------|----------------------------------------------------------------|
| `GOOGLE_MAPS_API_KEY` | Yes      | Google Maps API key with Maps JS, Places, and Geocoding enabled |
| `SECRET_KEY`          | Yes      | Flask session secret — use a long random string in production  |
| `DATABASE_URL`        | No       | PostgreSQL connection string. If not set, SQLite is used automatically |

---

## Google Maps Setup

The API key is never hardcoded in the frontend. On page load, the browser fetches the key from `/api/config`, then the Google Maps SDK is loaded dynamically. This keeps the key out of the source code and out of version control.

Restrict your API key in the Google Cloud Console to your domain to prevent unauthorized usage.

---

## Database

The app supports both SQLite and PostgreSQL. SQLite requires no configuration and is created automatically at `parkospace.db` on first run. To switch to PostgreSQL, set the `DATABASE_URL` environment variable to a valid connection string and the app will use it automatically.

Tables created on startup:

- `owners` — registered space owners (phone, name, email, joined date)
- `listings` — parking spaces (title, location, dimensions, pricing, owner)

---

## API Reference

| Method | Endpoint                     | Description                              |
|--------|------------------------------|------------------------------------------|
| GET    | `/`                          | Serves the frontend shell                |
| GET    | `/api/config`                | Returns public config including Maps key |
| GET    | `/api/listings`              | Fetch listings by location and radius    |
| POST   | `/api/create`                | Create a new listing                     |
| POST   | `/api/listings/update`       | Update an existing listing               |
| POST   | `/api/listings/delete`       | Delete a listing                         |
| POST   | `/api/utils/parse-map-url`   | Extract coordinates from a Maps URL      |
| POST   | `/api/utils/search-location` | Geocode a location name to coordinates   |
| POST   | `/api/auth/send-otp`         | Send OTP to email                        |
| POST   | `/api/auth/verify-owner`     | Verify OTP and create session            |
| GET    | `/api/auth/me`               | Return current session user              |
| POST   | `/api/auth/logout`           | Clear session                            |

---

## Authentication

Owners register and log in using email OTP. Once verified, a session cookie is set with a 30-day expiry. The session persists across page refreshes and browser restarts without requiring re-login.

The frontend checks `/api/auth/me` on every page load and restores the session state before rendering anything.

---

## Deployment

The app runs with Gunicorn in production. A basic command:

```bash
gunicorn main:app --bind 0.0.0.0:$PORT --workers 2
```

Set the `PORT` environment variable to the port your host assigns. On Render or Railway this is handled automatically.

Set `SESSION_COOKIE_SECURE = True` in `main.py` if running on HTTPS, which is recommended for all production deployments.

---

## What Is Not in V2

The following features from earlier versions have been intentionally removed and are planned for a future V3 release:

- Parking space photo upload
- Automated area detection from photos
- AI-based pricing suggestions

These will return once the model pipeline is stable and ready for production use.

---

## License

MIT License. Free to use, modify, and distribute.
