# ParkoSpace

A peer-to-peer premium parking marketplace. Space owners list driveways and private parking spots. Drivers looking for parking find them on a live map and contact owners directly. No middlemen, no booking fees.

This repository is built with **Vite + React (Tailwind CSS)** for the frontend and **Node.js (Express)** for the backend.

---

## Tech Stack

| Layer       | Technology                                            |
|-------------|-------------------------------------------------------|
| **Frontend** | React (Vite), Tailwind CSS, Lucide Icons              |
| **Backend**  | Node.js, Express, Express-Session                     |
| **Database** | SQLite (local fallback) or PostgreSQL (e.g. Supabase)  |
| **Maps API** | Google Maps JavaScript API, Places Autocomplete, Geocoding |
| **Auth**     | Email OTP + Session-based cookies                     |

---

## Directory Structure

```
├── /backend
│   ├── db.js          Database initialization (SQLite & PostgreSQL migrations)
│   ├── server.js      Express API routes, auth sessions, and geocoding services
│   └── package.json   Node backend configurations & scripts
│
├── /frontend
│   ├── src/           React components, maps, dashboard, and style tokens
│   ├── index.html     Apple PWA configuration and styling declarations
│   ├── vite.config.js Integrates Tailwind CSS and dev API proxy redirection
│   └── package.json   React application scripts & dependencies
│
└── .env               Global environment variables (Google Maps & session secrets)
```

---

## Setup & Running Locally

### 1. Clone & Setup Configuration
Clone the repository and create a `.env` file in the root directory:

```env
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
GOOGLE_MAPS_MAP_ID=6062647ef5491f7110b5de54
SECRET_KEY=change_this_to_a_long_random_string

# Optional: PostgreSQL (falls back to local SQLite 'parkospace.db' if omitted)
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

Make sure to enable **Maps JavaScript API**, **Places API**, and **Geocoding API** in your Google Cloud Developer Console.

### 2. Start the Backend Server
```bash
cd backend
npm install
npm run dev
```
*Starts Express API server on port `8080`.*

### 3. Start the Frontend Application
```bash
cd ../frontend
npm install
npm run dev
```
*Starts Vite development server on port `5173`. Any API queries will be automatically proxied to port `8080`.*

To compile an optimized production bundle, run:
```bash
npm run build
```

---

## Key Features & UI Integrations

* **Premium Theme**: Tailored HSL colors, ambient gradients, and backdrop filters inspired by `parkospace.xyz`.
* **Dynamic Map Pins**: Displays spots as color-coded circle markers (Green for available, Red for sold-out). Current user position displays as a custom pulsing blue marker with a floating `YOU` label.
* **Interactive Popups**: Clicking a marker opens detailed pricing (Hourly, Daily, Monthly), dimensions, landmark details, and quick action buttons (**Navigate** and **Call Owner**).
* **Direct Sidebar Auto-focus**: Desktop sidebar and mobile drawer list full descriptions, pricing, and selected amenities. Clicking any listing automatically pans the map and triggers its detailed info popup.
* **Geocoded Verification**: Partners paste a Maps link to list a space, and the backend automatically geocodes it, showing a verified address and coordinates before creation.

---

## Deploying to Render

This project is configured as a Node.js monorepo and can be deployed to **Render** as a single Web Service:

### 1. Web Service Configuration
* **Environment**: `Node`
* **Build Command**: `npm run build` (runs the root-level script to install and compile both frontend & backend)
* **Start Command**: `npm start` (starts the Express server)

### 2. Environment Variables
Add these environment variables in your Render Web Service dashboard:
* `GOOGLE_MAPS_API_KEY`: Your Google Maps API Key
* `GOOGLE_MAPS_MAP_ID`: `6062647ef5491f7110b5de54` (or your custom Map ID)
* `SECRET_KEY`: A secure random secret string for session cookies
* `DATABASE_URL`: Your Supabase or other PostgreSQL connection string (the service will automatically enable SSL Mode)

---

## License

MIT License. Free to use, modify, and distribute.
