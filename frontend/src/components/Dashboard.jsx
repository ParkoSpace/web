import React, { useState, useEffect } from 'react';
import { LogOut, Plus, Trash2, Edit2, Link, MapPin, CheckCircle, AlertTriangle, Loader, RefreshCw } from 'lucide-react';
import { Loader as MapsLoader } from '@googlemaps/js-api-loader';

// Helper to load Google Maps API client-side if not already loaded
const loadGoogleMapsClientSide = async () => {
  if (window.google && window.google.maps) {
    return window.google;
  }
  const res = await fetch('/api/config');
  const cfg = await res.json();
  if (!cfg.hasGoogleMaps || !cfg.googleMapsApiKey) {
    throw new Error('Google Maps is not configured on the server.');
  }
  const loader = new MapsLoader({
    apiKey: cfg.googleMapsApiKey,
    version: 'weekly',
    libraries: ['places']
  });
  return await loader.load();
};

export default function Dashboard({ currentUser, onLogout, onBackToMap, onBackToHome, onUpdateUser }) {
  const formatPrice = (price) => {
    if (price === null || price === undefined || price < 0) return 'N/A';
    return `₹${price}`;
  };

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dashboard active tab
  const [activeTab, setActiveTab] = useState('listings'); // 'listings' | 'settings'

  // Settings profile states
  const [profileName, setProfileName] = useState(currentUser?.name || '');
  const [profilePhone, setProfilePhone] = useState(currentUser?.phone || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // Sync profile details if currentUser updates
  useEffect(() => {
    if (currentUser) {
      setProfileName(currentUser.name);
      setProfilePhone(currentUser.phone);
    }
  }, [currentUser]);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!profileName.trim() || !profilePhone.trim()) {
      setProfileError('Name and Phone fields are required.');
      return;
    }
    if (profilePhone.length < 10) {
      setProfileError('Phone number must be at least 10 digits.');
      return;
    }
    setProfileLoading(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      const response = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profileName, phone: profilePhone })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setProfileSuccess('Profile settings updated successfully.');
        if (onUpdateUser) {
          onUpdateUser(data.user);
        }
      } else {
        setProfileError(data.error || 'Failed to update profile settings.');
      }
    } catch (err) {
      setProfileError('Connection error. Please try again.');
    } finally {
      setProfileLoading(false);
    }
  };

  // Form Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editListing, setEditListing] = useState(null); // null for create, listing object for edit

  // Form Fields
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [landmark, setLandmark] = useState('');
  const [length, setLength] = useState('');
  const [breadth, setBreadth] = useState('');
  const [priceHourly, setPriceHourly] = useState('50');
  const [priceDaily, setPriceDaily] = useState('300');
  const [priceMonthly, setPriceMonthly] = useState('2000');
  const [gmapLink, setGmapLink] = useState('');
  const [gmapLinkRegen, setGmapLinkRegen] = useState('');
  const [isSold, setIsSold] = useState(false);
  const [amenities, setAmenities] = useState([]);

  // Geocoding Verify Status
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState(null); // null | { success: true/false, lat, lng, address }

  const availableAmenities = ['CCTV Camera', '24/7 Access', 'Covered Parking', 'Security Guard', 'EV Charging', 'Gate Lock'];

  // Fetch listings on load
  const fetchListings = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/listings?owner_phone=${currentUser.phone}`);
      const data = await response.json();
      setListings(data);
    } catch (err) {
      setError('Failed to load listings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, [currentUser]);

  const handleOpenCreate = () => {
    setEditListing(null);
    setTitle('');
    setDesc('');
    setLandmark('');
    setLength('');
    setBreadth('');
    setPriceHourly('50');
    setPriceDaily('300');
    setPriceMonthly('2000');
    setGmapLink('');
    setGmapLinkRegen('');
    setIsSold(false);
    setAmenities([]);
    setVerifyStatus(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (l) => {
    setEditListing(l);
    setTitle(l.title);
    setDesc(l.desc);
    setLandmark(l.area_landmark || '');
    setLength(l.length.toString());
    setBreadth(l.breadth.toString());
    setPriceHourly(l.price_hourly.toString());
    setPriceDaily(l.price_daily.toString());
    setPriceMonthly(l.price_monthly.toString());
    setGmapLink(l.gmap_link || '');
    setGmapLinkRegen(l.gmap_link_regen || '');
    setIsSold(l.is_sold);
    setAmenities(l.amenities || []);
    // Initialize verify status with existing coords
    setVerifyStatus({
      success: true,
      lat: l.lat,
      lng: l.lng,
      address: l.address_text || 'Coordinates configured'
    });
    setIsFormOpen(true);
  };

  // Run location verification from Google Maps URL
  const handleVerifyLocation = async () => {
    if (!gmapLinkRegen && !landmark) {
      alert('Please paste a Google Maps verification link or fill in the Area/Landmark field.');
      return;
    }
    setVerifyLoading(true);
    setVerifyStatus(null);

    try {
      const response = await fetch('/api/utils/parse-map-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: gmapLinkRegen, landmark })
      });
      const data = await response.json();
      
      if (data.success) {
        if (data.needsFrontendGeocoding) {
          // Perform geocoding client-side to satisfy Referrer Restrictions
          try {
            const google = await loadGoogleMapsClientSide();
            const geocoder = new google.maps.Geocoder();
            
            geocoder.geocode({ address: data.addressText }, (results, status) => {
              if (status === 'OK' && results[0]) {
                const loc = results[0].geometry.location;
                const latVal = loc.lat();
                const lngVal = loc.lng();
                const formattedAddress = results[0].formatted_address;

                setVerifyStatus({
                  success: true,
                  lat: latVal,
                  lng: lngVal,
                  address: formattedAddress
                });

                // Generate expanded URL
                const label = encodeURIComponent(String(formattedAddress).split(',')[0].substring(0, 100));
                const regenUrl = `https://www.google.com/maps/place/${label}/@${latVal.toFixed(7)},${lngVal.toFixed(7)},17z/data=!3m1!4b1!4m6!3m5!1s0:0!8m2!3d${latVal.toFixed(7)}!4d${lngVal.toFixed(7)}`;
                setGmapLinkRegen(regenUrl);
              } else {
                setVerifyStatus({
                  success: false,
                  error: `Could not verify address: "${data.addressText}". Google Maps Status: ${status}`
                });
              }
            });
          } catch (err) {
            setVerifyStatus({
              success: false,
              error: `Client-side Maps error: ${err.message}`
            });
          }
        } else {
          // Coordinates found directly by backend parser
          setVerifyStatus({
            success: true,
            lat: data.lat,
            lng: data.lng,
            address: data.address
          });
          if (data.expanded_url) {
            setGmapLinkRegen(data.expanded_url);
          }
        }
      } else {
        setVerifyStatus({
          success: false,
          error: data.error || 'Failed to detect location coordinates.'
        });
      }
    } catch (e) {
      setVerifyStatus({
        success: false,
        error: 'Geocoding request timed out or server unavailable.'
      });
    } finally {
      setVerifyLoading(false);
    }
  };

  const toggleAmenity = (name) => {
    if (amenities.includes(name)) {
      setAmenities(prev => prev.filter(x => x !== name));
    } else {
      setAmenities(prev => [...prev, name]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    let lat = verifyStatus?.lat;
    let lng = verifyStatus?.lng;
    let addressText = verifyStatus?.address || landmark || 'Custom Location';

    if (!verifyStatus || !verifyStatus.success) {
      // Try geocoding landmark before giving up
      if (landmark) {
        try {
          const geoResp = await fetch('/api/utils/search-location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: landmark })
          });
          const geoData = await geoResp.json();
          if (geoData.success && geoData.lat && geoData.lng) {
            lat = geoData.lat;
            lng = geoData.lng;
            addressText = geoData.address || landmark;
            // Auto-update the verify status so the user sees confirmation
            setVerifyStatus({ success: true, lat, lng, address: addressText });
          }
        } catch (e) {
          console.warn('Landmark geocoding failed:', e);
        }
      }

      // If landmark geocoding also failed, ask for manual coords
      if (!lat || !lng) {
        const coordInput = prompt(
          "We couldn't verify the Maps link or landmark location.\n\n" +
          "Please paste your exact coordinates (lat, lng) from Google Maps.\n" +
          "Example: 12.9716, 77.5946\n\n" +
          "To get coordinates: Open Google Maps → Right-click your spot → Click the coordinates to copy them."
        );
        if (!coordInput) return;

        const parts = coordInput.split(',').map(s => parseFloat(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && 
            Math.abs(parts[0]) <= 90 && Math.abs(parts[1]) <= 180) {
          lat = parts[0];
          lng = parts[1];
          addressText = landmark || 'Manual Coordinates';
        } else {
          alert('Invalid coordinates format. Please enter as: latitude, longitude\nExample: 12.9716, 77.5946');
          return;
        }
      }
    }

    const payload = {
      title,
      desc,
      area_landmark: landmark,
      length: parseFloat(length) || 0,
      breadth: parseFloat(breadth) || 0,
      price_hourly: parseFloat(priceHourly) || 50,
      price_daily: parseFloat(priceDaily) || 300,
      price_monthly: parseFloat(priceMonthly) || 2000,
      gmap_link: gmapLink || '#',
      gmap_link_regen: gmapLinkRegen || '#',
      is_sold: isSold,
      amenities,
      lat,
      lng,
      address_text: addressText,
      owner_phone: currentUser.phone
    };

    setLoading(true);

    try {
      let response;
      if (editListing) {
        payload.id = editListing.id;
        response = await fetch('/api/listings/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        response = await fetch('/api/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const resData = await response.json();
      if (response.ok && resData.success) {
        setIsFormOpen(false);
        fetchListings();
      } else {
        alert(resData.error || 'Failed to save listing');
        setLoading(false);
      }
    } catch (err) {
      alert('Save failed due to network error.');
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this parking spot?')) return;
    setLoading(true);

    try {
      const response = await fetch('/api/listings/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, owner_phone: currentUser.phone })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        fetchListings();
      } else {
        alert(data.error || 'Delete failed.');
        setLoading(false);
      }
    } catch (e) {
      alert('Delete failed.');
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 h-full text-slate-100 flex flex-col overflow-y-auto">
      {/* Top Navigation */}
      <nav className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div onClick={onBackToHome} className="flex items-center gap-3 cursor-pointer">
          <img src="/logo.png" alt="ParkoSpace" className="h-7 w-7 object-contain" />
          <span className="font-display text-teal-400 tracking-wider text-lg">PARKOSPACE</span>
          <span className="px-2 py-0.5 rounded bg-teal-950 border border-teal-800 text-[9px] text-teal-400 font-mono font-bold uppercase tracking-wider hidden sm:inline-block">PARTNER</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onBackToMap}
            className="px-4 py-2 border border-slate-800 hover:border-slate-700 bg-slate-900/50 hover:bg-slate-900 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
          >
            Explore Map
          </button>
          <button
            onClick={onLogout}
            className="p-2 border border-red-950 hover:border-red-900 bg-red-950/20 rounded-xl text-red-400 hover:text-red-300 transition cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        
        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Welcome, {currentUser.name}</h1>
            <p className="text-xs text-slate-400 font-mono mt-1">Phone: {currentUser.phone} · Email: {currentUser.email}</p>
          </div>
          {activeTab === 'listings' && (
            <button
              onClick={handleOpenCreate}
              className="w-full sm:w-auto px-5 py-3 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-teal-900/20 hover:shadow-teal-900/30 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> List New Spot
            </button>
          )}
        </div>

        {/* Dashboard Tabs Toggle */}
        <div className="flex border-b border-slate-800 mb-8 gap-6">
          <button
            onClick={() => setActiveTab('listings')}
            className={`pb-3 text-xs md:text-sm font-bold uppercase tracking-wider font-mono transition border-b-2 ${
              activeTab === 'listings' 
                ? 'border-teal-500 text-teal-400' 
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            My Listings
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-3 text-xs md:text-sm font-bold uppercase tracking-wider font-mono transition border-b-2 ${
              activeTab === 'settings' 
                ? 'border-teal-500 text-teal-400' 
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Profile Settings
          </button>
        </div>

        {activeTab === 'listings' && (
          <>
            {error && (
              <div className="mb-6 px-4 py-3 bg-red-950/30 border border-red-500/30 text-red-400 text-xs rounded-xl flex items-center gap-2">
                <span>✕</span>
                <span>{error}</span>
              </div>
            )}

            {/* Listings Grid */}
            {loading && listings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader className="w-8 h-8 animate-spin text-teal-500 mb-4" />
                <p className="text-xs font-mono">LOADING YOUR SPACES…</p>
              </div>
            ) : listings.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl bg-slate-950/20">
                <div className="text-3xl mb-4">🅿️</div>
                <h3 className="text-sm font-semibold text-slate-300 mb-1">No Active Listings</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto mb-6">Start monetization. List your unused driveway, garage, or parking bay today.</p>
                <button
                  onClick={handleOpenCreate}
                  className="px-4 py-2 border border-teal-500/30 hover:border-teal-500 text-teal-400 hover:bg-teal-950/20 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Get Started
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {listings.map((l) => (
                  <div
                    key={l.id}
                    className="bg-slate-950/40 border border-slate-800/80 rounded-2xl overflow-hidden hover:border-slate-700 transition flex flex-col"
                  >
                    {/* Details */}
                    <div className="p-5 flex-1">
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <h3 className="text-sm font-bold text-white truncate flex-1">{l.title}</h3>
                        <span className={`px-2 py-0.5 text-[8px] font-bold font-mono tracking-wider rounded uppercase ${
                          l.is_sold 
                            ? 'bg-rose-950/40 border border-rose-800/50 text-rose-400' 
                            : 'bg-emerald-950/40 border border-emerald-800/50 text-emerald-400'
                        }`}>
                          {l.is_sold ? 'SOLD OUT' : 'AVAILABLE'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">{l.desc}</p>
                      
                      {l.area_landmark && (
                        <div className="flex items-center gap-1.5 text-[10px] text-teal-400 font-mono mb-4">
                          <MapPin className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                          <span className="truncate">{l.area_landmark}</span>
                        </div>
                      )}

                      {/* Size info */}
                      <div className="bg-slate-900 border border-slate-800/60 rounded-xl p-3.5 space-y-2 mb-4 text-[11px]">
                        <div className="flex justify-between text-slate-500">
                          <span>Size</span>
                          <strong className="text-slate-300 font-mono">{l.length} × {l.breadth} m</strong>
                        </div>
                        <div className="h-px bg-slate-800/60" />
                        <div className="flex justify-between text-slate-500">
                          <span>Hourly Price</span>
                          <strong className="text-teal-400 font-mono">{formatPrice(l.price_hourly)}</strong>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>Daily Price</span>
                          <strong className="text-emerald-400 font-mono">{formatPrice(l.price_daily)}</strong>
                        </div>
                      </div>

                      {l.amenities && l.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {l.amenities.map(a => (
                            <span key={a} className="text-[9px] font-mono bg-slate-900 border border-slate-800/80 px-2 py-0.5 rounded-lg text-slate-400">
                              {a}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Card footer actions */}
                    <div className="px-5 py-3.5 bg-slate-950/60 border-t border-slate-800/80 flex justify-between items-center gap-2">
                      <a
                        href={l.gmap_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-teal-400 hover:text-teal-350 font-mono font-bold flex items-center gap-1"
                      >
                        <Link className="w-3.5 h-3.5" /> Navigation URL
                      </a>
                      
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleOpenEdit(l)}
                          className="p-2 border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
                          title="Edit spot details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(l.id)}
                          className="p-2 border border-red-950/30 hover:border-red-900/60 bg-slate-900 text-red-400 hover:text-red-300 rounded-xl transition cursor-pointer"
                          title="Delete spot"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-xl bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-xl">
            <h2 className="text-base font-bold text-white mb-6 flex items-center gap-2">
              ⚙️ Partner Profile Settings
            </h2>

            {profileError && (
              <div className="mb-5 px-4 py-3 bg-red-950/30 border border-red-500/30 text-red-405 text-xs rounded-xl flex items-start gap-2">
                <span className="mt-0.5">✕</span>
                <span>{profileError}</span>
              </div>
            )}

            {profileSuccess && (
              <div className="mb-5 px-4 py-3 bg-teal-950/30 border border-teal-500/30 text-teal-300 text-xs rounded-xl flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
                <span>{profileSuccess}</span>
              </div>
            )}

            <form onSubmit={handleProfileSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-450 mb-2 uppercase tracking-wider">Full Name</label>
                <input
                  type="text"
                  required
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-slate-100 placeholder-slate-650 outline-none focus:border-teal-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-450 mb-2 uppercase tracking-wider">Contact Number (Phone)</label>
                <input
                  type="tel"
                  required
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-slate-100 placeholder-slate-650 outline-none focus:border-teal-500 transition"
                />
                <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                  * Note: Changing your phone number will update all your current driveway and parking listings automatically.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-450 mb-2 uppercase tracking-wider">Email Address (Read-only)</label>
                <input
                  type="email"
                  readOnly
                  disabled
                  value={currentUser.email}
                  className="w-full bg-slate-900 border border-slate-800/80 rounded-xl py-3 px-4 text-sm text-slate-500 outline-none cursor-not-allowed opacity-80"
                />
                <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                  Verified email addresses cannot be modified. Contact support if you need to transfer ownership.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={profileLoading}
                  className="px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-teal-900/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {profileLoading && <Loader className="w-4 h-4 animate-spin" />}
                  {profileLoading ? 'Saving Settings...' : 'Save Profile Settings'}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* CREATE/EDIT MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
            {/* Form Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-900/50">
              <h2 className="font-bold text-white text-base">
                {editListing ? 'Edit Parking Spot' : 'List New Parking Spot'}
              </h2>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Spot Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Spacious Secure Driveway near Bandra Station"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Description</label>
                <textarea
                  rows="2"
                  required
                  placeholder="Describe your space, access instructions, suitability for SUVs, security details, etc."
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 transition resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Area / Landmark</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Near Metro Pillar 140, Andheri East"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 transition"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Length (m)</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      placeholder="e.g. 5.0"
                      value={length}
                      onChange={(e) => setLength(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Breadth (m)</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      placeholder="e.g. 2.5"
                      value={breadth}
                      onChange={(e) => setBreadth(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Location Group (URLs and Verification Result) */}
              <div>
                {/* Location URLs (Navigation & Verification) */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Google Maps Navigation Link</label>
                    <input
                      type="text"
                      placeholder="Paste maps link here..."
                      value={gmapLink}
                      onChange={(e) => setGmapLink(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Google Maps Verification Link</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Paste verification link here..."
                        value={gmapLinkRegen}
                        onChange={(e) => setGmapLinkRegen(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-500 transition"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyLocation}
                        disabled={verifyLoading}
                        className="px-4 bg-slate-950 border border-slate-800 hover:border-slate-700 text-teal-400 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer flex-shrink-0"
                      >
                        {verifyLoading ? (
                          <Loader className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        Verify
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1.5 font-medium italic">
                      * Note: Don't worry if the URL changes after clicking verify.
                    </p>
                  </div>
                </div>

                {/* Geocoding results view */}
                {verifyStatus && (
                  <div className={`mt-3 p-3.5 rounded-xl border text-[11px] leading-relaxed flex gap-2.5 items-start ${
                    verifyStatus.success 
                      ? 'bg-emerald-950/20 border-emerald-800/50 text-emerald-400' 
                      : 'bg-red-950/20 border-red-900/50 text-red-400'
                  }`}>
                    {verifyStatus.success ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <strong className="block text-xs text-emerald-300 mb-0.5">Location Verified</strong>
                          <span>{verifyStatus.address}</span>
                          <span className="block font-mono text-[9px] text-slate-500 mt-1">{verifyStatus.lat.toFixed(6)}, {verifyStatus.lng.toFixed(6)}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <strong className="block text-xs text-red-300 mb-0.5">Verification Failed</strong>
                          <span>{verifyStatus.error}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Pricing Cards */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1 uppercase tracking-wider">Hourly (₹)</label>
                  <input
                    type="number"
                    required
                    value={priceHourly}
                    onChange={(e) => setPriceHourly(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-100 outline-none focus:border-teal-500 transition font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1 uppercase tracking-wider">Daily (₹)</label>
                  <input
                    type="number"
                    required
                    value={priceDaily}
                    onChange={(e) => setPriceDaily(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-100 outline-none focus:border-teal-500 transition font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1 uppercase tracking-wider">Monthly (₹)</label>
                  <input
                    type="number"
                    required
                    value={priceMonthly}
                    onChange={(e) => setPriceMonthly(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-100 outline-none focus:border-teal-500 transition font-mono"
                  />
                </div>
              </div>

              {/* Amenities */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Amenities</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {availableAmenities.map(name => {
                    const active = amenities.includes(name);
                    return (
                      <button
                        type="button"
                        key={name}
                        onClick={() => toggleAmenity(name)}
                        className={`py-2 px-3 rounded-xl border text-[11px] font-semibold transition cursor-pointer text-left ${
                          active 
                            ? 'bg-teal-950/30 border-teal-500/40 text-teal-400' 
                            : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Availability Status */}
              <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Mark as Sold Out</label>
                  <p className="text-[10px] text-slate-500 mt-0.5">Toggle this if the spot is temporarily occupied or unavailable.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSold}
                    onChange={(e) => setIsSold(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600 peer-checked:after:bg-white peer-checked:after:border-white" />
                </label>
              </div>

              {/* Form Footer Actions */}
              <div className="flex gap-3 pt-4 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 py-3 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white font-medium text-xs rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-[2] py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-teal-900/20 hover:shadow-teal-900/30 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {editListing ? 'Save Changes' : 'Publish Spot'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple Helper to close modal on background click
function X({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
    </svg>
  );
}
