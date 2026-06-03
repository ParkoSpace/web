import React, { useState, useEffect, useRef } from 'react';
import { Loader as MapsLoader } from '@googlemaps/js-api-loader';
import { Search, Crosshair, MapPin, Sliders, Menu, X, Navigation, Phone, ChevronUp, ChevronDown, Loader as LucideLoader } from 'lucide-react';

export default function MapScreen({ currentUser, onBackToHome, onOpenAuth }) {
  const formatPrice = (price) => {
    if (price === null || price === undefined || price < 0) return 'N/A';
    return `₹${price}`;
  };

  const formatPriceWithUnit = (price, unit = '') => {
    if (price === null || price === undefined || price < 0) return 'N/A';
    return `₹${price}${unit}`;
  };

  const [listings, setListings] = useState([]);
  const [radius, setRadius] = useState(2); // Default to 2km radius search
  const [userLoc, setUserLoc] = useState({ lat: 12.9927, lng: 77.6676 }); // default Bangalore center
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapConfig, setMapConfig] = useState(null);
  
  // Mobile drawer state
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  
  // References
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const userMarkerRef = useRef(null);
  const userRingMarkerRef = useRef(null);
  const searchMarkerRef = useRef(null);
  const listingMarkersRef = useRef([]);
  const infoWindowRef = useRef(null);
  const autocompleteRef = useRef(null);

  // Fetch listings relative to center
  const fetchListings = async (lat, lng, rad) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/listings?lat=${lat}&lng=${lng}&radius=${rad}`);
      const data = await response.json();
      setListings(data);
      updateMapMarkers(data, lat, lng);
    } catch (e) {
      console.error('Failed to fetch listings:', e);
    } finally {
      setLoading(false);
    }
  };

  // Load configuration and Google Maps on mount
  useEffect(() => {
    const initMaps = async () => {
      try {
        const response = await fetch('/api/config');
        const cfg = await response.json();
        setMapConfig(cfg);

        if (!cfg.hasGoogleMaps) {
          setLoading(false);
          return;
        }

        const loader = new MapsLoader({
          apiKey: cfg.googleMapsApiKey,
          version: 'weekly',
          libraries: ['places', 'marker'],
          mapIds: [cfg.googleMapsMapId || '6062647ef5491f7110b5de54']
        });

        const google = await loader.load();
        const mapEl = mapRef.current;
        if (!mapEl) return;

        // Custom map style settings (similar to Flask app.js)
        const mapOpts = {
          center: userLoc,
          zoom: 5, // initial zoom
          mapId: cfg.googleMapsMapId || '6062647ef5491f7110b5de54',
          mapTypeId: google.maps.MapTypeId.HYBRID,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
          gestureHandling: 'greedy'
        };

        const map = new google.maps.Map(mapEl, mapOpts);
        mapInstanceRef.current = map;
        infoWindowRef.current = new google.maps.InfoWindow({
          pixelOffset: new google.maps.Size(0, -8)
        });

        // Initialize Places Autocomplete
        const searchInput = document.getElementById('map-search-input');
        if (searchInput) {
          const ac = new google.maps.places.Autocomplete(searchInput, {
            fields: ['geometry', 'formatted_address', 'name']
          });
          autocompleteRef.current = ac;

          ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            if (!place.geometry) {
              alert('Location not found.');
              return;
            }
            const newLat = place.geometry.location.lat();
            const newLng = place.geometry.location.lng();
            
            const newCoords = { lat: newLat, lng: newLng };
            setUserLoc(newCoords);
            map.panTo(newCoords);
            map.setZoom(15);

            // Add/Move search marker
            if (searchMarkerRef.current) searchMarkerRef.current.setMap(null);
            searchMarkerRef.current = new google.maps.Marker({
              position: newCoords,
              map: map
            });

            fetchListings(newLat, newLng, radius);
          });
        }

        setMapLoaded(true);
        
        // Auto locate user on load check
        if (navigator.permissions && navigator.permissions.query) {
          navigator.permissions.query({ name: 'geolocation' }).then((result) => {
            if (result.state === 'granted') {
              locateUser(map);
            } else {
              setShowLocationPrompt(true);
              fetchListings(userLoc.lat, userLoc.lng, radius);
            }
          }).catch(() => {
            setShowLocationPrompt(true);
            fetchListings(userLoc.lat, userLoc.lng, radius);
          });
        } else {
          setShowLocationPrompt(true);
          fetchListings(userLoc.lat, userLoc.lng, radius);
        }

      } catch (err) {
        console.error('Error loading Google Maps:', err);
      } finally {
        setLoading(false);
      }
    };

    initMaps();

    return () => {
      // Clean up markers
      if (userMarkerRef.current) userMarkerRef.current.setMap(null);
      if (userRingMarkerRef.current) userRingMarkerRef.current.setMap(null);
      if (searchMarkerRef.current) searchMarkerRef.current.setMap(null);
      listingMarkersRef.current.forEach(m => {
        if (m.setMap) m.setMap(null); else m.map = null;
      });
    };
  }, []);

  // Update map listings markers
  const updateMapMarkers = (items, centerLat, centerLng) => {
    const map = mapInstanceRef.current;
    if (!map || !window.google) return;

    // Clear old markers
    listingMarkersRef.current.forEach(m => {
      if (m.setMap) m.setMap(null); else m.map = null;
    });
    listingMarkersRef.current = [];

    const iw = infoWindowRef.current;

    items.forEach(l => {
      const isAvailable = !l.is_sold;
      const color = isAvailable ? '#10b981' : '#ef4444'; // green : red

      const pin = document.createElement('div');
      pin.style.cssText = `
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: ${color};
        border: 2.5px solid #ffffff;
        box-shadow: 0 0 12px ${color}88, 0 2px 8px rgba(0,0,0,0.5);
        cursor: pointer;
      `;

      let marker;
      if (window.google.maps.marker && window.google.maps.marker.AdvancedMarkerElement) {
        try {
          marker = new window.google.maps.marker.AdvancedMarkerElement({
            position: { lat: l.lat, lng: l.lng },
            map: map,
            title: l.title,
            content: pin,
            gmpClickable: true
          });

          const onPinClick = () => {
            iw.setContent(buildInfoWindowHtml(l));
            iw.open({ map: map, anchor: marker });
          };

          marker.addEventListener('gmp-click', onPinClick);
        } catch (e) {
          // Fallback to basic Marker
          marker = new window.google.maps.Marker({
            position: { lat: l.lat, lng: l.lng },
            map: map,
            title: l.title
          });
          marker.addListener('click', () => {
            iw.setContent(buildInfoWindowHtml(l));
            iw.open(map, marker);
          });
        }
      } else {
        // Fallback basic Marker
        marker = new window.google.maps.Marker({
          position: { lat: l.lat, lng: l.lng },
          map: map,
          title: l.title
        });
        marker.addListener('click', () => {
          iw.setContent(buildInfoWindowHtml(l));
          iw.open(map, marker);
        });
      }

      listingMarkersRef.current.push(marker);
    });

    placeUserMarker(centerLat, centerLng);
  };

  const placeUserMarker = (lat, lng) => {
    const map = mapInstanceRef.current;
    if (!map || !window.google) return;

    if (userMarkerRef.current) {
      if (userMarkerRef.current.setMap) userMarkerRef.current.setMap(null);
      else userMarkerRef.current.map = null;
    }
    if (userRingMarkerRef.current) userRingMarkerRef.current.setMap(null);

    // Create a custom element with 'YOU' label + blue dot
    const userEl = document.createElement('div');
    userEl.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: default;
    `;
    const label = document.createElement('div');
    label.textContent = 'YOU';
    label.style.cssText = `
      background: #00d4ff;
      color: #06060f;
      font-size: 9px;
      font-weight: 800;
      font-family: ui-monospace, monospace;
      padding: 2px 8px;
      border-radius: 6px;
      letter-spacing: 0.08em;
      margin-bottom: 4px;
      box-shadow: 0 2px 8px rgba(0,212,255,0.4);
      white-space: nowrap;
    `;
    const dot = document.createElement('div');
    dot.style.cssText = `
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #00d4ff;
      border: 2.5px solid #ffffff;
      box-shadow: 0 0 16px rgba(0,212,255,0.5), 0 2px 8px rgba(0,0,0,0.4);
    `;
    userEl.appendChild(label);
    userEl.appendChild(dot);

    // Try AdvancedMarkerElement first
    if (window.google.maps.marker && window.google.maps.marker.AdvancedMarkerElement) {
      try {
        userMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
          position: { lat, lng },
          map: map,
          title: 'Your Location',
          content: userEl,
          zIndex: 999
        });
      } catch(e) {
        // fallback to basic Marker
        userMarkerRef.current = new window.google.maps.Marker({
          position: { lat, lng },
          map: map,
          title: 'Your Location',
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: '#00d4ff',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          },
          zIndex: 999
        });
      }
    } else {
      userMarkerRef.current = new window.google.maps.Marker({
        position: { lat, lng },
        map: map,
        title: 'Your Location',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#00d4ff',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        },
        zIndex: 999
      });
    }

    // Ring element (CSS pulse effect)
    const ringEl = document.createElement('div');
    ringEl.style.cssText = `
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(0, 212, 255, 0.08);
      border: 1.5px solid rgba(0, 212, 255, 0.35);
      animation: pulse-ring 2s infinite ease-in-out;
      pointer-events: none;
    `;

    if (window.google.maps.marker && window.google.maps.marker.AdvancedMarkerElement) {
      try {
        userRingMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
          position: { lat, lng },
          map: map,
          content: ringEl,
          zIndex: 998
        });
      } catch (e) {
        // Fallback to legacy marker if AdvancedMarker throws
        userRingMarkerRef.current = new window.google.maps.Marker({
          position: { lat, lng },
          map: map,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 22,
            fillColor: '#00d4ff',
            fillOpacity: 0.1,
            strokeColor: '#00d4ff',
            strokeWeight: 1.5,
            strokeOpacity: 0.35
          },
          zIndex: 998
        });
      }
    } else {
      userRingMarkerRef.current = new window.google.maps.Marker({
        position: { lat, lng },
        map: map,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 22,
          fillColor: '#00d4ff',
          fillOpacity: 0.1,
          strokeColor: '#00d4ff',
          strokeWeight: 1.5,
          strokeOpacity: 0.35
        },
        zIndex: 998
      });
    }
  };

  const buildInfoWindowHtml = (l) => {
    const fPrice = (val, prefix = '₹') => (val === null || val === undefined || val < 0) ? 'N/A' : `${prefix}${val}`;
    const hourly = fPrice(l.price_hourly);
    const daily = fPrice(l.price_daily);
    const monthly = fPrice(l.price_monthly);

    return `
      <div style="min-width:240px; font-family: sans-serif; padding: 6px; color: #f3f4f6;">
        <h3 style="font-weight: 700; font-size: 14px; margin-bottom: 4px; color: #ffffff;">${l.title}</h3>
        ${l.area_landmark ? `<p style="font-size: 11px; color: #00d4ff; margin-bottom: 8px;">${l.area_landmark}</p>` : ''}
        ${l.desc ? `<p style="font-size: 11px; color: #9ca3af; margin-bottom: 10px; line-height: 1.4; word-break: break-word;">${l.desc}</p>` : ''}
        
        ${l.amenities && l.amenities.length > 0 ? `
          <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px;">
            ${l.amenities.map(a => `<span style="background: rgba(0, 212, 255, 0.1); border: 1px solid rgba(0, 212, 255, 0.2); color: #00d4ff; font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">${a}</span>`).join('')}
          </div>
        ` : ''}
        
        <div style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 8px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.06);">
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 5px;">
            <span style="color: #9ca3af;">Hourly</span><span style="color: #00d4ff; font-weight: 700;">${hourly}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 5px;">
            <span style="color: #9ca3af;">Daily</span><span style="color: #10b981; font-weight: 700;">${daily}</span>
          </div>
          ${l.price_monthly ? `
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 5px;">
            <span style="color: #9ca3af;">Monthly</span><span style="color: #e879f9; font-weight: 700;">${monthly}</span>
          </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; font-size: 11px;">
            <span style="color: #9ca3af;">Size</span><span style="color: #ffffff; font-weight: 700;">${l.length}×${l.breadth}m</span>
          </div>
        </div>

        ${!l.is_sold ? `
          <div style="display: flex; gap: 8px;">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}" target="_blank" style="flex: 1; background: #00d4ff; color: #06060f; padding: 8px 0; border-radius: 8px; font-size: 11px; font-weight: 700; text-align: center; text-decoration: none; border: 1px solid #00d4ff;">Navigate</a>
            ${l.owner_phone && l.owner_phone !== 'N/A' ? `
              <a href="tel:${l.owner_phone}" style="flex: 1; border: 1px solid #00d4ff; color: #00d4ff; padding: 8px 0; border-radius: 8px; font-size: 11px; font-weight: 700; text-align: center; text-decoration: none;">Call Owner</a>
            ` : `
              <span style="flex: 1; border: 1px solid #374151; color: #9ca3af; padding: 8px 0; border-radius: 8px; font-size: 11px; font-weight: 700; text-align: center; cursor: not-allowed; opacity: 0.6;">Call: N/A</span>
            `}
          </div>
        ` : `
          <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; text-align: center; padding: 8px; border-radius: 8px; font-size: 11px; font-weight: 700;">
            Sold Out
          </div>
        `}
      </div>
    `;
  };

  const locateUser = (customMapInstance = null) => {
    const map = customMapInstance || mapInstanceRef.current;
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      setShowLocationPrompt(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const coords = { lat, lng };
        setUserLoc(coords);
        if (map) {
          map.panTo(coords);
          map.setZoom(16);
          placeUserMarker(lat, lng);
        }
        fetchListings(lat, lng, radius);
        setShowLocationPrompt(false);
      },
      (err) => {
        console.warn('Geolocation failed:', err.message);
        // Load default listing coordinates anyway
        fetchListings(userLoc.lat, userLoc.lng, radius);
        setShowLocationPrompt(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleRadiusChange = (e) => {
    const newRad = parseInt(e.target.value);
    setRadius(newRad);
    fetchListings(userLoc.lat, userLoc.lng, newRad);
  };
  const flyToLoc = (l) => {
    const map = mapInstanceRef.current;
    if (map) {
      map.panTo({ lat: l.lat, lng: l.lng });
      map.setZoom(16);
      
      // Close drawer on mobile click to show map pin
      setDrawerExpanded(false);

      // Open InfoWindow for this listing
      const iw = infoWindowRef.current;
      if (iw && window.google) {
        const idx = listings.findIndex(x => x.id === l.id);
        const marker = listingMarkersRef.current[idx];
        if (marker) {
          iw.setContent(buildInfoWindowHtml(l));
          if (marker.setMap) {
            iw.open(map, marker);
          } else {
            iw.open({ map: map, anchor: marker });
          }
        }
      }
    }
  };

  const handleSearchKeyPress = async (e) => {
    if (e.key !== 'Enter') return;
    const query = e.target.value.trim();
    if (!query) return;

    try {
      const response = await fetch('/api/utils/search-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await response.json();
      if (data.success) {
        const newCoords = { lat: data.lat, lng: data.lng };
        setUserLoc(newCoords);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.panTo(newCoords);
          mapInstanceRef.current.setZoom(15);
        }
        fetchListings(data.lat, data.lng, radius);
      } else {
        alert('Location not found.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-900 overflow-hidden relative">
      
      {/* Search Header */}
      <div className="px-4 py-3 bg-slate-950/80 backdrop-blur-lg border-b border-slate-800 flex items-center justify-between gap-3 flex-shrink-0 z-30">
        <div onClick={onBackToHome} className="hidden md:flex items-center gap-2 cursor-pointer">
          <img src="/logo.png" className="h-7 w-7 object-contain" alt="ParkoSpace" />
          <span className="font-display text-teal-400 tracking-wider text-lg uppercase">
            PARKO<span className="text-slate-400">SPACE</span>
          </span>
        </div>

        {/* Search Input Box */}
        <div className="flex-1 max-w-lg flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
              <Search className="w-4 h-4" />
            </span>
            <input
              id="map-search-input"
              type="text"
              placeholder="Search area (e.g. Mumbai, Andheri, London)..."
              onKeyPress={handleSearchKeyPress}
              className="w-full bg-slate-900 border border-slate-800 rounded-full py-2 pl-10 pr-4 text-xs md:text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-teal-500 transition"
            />
          </div>
          <button
            onClick={() => locateUser()}
            className="p-2.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-full transition cursor-pointer flex-shrink-0"
            title="Locate Current Position"
          >
            <Crosshair className="w-4 h-4" />
          </button>
        </div>

       {/* Desktop Radius Slider */}
       <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl flex-shrink-0">
         <span className="text-[10px] font-mono font-bold tracking-wider text-slate-500 uppercase">Radius</span>
         <input
           type="range"
           min="1"
           max="20"
           value={radius}
           onChange={handleRadiusChange}
           className="w-20 md:w-28 accent-teal-500 cursor-pointer h-1"
         />
         <span className="text-xs font-mono font-bold text-teal-400 w-10 text-right">{radius}km</span>
       </div>

        <div>
          <button
            onClick={onOpenAuth}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl transition cursor-pointer"
          >
            {currentUser ? 'Dashboard' : 'Owner Login'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Desktop Sidebar Listings */}
        <div className="hidden md:flex flex-col w-96 bg-slate-950 border-r border-slate-800/80 flex-shrink-0 z-20 overflow-y-auto">
          <div className="px-5 py-4 border-b border-slate-900 flex justify-between items-center bg-slate-950/50">
            <span className="text-xs font-bold text-slate-400 font-mono flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-rose-500" /> NEARBY PARKING SPACES
            </span>
            <span className="px-2.5 py-0.5 rounded bg-slate-900 text-[10px] font-bold text-slate-500 font-mono">
              {listings.length} spaces
            </span>
          </div>

          <div className="p-4 space-y-3">
            {loading && listings.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <LucideLoader className="w-6 h-6 animate-spin text-teal-500 mx-auto mb-2" />
                <span className="text-[10px] font-mono uppercase tracking-wider">SEARCHING PARKING…</span>
              </div>
            ) : listings.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
                <p className="text-xs text-slate-500">No parking spaces in {radius}km.</p>
                <span className="block text-[10px] text-slate-600 mt-1 font-mono">Try expanding search radius or searching elsewhere</span>
              </div>
            ) : (
              listings.map(l => (
                <div
                  key={l.id}
                  onClick={() => flyToLoc(l)}
                  className="bg-slate-900/50 hover:bg-slate-900 border border-slate-800/60 rounded-xl p-4 cursor-pointer hover:border-teal-500/40 transition duration-200"
                >
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <h4 className="text-xs font-bold text-slate-200 truncate flex-1">{l.title}</h4>
                    <span className="text-xs font-bold text-teal-400 font-mono flex-shrink-0">
                      {formatPriceWithUnit(l.price_hourly, '/h')}
                    </span>
                  </div>
                  {l.area_landmark && (
                    <p className="text-[10px] text-slate-500 truncate mb-2">{l.area_landmark}</p>
                  )}
                  
                  {/* Spot Description */}
                  {l.desc && (
                    <p className="text-[10px] text-slate-400 mb-2 line-clamp-2 leading-relaxed italic">
                      "{l.desc}"
                    </p>
                  )}

                  {/* Spot Amenities */}
                  {l.amenities && l.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2.5">
                      {l.amenities.map(a => (
                        <span key={a} className="bg-teal-950/40 border border-teal-850 text-teal-400 font-medium font-mono text-[8px] px-1.5 py-0.5 rounded">
                          {a}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Pricing Details */}
                  <div className="flex flex-wrap gap-2 text-[10px] font-mono mb-2.5 bg-slate-950/40 px-2 py-1.5 rounded border border-slate-850 w-fit">
                    <span>Hourly: <strong className="text-teal-400 font-bold">{formatPrice(l.price_hourly)}</strong></span>
                    <span className="text-slate-700">|</span>
                    <span>Daily: <strong className="text-emerald-400 font-bold">{formatPrice(l.price_daily)}</strong></span>
                    {l.price_monthly !== undefined && l.price_monthly !== null && (
                      <>
                        <span className="text-slate-700">|</span>
                        <span>Monthly: <strong className="text-fuchsia-400 font-bold">{formatPrice(l.price_monthly)}</strong></span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 mb-1">
                    <span>Size: {l.length}×{l.breadth}m</span>
                    {l.distance !== undefined && (
                      <span className="text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                        {l.distance} km away
                      </span>
                    )}
                  </div>
                  {!l.is_sold ? (
                    <div className="mt-3 pt-3 border-t border-slate-800/60 flex gap-2">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-1.5 bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold text-[10px] rounded-lg text-center transition flex items-center justify-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Navigation className="w-3 h-3" /> Navigate
                      </a>
                      {l.owner_phone && l.owner_phone !== 'N/A' ? (
                        <a
                          href={`tel:${l.owner_phone}`}
                          className="flex-1 py-1.5 border border-teal-500/30 hover:border-teal-400 text-teal-400 hover:bg-teal-950/20 font-bold text-[10px] rounded-lg text-center transition flex items-center justify-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone className="w-3 h-3" /> Call Owner
                        </a>
                      ) : (
                        <span
                          className="flex-1 py-1.5 border border-slate-800 text-slate-500 bg-slate-950/30 font-bold text-[10px] rounded-lg text-center cursor-not-allowed flex items-center justify-center gap-1 opacity-60"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone className="w-3 h-3" /> Call: N/A
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 pt-1.5 border-t border-slate-800/60 text-center text-[10px] font-bold text-rose-500 uppercase tracking-widest bg-rose-950/20 py-1 rounded-lg">
                      Sold Out
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Map Container */}
        <div ref={mapRef} className="flex-1 w-full h-full bg-slate-950" />

        {/* Floating Mobile Radius slider */}
        <div className="absolute bottom-6 left-4 z-20 sm:hidden flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-950/90 border border-slate-800 shadow-xl backdrop-blur-md">
          <span className="text-[9px] font-mono font-bold text-slate-500">RADIUS</span>
          <input
            type="range"
            min="1"
            max="20"
            value={radius}
            onChange={handleRadiusChange}
            className="w-20 accent-teal-500 cursor-pointer h-1"
          />
          <span className="text-xs font-mono font-bold text-teal-400 w-8 text-right">{radius}k</span>
        </div>

        {/* Mobile bottom listings drawer */}
        <div className={`fixed bottom-0 left-0 right-0 z-30 md:hidden bg-slate-950 border-t border-slate-800 flex flex-col transition-all duration-300 ${
          drawerExpanded ? 'h-[60vh]' : 'h-16'
        }`}>
          {/* Header trigger */}
          <div 
            onClick={() => setDrawerExpanded(!drawerExpanded)}
            className="h-16 px-4 flex items-center justify-between cursor-pointer border-b border-slate-900"
          >
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-rose-500" />
              <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">NEARBY PARKING SPACES</span>
            </div>
            <span className="px-2.5 py-0.5 rounded bg-slate-900 text-[10px] font-bold text-slate-500 font-mono">
              {listings.length} spaces
            </span>
            
            <button className="text-slate-400 hover:text-white p-1">
              {drawerExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
            </button>
          </div>

          {/* Drawer Body list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-20">
            {loading && listings.length === 0 ? (
              <div className="text-center py-6 text-slate-500">
                <LucideLoader className="w-5 h-5 animate-spin text-teal-500 mx-auto mb-1.5" />
                <span className="text-[9px] font-mono uppercase">Searching...</span>
              </div>
            ) : listings.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No parking spaces in radius. Expand search distance using the slider.</p>
            ) : (
              listings.map(l => (
                <div
                  key={l.id}
                  onClick={() => flyToLoc(l)}
                  className="bg-slate-900 border border-slate-800/80 rounded-xl p-3.5"
                >
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <h4 className="text-xs font-bold text-slate-200 truncate flex-1">{l.title}</h4>
                    <span className="text-xs font-bold text-teal-400 font-mono">
                      {formatPriceWithUnit(l.price_hourly, '/h')}
                    </span>
                  </div>
                  {l.area_landmark && (
                    <p className="text-[9px] text-slate-500 truncate mb-2">{l.area_landmark}</p>
                  )}

                  {/* Spot Description */}
                  {l.desc && (
                    <p className="text-[10px] text-slate-400 mb-1.5 line-clamp-2 leading-relaxed italic">
                      "{l.desc}"
                    </p>
                  )}

                  {/* Spot Amenities */}
                  {l.amenities && l.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {l.amenities.map(a => (
                        <span key={a} className="bg-teal-950/40 border border-teal-855 text-teal-400 font-medium font-mono text-[8px] px-1.5 py-0.5 rounded">
                          {a}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Pricing Details */}
                  <div className="flex flex-wrap gap-2 text-[10px] font-mono mb-2 bg-slate-950/40 px-2 py-1 rounded border border-slate-850 w-fit">
                    <span>Hourly: <strong className="text-teal-400 font-bold">{formatPrice(l.price_hourly)}</strong></span>
                    <span className="text-slate-700">|</span>
                    <span>Daily: <strong className="text-emerald-400 font-bold">{formatPrice(l.price_daily)}</strong></span>
                    {l.price_monthly !== undefined && l.price_monthly !== null && (
                      <>
                        <span className="text-slate-700">|</span>
                        <span>Monthly: <strong className="text-fuchsia-400 font-bold">{formatPrice(l.price_monthly)}</strong></span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 mb-1">
                    <span>Size: {l.length}×{l.breadth}m</span>
                    {l.distance !== undefined && (
                      <span className="text-slate-400 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">
                        {l.distance} km
                      </span>
                    )}
                  </div>
                  {!l.is_sold ? (
                    <div className="mt-3 pt-3 border-t border-slate-800/60 flex gap-2">
                      <a
                        href={l.lat && l.lng ? `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}` : l.gmap_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-1.5 bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold text-[10px] rounded-lg text-center transition flex items-center justify-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Navigation className="w-3 h-3" /> Navigate
                      </a>
                      {l.owner_phone && l.owner_phone !== 'N/A' ? (
                        <a
                          href={`tel:${l.owner_phone}`}
                          className="flex-1 py-1.5 border border-teal-500/30 hover:border-teal-400 text-teal-400 hover:bg-teal-950/20 font-bold text-[10px] rounded-lg text-center transition flex items-center justify-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone className="w-3 h-3" /> Call Owner
                        </a>
                      ) : (
                        <span
                          className="flex-1 py-1.5 border border-slate-800 text-slate-500 bg-slate-950/30 font-bold text-[10px] rounded-lg text-center cursor-not-allowed flex items-center justify-center gap-1 opacity-60"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone className="w-3 h-3" /> Call: N/A
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 pt-1.5 border-t border-slate-800/60 text-center text-[10px] font-bold text-rose-500 uppercase tracking-widest bg-rose-950/20 py-1 rounded-lg">
                      Sold Out
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Dynamic Google Maps Loader view status */}
      {loading && !mapLoaded && mapConfig?.hasGoogleMaps && (
        <div className="absolute inset-0 z-40 bg-slate-950/70 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <LucideLoader className="w-8 h-8 animate-spin text-teal-500 mx-auto mb-3" />
            <p className="text-[10px] font-mono text-teal-400 tracking-widest uppercase">LOADING GOOGLE MAPS…</p>
          </div>
        </div>
      )}

      {/* Location Permission Custom Prompt Modal */}
      {showLocationPrompt && (
        <div className="absolute inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-teal-950/50 border border-teal-500/30 rounded-full flex items-center justify-center mx-auto mb-4 text-teal-400">
              <MapPin className="w-8 h-8 text-teal-400" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Enable Location Services</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              ParkoSpace needs your location to show driveways, parking spaces, and garages nearby.
            </p>
            <div className="space-y-2.5">
              <button
                onClick={() => locateUser()}
                className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs py-3 px-4 rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Crosshair className="w-4 h-4" /> Share My Location
              </button>
              <button
                onClick={() => {
                  setShowLocationPrompt(false);
                  // Focus search input
                  const el = document.getElementById('map-search-input');
                  if (el) el.focus();
                }}
                className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white font-bold text-xs py-3 px-4 rounded-xl transition cursor-pointer"
              >
                Enter Location Manually
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No Google Maps key Warning */}
      {!loading && mapConfig && !mapConfig.hasGoogleMaps && (
        <div className="absolute inset-0 z-40 bg-slate-950 flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <div className="text-4xl mb-4">🗺️</div>
            <h3 className="text-base font-bold text-white mb-2">Google Maps Not Configured</h3>
            <p className="text-xs text-slate-500 font-mono leading-relaxed">
              Add your <span className="text-teal-400">GOOGLE_MAPS_API_KEY</span> to the <span className="text-slate-300">.env</span> file in your backend to unlock interactive map search.
            </p>
            <button
              onClick={onBackToHome}
              className="mt-6 px-4 py-2 border border-slate-800 hover:border-slate-700 bg-slate-900 text-xs font-semibold rounded-xl text-slate-300 hover:text-white transition cursor-pointer"
            >
              Go to Home Page
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
