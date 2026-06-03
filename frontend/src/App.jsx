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
