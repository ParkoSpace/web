import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import MapScreen from './components/MapScreen';
import Dashboard from './components/Dashboard';
import AuthModal from './components/AuthModal';

export default function App() {
  const [view, setView] = useState('landing'); // 'landing' | 'map' | 'dashboard'
  const [currentUser, setCurrentUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialTab, setAuthInitialTab] = useState('login');

  // Dynamic SEO Page Title & Meta Description Modifier
  useEffect(() => {
    let title = "ParkoSpace | Rent Parking Spaces Directly From Owners";
    let metaDescription = "Rent private parking spaces directly from local property owners. Find driveways, garages, and plots near you instantly with zero booking fees.";
    
    switch (view) {
      case 'landing':
        title = "ParkoSpace | Rent Parking Spaces Directly From Owners";
        metaDescription = "Rent private parking spaces directly from local property owners. Find driveways, garages, and plots near you instantly with zero booking fees.";
        break;
      case 'map':
        title = "Find Parking Spaces Near Me | ParkoSpace Live Map";
        metaDescription = "Search the live map for cheap car parking spaces near you. Find verified driveways and contact local owners directly with zero middleman commissions.";
        break;
      case 'dashboard':
        title = "Owner Dashboard | Manage Parking Spaces | ParkoSpace";
        metaDescription = "Add a new parking space, update rental rates, choose amenities, verify coordinates, and manage bookings directly on ParkoSpace.";
        break;
      default:
        break;
    }
    
    document.title = title;
    
    // Update description meta tag dynamically
    const metaDescEl = document.querySelector('meta[name="description"]');
    if (metaDescEl) {
      metaDescEl.setAttribute('content', metaDescription);
    }
  }, [view]);

  // Check session status on mount
  useEffect(() => {
    const checkAuthSession = async () => {
      try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        if (response.ok && data.success && data.user) {
          setCurrentUser(data.user);
        }
      } catch (err) {
        console.warn('Session check failed:', err);
      }
    };
    checkAuthSession();
  }, []);

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST'
      });
      if (response.ok) {
        setCurrentUser(null);
        setView('landing');
      }
    } catch (err) {
      console.error('Logout request failed:', err);
    }
  };

  const handlePartnerClick = () => {
    if (currentUser) {
      setView('dashboard');
    } else {
      setAuthInitialTab('register'); // typical route for partners is register
      setAuthModalOpen(true);
    }
  };

  const handleOpenAuthModal = () => {
    setAuthInitialTab('login');
    setAuthModalOpen(true);
  };

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    setView('dashboard'); // go directly to dashboard upon successful login/registration
  };

  return (
    <div className="w-full h-full">
      {/* View routing */}
      {view === 'landing' && (
        <LandingPage
          currentUser={currentUser}
          onFindParking={() => setView('map')}
          onPartnerClick={handlePartnerClick}
        />
      )}

      {view === 'map' && (
        <MapScreen
          currentUser={currentUser}
          onBackToHome={() => setView('landing')}
          onOpenAuth={currentUser ? () => setView('dashboard') : handleOpenAuthModal}
        />
      )}

      {view === 'dashboard' && currentUser && (
        <Dashboard
          currentUser={currentUser}
          onLogout={handleLogout}
          onBackToMap={() => setView('map')}
          onBackToHome={() => setView('landing')}
          onUpdateUser={setCurrentUser}
        />
      )}

      {/* Global Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialTab={authInitialTab}
        onSuccess={handleAuthSuccess}
        onBackToHome={() => {
          setAuthModalOpen(false);
          setView('landing');
        }}
        onFindParking={() => {
          setAuthModalOpen(false);
          setView('map');
        }}
      />
    </div>
  );
}
