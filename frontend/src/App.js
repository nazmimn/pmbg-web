import React, { useState, useEffect, useRef } from 'react';
import { 
  Home,
  ShoppingBag, 
  Search, 
  Camera, 
  Facebook, 
  Gavel, 
  Heart, 
  Plus, 
  User, 
  Menu, 
  X, 
  ArrowRightLeft, 
  Clock, 
  TrendingUp, 
  LogOut,
  Image as ImageIcon,
  Loader2,
  Repeat,
  Sparkles,
  Wand2,
  Database,
  Globe,
  Pencil,
  Trash2,
  Filter,
  CheckCircle,
  AlertCircle,
  Save,
  DollarSign,
  CheckSquare,
  Square,
  MoreHorizontal,
  RefreshCw,
  XCircle,
  Upload,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ListPlus,
  LayoutGrid,
  List as ListIcon,
  MessageCircle
} from 'lucide-react';
import axios from 'axios';

// --- Configuration ---
const API_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";
const api = axios.create({
    baseURL: API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`,
    withCredentials: true // Important for cookies
});

// --- Image Resizing Helper ---
const resizeImage = (file, maxWidth = 500, maxHeight = 500) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        // Compress to JPEG at 0.6 quality
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
    };
  });
};

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('home'); 
  const [listings, setListings] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [notification, setNotification] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [authProcessing, setAuthProcessing] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedList, setSelectedList] = useState([]);

  const handleSelectGame = (game, list) => {
      setSelectedGame(game);
      setSelectedList(list || listings);
  };

  const handleNextGame = () => {
      if (!selectedGame || selectedList.length === 0) return;
      const idx = selectedList.findIndex(g => g.id === selectedGame.id);
      if (idx === -1) return;
      const nextIdx = (idx + 1) % selectedList.length;
      setSelectedGame(selectedList[nextIdx]);
  };

  const handlePrevGame = () => {
      if (!selectedGame || selectedList.length === 0) return;
      const idx = selectedList.findIndex(g => g.id === selectedGame.id);
      if (idx === -1) return;
      const prevIdx = (idx - 1 + selectedList.length) % selectedList.length;
      setSelectedGame(selectedList[prevIdx]);
  };

  // --- Comment Handlers ---
  const handleAddComment = async (gameId, text) => {
      try {
          const res = await api.post(`/listings/${gameId}/comments`, { text });
          const newComment = res.data;
          
          setListings(prev => prev.map(l => {
              if (l.id === gameId) {
                  return { ...l, comments: [...(l.comments || []), newComment] };
              }
              return l;
          }));
          
          if (selectedGame && selectedGame.id === gameId) {
              setSelectedGame(prev => ({ ...prev, comments: [...(prev.comments || []), newComment] }));
          }
      } catch (e) {
          console.error(e);
          showNotification("Failed to post comment", "error");
      }
  };

  const handleDeleteComment = async (gameId, commentId) => {
      try {
          await api.delete(`/listings/${gameId}/comments/${commentId}`);
          
          setListings(prev => prev.map(l => {
              if (l.id === gameId) {
                  return { ...l, comments: (l.comments || []).filter(c => c.id !== commentId) };
              }
              return l;
          }));
          
          if (selectedGame && selectedGame.id === gameId) {
              setSelectedGame(prev => ({ ...prev, comments: prev.comments.filter(c => c.id !== commentId) }));
          }
      } catch (e) {
          console.error(e);
          showNotification("Failed to delete comment", "error");
      }
  };

  // Auth Initialization
  useEffect(() => {
    const initAuth = async () => {
        // 1. Check for Emergent Callback
        if (window.location.hash && window.location.hash.includes('session_id=')) {
            setAuthProcessing(true);
            const sessionId = window.location.hash.split('session_id=')[1].split('&')[0];
            // Clear hash
            window.history.replaceState(null, '', window.location.pathname);
            
            try {
                const res = await api.post('/auth/exchange-session', { session_id: sessionId });
                const userData = res.data.user;
                setUser(userData);
                localStorage.setItem('pm_user', JSON.stringify(userData)); // Optional sync
                setView('dashboard');
                showNotification("Signed in successfully!");
            } catch (e) {
                console.error("Session exchange failed", e);
                showNotification("Failed to complete login", "error");
                setView('auth');
            } finally {
                setAuthProcessing(false);
                setLoading(false);
            }
            return;
        }

        // 2. Check Session Cookie (Server-side verification)
        try {
            const res = await api.get('/auth/me');
            setUser(res.data);
            localStorage.setItem('pm_user', JSON.stringify(res.data));
        } catch (e) {
            // Not authenticated, that's fine
            setUser(null);
            localStorage.removeItem('pm_user');
        } finally {
            setLoading(false);
        }
    };
    
    initAuth();
  }, []);

  // Fetch Public Listings (Polling for simple "real-time")
  useEffect(() => {
    const fetchListings = async () => {
        try {
            const res = await api.get('/listings');
            setListings(res.data);
        } catch (e) {
            console.error("Fetch error", e);
        }
    };
    
    fetchListings();
    const interval = setInterval(fetchListings, 10000); // 10s polling
    return () => clearInterval(interval);
  }, []);

  // Fetch My Listings
  useEffect(() => {
    if (!user) {
        setMyListings([]);
        return;
    }
    const fetchMyListings = async () => {
        try {
            const res = await api.get(`/listings?sellerId=${user.id}`);
            setMyListings(res.data);
        } catch (e) {
            console.error("My Listings Fetch error", e);
        }
    };
    fetchMyListings();
    // Re-fetch on view change or interval if needed
  }, [user, view, showAddModal]); 


  const handleLoginSuccess = (userData) => {
      setUser(userData);
      localStorage.setItem('pm_user', JSON.stringify(userData));
      setView('dashboard');
      showNotification(`Welcome, ${userData.displayName}!`);
  };


  // --- Logout Logic with Confirm ---
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const handleLogoutClick = () => {
      setLogoutConfirmOpen(true);
  };

  const confirmLogout = async () => {
    try {
        await api.post('/auth/logout');
    } catch(e) { console.error(e); }
    
    localStorage.removeItem('pm_user');
    setUser(null);
    setView('home');
    setLogoutConfirmOpen(false);
    showNotification("Logged out successfully");
  };

  // Seed data function removed

  const handleSaveListing = async (dataOrArray) => {
    if (!user) return;
    try {
      const itemsToSave = Array.isArray(dataOrArray) ? dataOrArray : [dataOrArray];
      
      const preparedItems = itemsToSave.map(item => ({
          ...item,
          image: (item.images && item.images.length > 0) ? item.images[0] : (item.image || ''),
          sellerId: user.id,
          price: (item.price === '' || item.price === null || item.price === undefined) ? null : Number(item.price),
          condition: Number(item.condition),
      }));

      if (editingItem && itemsToSave.length === 1) {
          // Update
          await api.put(`/listings/${editingItem.id}`, preparedItems[0]);
      } else {
          // Create
          await api.post('/listings', preparedItems);
      }
      
      showNotification(itemsToSave.length > 1 ? `${itemsToSave.length} listings saved!` : "Listing saved!");
      setShowAddModal(false);
      setEditingItem(null);
      // Refresh
      const res = await api.get('/listings');
      setListings(res.data);
    } catch (err) {
      console.error(err);
      showNotification("Failed to save", "error");
    }
  };

  const handleDeleteListing = async (item) => {
    if (!user) return;
    try {
      await api.delete(`/listings/${item.id}`);
      showNotification("Listing deleted.");
      // Optimistic update
      setMyListings(prev => prev.filter(i => i.id !== item.id));
      setListings(prev => prev.filter(i => i.id !== item.id));
    } catch (err) {
      console.error("Delete error", err);
      showNotification("Failed to delete listing", "error");
    }
  };

  const handleMarkSold = async (item) => {
    if (!user) return;
    try {
      const newStatus = item.status === 'sold' ? 'active' : 'sold';
      await api.put(`/listings/${item.id}`, { status: newStatus });
      showNotification(newStatus === 'sold' ? "Marked as Sold" : "Listing Reactivated");
      // Refresh logic will pick it up, or optimistic
      setMyListings(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i));
    } catch (err) {
      console.error("Status update error", err);
      showNotification("Failed to update status", "error");
    }
  };

  const handleOpenTrade = async (item) => {
    if (!user) return;
    try {
      await api.put(`/listings/${item.id}`, { openForTrade: true });
      showNotification("Marked as Open for Trade");
      setMyListings(prev => prev.map(i => i.id === item.id ? { ...i, openForTrade: true } : i));
    } catch (err) {
      console.error(err);
      showNotification("Failed to update", "error");
    }
  };

  const handleEditClick = (item) => {
    setEditingItem(item);
    setShowAddModal(true);
  };

  const handleProfileUpdate = async (profileData) => {
    try {
      const res = await api.put('/auth/profile', profileData);
      setUser(res.data);
      localStorage.setItem('pm_user', JSON.stringify(res.data));
      showNotification("Profile updated successfully!");
    } catch (err) {
      console.error("Profile update error", err);
      showNotification("Failed to update profile", "error");
    }
  };

  const placeBid = async (listingId, currentBid, increment = 5) => {
    if (!user) {
        showNotification("Please login to bid", "error");
        setView('auth');
        return;
    }
    const newBid = (currentBid || 0) + increment;
    try {
      await api.post(`/listings/${listingId}/bid`, {
          bidAmount: newBid,
          userId: user.id
      });
      showNotification(`Bid placed: RM ${newBid}`);
      // Refresh
      const res = await api.get('/listings');
      setListings(res.data);
    } catch (err) {
      console.error(err);
      showNotification("Failed to bid: " + (err.response?.data?.detail || "Error"), "error");
    }
  };

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const renderView = () => {
    switch(view) {
      case 'home': return <HomeView listings={listings} setView={setView} onSelectGame={handleSelectGame} />;
      case 'explore': return <ExploreView listings={listings} onSelectGame={handleSelectGame} />;
      case 'auctions': return <AuctionsView listings={listings} onBid={placeBid} />;
      case 'dashboard': 
        if (!user) {
          return <AuthView onLogin={handleLoginSuccess} onCancel={() => setView('home')} />;
        }
        return <DashboardView 
                  user={user}
                  myListings={myListings} 
                  onAdd={() => { setEditingItem(null); setShowAddModal(true); }} 
                  onDelete={handleDeleteListing}
                  onEdit={handleEditClick}
                  onMarkSold={handleMarkSold}
                  onOpenTrade={handleOpenTrade}
                  onProfileUpdate={handleProfileUpdate}
                />;
      case 'auth': return <AuthView onLogin={handleLoginSuccess} onCancel={() => setView('home')} />;
      default: return <HomeView listings={listings} setView={setView} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24 md:pb-0">
      <nav className="sticky top-0 z-40 bg-white border-b border-orange-100 shadow-sm transition-all duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Left: Navigation (Desktop) */}
            <div className="flex-1 flex justify-start">
                <div className="hidden md:flex items-center space-x-6">
                  <NavItem active={view === 'home'} onClick={() => setView('home')}>Home</NavItem>
                  <NavItem active={view === 'explore'} onClick={() => setView('explore')}>Buy, Sell & Trade</NavItem>
                  <NavItem active={view === 'auctions'} onClick={() => setView('auctions')}>
                    <span className="flex items-center text-orange-600 font-bold"><Gavel className="w-4 h-4 mr-1"/> Lelong (Soon)</span>
                  </NavItem>
                </div>
            </div>

            {/* Center: Logo & Title */}
            <div className="flex flex-col items-center justify-center cursor-pointer" onClick={() => setView('home')}>
              <img 
                src="https://customer-assets.emergentagent.com/job_boardgame-bazaar-1/artifacts/bzq9jenz_pmbg-logo.png" 
                alt="Pasar Malam Boardgame" 
                className="h-6 sm:h-8 w-auto object-contain mb-1 transition-all"
              />
              <span className="font-extrabold text-orange-600 text-[10px] sm:text-base tracking-widest uppercase mt-0 sm:mt-1 leading-none sm:leading-normal">Pasar Malam Boardgame</span>
            </div>

            {/* Right: User Actions */}
            <div className="flex-1 flex justify-end items-center space-x-4">
              {/* Desktop User Info */}
              {user ? (
                <>
                  <button 
                    onClick={() => setView('dashboard')}
                    className="hidden md:flex items-center space-x-2 px-4 py-2 bg-orange-50 rounded-full text-orange-600 hover:bg-orange-100 transition-colors"
                  >
                    <User className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {user.displayName.split(' ')[0]}
                    </span>
                  </button>
                  <button 
                    onClick={handleLogoutClick}
                    className="hidden md:block p-2 text-slate-400 hover:text-red-500 transition-colors"
                    title="Logout"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => setView('auth')}
                  className="hidden md:block px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-full shadow-lg shadow-orange-200 transition-all text-sm"
                >
                  Join / Login
                </button>
              )}
              
              {/* Mobile Profile Icon (Top Right) - Optional or simplified */}
              {user && (
                  <div className="md:hidden w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold text-xs cursor-pointer" onClick={() => setView('dashboard')}>
                      {user.picture ? <img src={user.picture} className="w-full h-full rounded-full object-cover" /> : user.displayName.charAt(0)}
                  </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {authProcessing ? (
           <div className="flex flex-col items-center justify-center h-64">
             <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
             <p className="text-slate-500 animate-pulse">Completing secure sign-in...</p>
           </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          </div>
        ) : (
          renderView()
        )}
      </main>

      {notification && (
        <div className={`fixed top-20 md:top-auto md:bottom-4 left-4 right-4 md:left-auto md:right-4 z-[60] px-6 py-3 rounded-lg shadow-lg text-white text-center md:text-left transform transition-all duration-500 ${notification.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {notification.msg}
        </div>
      )}

      {showAddModal && (
        <AddGameModal 
          onClose={() => { setShowAddModal(false); setEditingItem(null); }} 
          onAdd={handleSaveListing} 
          initialData={editingItem}
        />
      )}

      {selectedGame && (
        <GameDetailsModal 
            game={selectedGame} 
            user={user} 
            onClose={() => setSelectedGame(null)} 
            onLoginRequest={() => { setSelectedGame(null); setView('auth'); }}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
            onNext={handleNextGame}
            onPrev={handlePrevGame}
        />
      )}

      <ConfirmModal 
        isOpen={logoutConfirmOpen}
        title="Confirm Logout"
        message="Are you sure you want to sign out?"
        onConfirm={confirmLogout}
        onCancel={() => setLogoutConfirmOpen(false)}
        confirmText="Yes"
        cancelText="I'll Stay"
      />
      
      <MobileBottomNav view={view} setView={setView} user={user} />
    </div>
  )
}

// --- Components ---

function NavItem({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active 
          ? 'bg-orange-50 text-orange-700' 
          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, isProcessing, confirmText = "Delete", cancelText = "Cancel" }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">{title}</h3>
                    <p className="text-slate-500 mb-6">{message}</p>
                    <div className="flex space-x-3">
                        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">
                            {cancelText}
                        </button>
                        <button onClick={onConfirm} disabled={isProcessing} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors flex justify-center items-center">
                            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function AuthView({ onLogin, onCancel }) {
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '', displayName: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = () => {
    const redirectUrl = window.location.origin; 
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
        let user;
        if (isRegister) {
            const res = await api.post('/auth/register-email', formData);
            user = res.data.user;
        } else {
            const res = await api.post('/auth/login-email', { email: formData.email, password: formData.password });
            user = res.data.user;
        }
        onLogin(user); 
    } catch (err) {
        console.error(err);
        setError(err.response?.data?.detail || "Authentication failed");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
        <div className="p-8 text-center bg-slate-900 text-white">
             <h2 className="text-2xl font-bold mb-1">{isRegister ? "Join the Community" : "Welcome Back"}</h2>
             <p className="text-slate-400 text-sm">{isRegister ? "Create an account to start trading" : "Sign in to manage your collection"}</p>
        </div>
        
        <div className="p-8 space-y-6">
           <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center py-2.5 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium text-slate-700 bg-white">
             <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5 mr-3" alt="G" />
             Sign in with Google
           </button>
           <button onClick={() => window.location.href = `${API_URL}/auth/facebook/login`} className="w-full flex items-center justify-center py-2.5 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium text-slate-700 bg-white mt-3">
             <Facebook className="w-5 h-5 mr-3 text-blue-600" />
             Sign in with Facebook
           </button>
           
           <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-500">Or continue with email</span></div>
           </div>
           
           <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                 <div>
                   <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Display Name</label>
                   <input type="text" required className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" placeholder="MeepleKing" value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} />
                 </div>
              )}
              <div>
                 <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Email</label>
                 <input type="email" required className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" placeholder="you@example.com" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
              <div>
                 <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Password</label>
                 <input type="password" required className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" placeholder="••••••••" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
              </div>
              
              {error && <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">{error}</div>}
              
              <button type="submit" disabled={loading} className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg shadow-lg shadow-orange-200 transition-all flex justify-center items-center">
                 {loading ? <Loader2 className="animate-spin w-5 h-5" /> : (isRegister ? "Create Account" : "Sign In")}
              </button>
           </form>
           
           <div className="text-center text-sm">
              <button onClick={() => setIsRegister(!isRegister)} className="text-slate-500 hover:text-orange-600 font-medium">
                 {isRegister ? "Already have an account? Sign In" : "Don't have an account? Join Now"}
              </button>
           </div>
           
           <div className="text-center text-xs text-slate-400 mt-4">
             <button onClick={onCancel}>Cancel and browse as guest</button>
           </div>
        </div>
      </div>
    </div>
  )
}

function HomeView({ listings, setView, onSelectGame }) {
  const auctions = listings.filter(l => l.type === 'WTL');
  const forSale = listings.filter(l => l.type === 'WTS' && l.status !== 'sold');
  const latestWTS = forSale.length > 0 ? forSale[0] : null;

  return (
    <div className="space-y-12">
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full transform translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-black opacity-5 rounded-full transform -translate-x-1/4 translate-y-1/4"></div>
        <div className="relative px-8 py-16 md:py-20 md:px-12 flex flex-col md:flex-row items-center justify-between">
          <div className="md:w-1/2 space-y-6">
            <h2 className="text-4xl md:text-5xl font-extrabold leading-tight">Sell your boardgames,<br/><span className="text-orange-100">Pasar Malam style.</span></h2>
            <p className="text-orange-50 text-lg md:text-xl max-w-lg">The easiest way for Malaysian boardgamers to Buy, Sell, Trade and Lelong.</p>
            <div className="flex flex-wrap gap-4 pt-4">
              <button onClick={() => setView('explore')} className="px-6 py-3 bg-white text-orange-600 font-bold rounded-xl shadow-lg">Browse Market</button>
              <button onClick={() => setView('auctions')} className="px-6 py-3 bg-orange-700 bg-opacity-30 border-2 border-orange-200 border-opacity-30 text-white font-bold rounded-xl flex items-center"><Gavel className="w-5 h-5 mr-2" /> Lelong (Coming Soon)</button>
            </div>
          </div>
          <div className="hidden md:block md:w-1/2 relative h-full min-h-[300px]">
             {latestWTS ? (
                 <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-80 bg-white rotate-6 rounded-lg shadow-2xl flex flex-col p-4 transition-transform hover:rotate-3 cursor-pointer" onClick={() => setView('explore')}>
                    <div className="h-48 bg-slate-200 rounded mb-4 overflow-hidden relative">
                      {latestWTS.image ? <img src={latestWTS.image} className="w-full h-full object-cover" alt={latestWTS.title} /> : <div className="w-full h-full flex items-center justify-center bg-slate-100"><ImageIcon className="text-slate-300 w-12 h-12"/></div>}
                      <div className="absolute top-2 right-2 bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded shadow">NEW</div>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg line-clamp-2 mb-1">{latestWTS.title}</h3>
                    <p className="text-xs text-slate-500 mb-4 line-clamp-2">{latestWTS.description || "No description"}</p>
                    <div className="mt-auto flex justify-between items-center border-t border-slate-100 pt-3">
                       <span className="text-orange-600 font-extrabold text-2xl">RM {latestWTS.price}</span>
                       <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600"><ArrowRightLeft className="w-4 h-4"/></div>
                    </div>
                 </div>
             ) : (
                 <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-80 bg-white rotate-6 rounded-lg shadow-2xl flex flex-col p-4 flex items-center justify-center text-center text-slate-400">
                    <ShoppingBag className="w-16 h-16 mb-4 opacity-50" />
                    <p>No games listed yet.</p>
                 </div>
             )}
          </div>
        </div>
      </div>

      {listings.length === 0 && (
         <div className="text-center py-12 bg-white rounded-xl border border-dashed border-orange-200">
            <h3 className="text-xl font-bold text-slate-800 mb-2">The Market is Quiet</h3>
            <p className="text-slate-500 mb-6">Be the first to set up a stall!</p>
         </div>
      )}

      {auctions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-slate-800 flex items-center"><Gavel className="w-6 h-6 mr-2 text-orange-500" /> Live Lelong</h3>
            <button onClick={() => setView('auctions')} className="text-orange-600 font-medium hover:underline">View all</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {auctions.slice(0, 4).map(game => <AuctionCard key={game.id} game={game} />)}
          </div>
        </section>
      )}

      {forSale.length > 0 && (
        <section>
           <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-slate-800">Fresh from the Market</h3>
              <button onClick={() => setView('explore')} className="text-orange-600 font-medium hover:underline">View all</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {forSale.slice(0, 8).map(game => <ListingCard key={game.id} game={game} onClick={() => onSelectGame(game, forSale)} />)}
            </div>
        </section>
      )}
    </div>
  )
}

function ExploreView({ listings, onSelectGame }) {
  const [filter, setFilter] = useState('ALL'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [showSold, setShowSold] = useState(false); // Default hidden

  const filtered = listings.filter(l => {
      // Show Sold logic (inverse of previous hide)
      if (!showSold && l.status === 'sold') return false;

      // WTT logic: Show items that are explicitly WTT OR (WTS and openForTrade)
      if (filter === 'WTT') {
          return (l.type === 'WTT' || (l.type === 'WTS' && l.openForTrade)) && l.type !== 'WTL';
      }
      
      const typeMatch = filter === 'ALL' ? l.type !== 'WTL' : l.type === filter;
      const searchMatch = l.title.toLowerCase().includes(searchTerm.toLowerCase());
      return typeMatch && searchMatch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Marketplace</h2>
          <p className="text-slate-500">Find your next favorite game or convert your shelf of shame to cash.</p>
        </div>
      </div>

      <div className="sticky top-20 z-30 bg-slate-50/95 backdrop-blur-sm py-4 -mx-4 px-4 border-b border-slate-200">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
                <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Search boardgames by title..." 
                    className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl text-base focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 shadow-sm"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {['ALL', 'WTS', 'WTB', 'WTT'].map(f => (
                    <button key={f} onClick={() => setFilter(f)} className={`px-5 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap shadow-sm ${filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>
                        {f === 'ALL' ? 'All' : f}
                    </button>
                ))}
                <button 
                    onClick={() => setShowSold(!showSold)} 
                    className={`flex items-center px-5 py-3 rounded-xl text-sm font-bold transition-all shadow-sm ${showSold ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
                >
                    {showSold ? <CheckCircle className="w-4 h-4 mr-2"/> : <XCircle className="w-4 h-4 mr-2"/>}
                    Sold
                </button>
            </div>
          </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filtered.map(game => <ListingCard key={game.id} game={game} onClick={() => onSelectGame(game, filtered)} />)}
        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No listings found.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function AuctionsView({ listings, onBid }) {
  // const auctions = listings.filter(l => l.type === 'WTL');
  return (
    <div className="space-y-6">
      <div className="bg-orange-900 text-orange-50 p-6 rounded-xl flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center"><Gavel className="mr-2" /> Lelong (Coming Soon)</h2>
          <p className="text-orange-200 opacity-80">Live bidding wars are currently unavailable.</p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-dashed border-orange-200">
         <Gavel className="w-16 h-16 text-orange-200 mb-4" />
         <h3 className="text-xl font-bold text-slate-700">Auction House Closed</h3>
         <p className="text-slate-500">The Lelong feature is currently under construction. Check back later!</p>
      </div>
    </div>
  )
}

function DashboardView({ user, myListings, onAdd, onDelete, onEdit, onMarkSold, onOpenTrade, onProfileUpdate }) {
  const [filter, setFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState('list'); // list | grid
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // Confirm Modal State
  const [confirmState, setConfirmState] = useState({ open: false, type: 'single', item: null });

  const counts = {
    ALL: myListings.length,
    WTS: myListings.filter(l => l.type === 'WTS').length,
    WTB: myListings.filter(l => l.type === 'WTB').length,
    WTT: myListings.filter(l => l.type === 'WTT' || (l.type === 'WTS' && l.openForTrade)).length, // Updated Logic
    WTL: myListings.filter(l => l.type === 'WTL').length,
  };

  const filteredListings = myListings.filter(item => {
    let matchesFilter = false;
    if (filter === 'ALL') matchesFilter = true;
    else if (filter === 'WTT') matchesFilter = item.type === 'WTT' || (item.type === 'WTS' && item.openForTrade);
    else matchesFilter = item.type === filter;

    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const toggleSelect = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredListings.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredListings.map(i => i.id)));
  };

  const initiateDelete = (item) => {
      setConfirmState({ open: true, type: 'single', item });
  };

  const initiateBulkDelete = () => {
      if (selectedIds.size === 0) return;
      setConfirmState({ open: true, type: 'bulk', item: null });
  };

  const handleConfirmDelete = async () => {
    setIsProcessing(true);
    try {
        if (confirmState.type === 'single' && confirmState.item) {
            await onDelete(confirmState.item);
        } else if (confirmState.type === 'bulk') {
            for (const id of selectedIds) {
                const item = myListings.find(i => i.id === id);
                if (item) await onDelete(item);
            }
            setSelectedIds(new Set());
        }
    } catch(e) { console.error(e); }
    finally {
        setIsProcessing(false);
        setConfirmState({ open: false, type: 'single', item: null });
    }
  };

  const handleBulkMarkSold = async () => {
    setIsProcessing(true);
    for (const id of selectedIds) {
      const item = myListings.find(i => i.id === id);
      if (item) await onMarkSold(item);
    }
    setSelectedIds(new Set());
    setIsProcessing(false);
  };

  const handleBulkOpenTrade = async () => {
    setIsProcessing(true);
    for (const id of selectedIds) {
      const item = myListings.find(i => i.id === id);
      if (item && item.type === 'WTS') await onOpenTrade(item);
    }
    setSelectedIds(new Set());
    setIsProcessing(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {showProfileModal && <EditProfileModal user={user} onClose={() => setShowProfileModal(false)} onUpdate={onProfileUpdate} />}
      <ConfirmModal 
        isOpen={confirmState.open}
        title="Delete Listing?"
        message={confirmState.type === 'single' ? `Are you sure you want to delete "${confirmState.item?.title}"? This cannot be undone.` : `Are you sure you want to delete ${selectedIds.size} listings? This cannot be undone.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmState({ open: false, type: 'single', item: null })}
        isProcessing={isProcessing}
      />

      {/* Sidebar */}
      <div className="lg:col-span-1 space-y-4 lg:space-y-6 flex flex-col sm:flex-row lg:flex-col gap-4 lg:sticky lg:top-24 lg:h-fit">
        <div className="flex-1 bg-white p-5 rounded-2xl shadow-sm border border-slate-100 text-center flex flex-row sm:flex-col items-center gap-5 sm:gap-2 sm:h-full justify-center">
           <div className="w-16 h-16 sm:w-24 sm:h-24 bg-slate-100 rounded-full flex-shrink-0 overflow-hidden relative border-4 border-white shadow-sm ring-1 ring-slate-100">
             {user.picture || user.image ? (
                 <img src={user.picture || user.image} alt="Avatar" className="w-full h-full object-cover" />
             ) : (
                 <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}`} alt="Avatar" className="w-full h-full" />
             )}
           </div>
           <div className="text-left sm:text-center flex-1 min-w-0">
               <h3 className="font-bold text-xl text-slate-800 truncate">{user.displayName}</h3>
               <p className="text-sm text-slate-500 mb-3 truncate">{user.email}</p>
               <div className="flex flex-wrap gap-2 justify-start sm:justify-center mb-3">
                   {user.phone && <span className="text-[10px] bg-green-50 px-2 py-1 rounded-full text-green-700 font-bold border border-green-100 flex items-center"><MessageCircle className="w-3 h-3 mr-1"/> {user.phone}</span>}
                   {user.facebookLink && <span className="text-[10px] bg-blue-50 px-2 py-1 rounded-full text-blue-700 font-bold border border-blue-100 flex items-center"><Facebook className="w-3 h-3 mr-1"/> Facebook</span>}
               </div>
               <button onClick={() => setShowProfileModal(true)} className="w-full sm:w-auto px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-lg text-xs transition-colors border border-slate-200">
                   Edit Profile
               </button>
           </div>
        </div>
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col sm:h-full">
          <div className="p-4 bg-slate-50/50 border-b border-slate-100 font-bold text-slate-800 text-sm tracking-wide">Collection Stats</div>
          <div className="p-4 sm:p-5 space-y-3 sm:space-y-4 flex-1 flex flex-col justify-center">
             <div className="flex justify-between items-center"><span className="text-slate-500 text-sm font-medium">Active Listings</span><span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{myListings.filter(l=>l.type==='WTS' && l.status!=='sold').length}</span></div>
             <div className="flex justify-between items-center"><span className="text-slate-500 text-sm font-medium">Wishlist</span><span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-xs">{myListings.filter(l=>l.type==='WTB').length}</span></div>
             <div className="flex justify-between items-center"><span className="text-slate-500 text-sm font-medium">Sold Items</span><span className="font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs">{myListings.filter(l=>l.status==='sold').length}</span></div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-3 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-2xl font-bold text-slate-800">My Listings</h2>
          <div className="flex gap-2">
            <button onClick={onAdd} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium flex items-center shadow-lg transition-all">
              <Plus className="w-5 h-5 mr-2" /> Add Boardgame
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
           <div className="w-full sm:w-auto overflow-hidden">
             <div className="flex space-x-2 overflow-x-auto overflow-y-hidden pb-2 sm:pb-0 snap-x px-1 py-1 scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
              {['ALL', 'WTS', 'WTB', 'WTT'].map(type => (
                <button key={type} onClick={() => setFilter(type)} className={`snap-start flex-shrink-0 px-5 py-2.5 rounded-full text-xs font-bold transition-all shadow-sm ${filter === type ? 'bg-slate-800 text-white shadow-md scale-105' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300'}`}>
                  {type === 'ALL' ? 'All' : type} <span className="opacity-70 ml-1">({counts[type]})</span>
                </button>
              ))}
              <button disabled className="snap-start flex-shrink-0 px-5 py-2.5 rounded-full text-xs font-bold bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed">
                  WTL
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                 <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                 <input 
                   type="text" 
                   placeholder="Search boardgames..." 
                   className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-full text-sm focus:outline-none focus:border-orange-500"
                   value={searchTerm}
                   onChange={e => setSearchTerm(e.target.value)}
                 />
              </div>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}>
                      <ListIcon className="w-4 h-4" />
                  </button>
                  <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}>
                      <LayoutGrid className="w-4 h-4" />
                  </button>
              </div>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="bg-slate-900 text-white p-3 rounded-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2">
             <span className="text-sm font-bold ml-2">{selectedIds.size} selected</span>
             <div className="flex space-x-2">
                <button onClick={handleBulkOpenTrade} disabled={isProcessing} className="text-xs bg-teal-600 hover:bg-teal-700 px-3 py-1.5 rounded flex items-center">
                   <RefreshCw className="w-3 h-3 mr-1" /> Open Trade
                </button>
                <button onClick={handleBulkMarkSold} disabled={isProcessing} className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded flex items-center">
                   <CheckCircle className="w-3 h-3 mr-1" /> Mark Sold
                </button>
                <button onClick={initiateBulkDelete} disabled={isProcessing} className="text-xs bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded flex items-center">
                   <Trash2 className="w-3 h-3 mr-1" /> Remove
                </button>
             </div>
          </div>
        )}

        {/* Content Area */}
        {filteredListings.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] py-20 text-slate-400 bg-white rounded-xl border border-slate-100">
               <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4"><Filter className="w-8 h-8 text-slate-300" /></div>
               <p className="text-lg font-medium">No items found</p>
            </div>
        ) : (
            <>
                {viewMode === 'list' ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                         <div className="divide-y divide-slate-100">
                            {/* Header */}
                            <div className="bg-slate-50 p-3 flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                               <div className="w-8 flex justify-center">
                                  <button onClick={selectAll}>
                                    {selectedIds.size === filteredListings.length && filteredListings.length > 0 ? <CheckSquare className="w-4 h-4 text-orange-500" /> : <Square className="w-4 h-4" />}
                                  </button>
                               </div>
                               <div className="flex-1 ml-4">Boardgame Details</div>
                               <div className="hidden sm:block w-32 text-right mr-4">Status</div>
                               <div className="w-24 text-center">Actions</div>
                            </div>

                            {filteredListings.map(item => (
                               <div key={item.id} className={`p-3 flex items-center hover:bg-slate-50 transition-colors group ${item.status === 'sold' ? 'bg-slate-50 opacity-75' : ''}`}>
                                  <div className="w-8 flex justify-center">
                                     <button onClick={() => toggleSelect(item.id)}>
                                        {selectedIds.has(item.id) ? <CheckSquare className="w-4 h-4 text-orange-500" /> : <Square className="w-4 h-4 text-slate-300" />}
                                     </button>
                                  </div>
                                  <div className="flex-1 ml-3 sm:ml-4 flex items-center space-x-3 sm:space-x-4 overflow-hidden">
                                     <div className="w-12 h-12 bg-slate-200 rounded-md overflow-hidden flex-shrink-0 relative">
                                       {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400 text-xs">No Img</div>}
                                     </div>
                                     <div className="min-w-0 flex-1">
                                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                           <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase whitespace-nowrap ${item.type === 'WTL' ? 'bg-purple-100 text-purple-700' : item.type === 'WTS' ? 'bg-orange-100 text-orange-700' : item.type === 'WTT' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'}`}>
                                             {item.type}
                                           </span>
                                           <h4 className={`font-bold text-sm truncate max-w-full ${item.status === 'sold' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{item.title}</h4>
                                           {item.openForTrade && item.type === 'WTS' && <span className="text-[10px] bg-teal-50 text-teal-600 px-1.5 py-0.5 rounded border border-teal-100 whitespace-nowrap">Trade Open</span>}
                                        </div>
                                        <div className="flex items-center text-xs text-slate-500 mt-0.5 space-x-2">
                                           <span>{item.type === 'WTL' ? `Bid: RM ${item.currentBid}` : `RM ${item.price}`}</span>
                                           {item.type !== 'WTB' && <span className="hidden sm:inline">• Cond: {item.condition}</span>}
                                           
                                           {/* Mobile Status Badge */}
                                           <span className={`sm:hidden text-[10px] font-bold px-1.5 py-0.5 rounded ${item.status === 'sold' ? 'bg-slate-200 text-slate-600' : 'bg-green-100 text-green-700'}`}>
                                             {item.status === 'sold' ? 'SOLD' : 'ACTIVE'}
                                           </span>
                                        </div>
                                     </div>
                                  </div>
                                  <div className="hidden sm:block w-32 text-right mr-4">
                                     <span className={`text-xs font-bold px-2 py-1 rounded-full ${item.status === 'sold' ? 'bg-slate-200 text-slate-600' : 'bg-green-100 text-green-700'}`}>
                                       {item.status === 'sold' ? 'SOLD' : 'ACTIVE'}
                                     </span>
                                  </div>
                                  <div className="w-24 flex justify-end sm:justify-center space-x-1">
                                     <button onClick={() => onMarkSold(item)} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded" title="Toggle Sold">
                                       {item.status === 'sold' ? <Repeat className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                                     </button>
                                     <button onClick={() => onEdit(item)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                                       <Pencil className="w-4 h-4" />
                                     </button>
                                     <button onClick={() => initiateDelete(item)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                                       <Trash2 className="w-4 h-4" />
                                     </button>
                                  </div>
                               </div>
                            ))}
                         </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredListings.map(item => (
                            <div key={item.id} className="relative group">
                                <ListingCard game={item} />
                                <div className="absolute top-2 right-2 flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity z-10">
                                     <button onClick={() => onEdit(item)} className="p-1.5 bg-white text-blue-600 rounded shadow-sm hover:bg-blue-50 border border-blue-100" title="Edit">
                                       <Pencil className="w-4 h-4" />
                                     </button>
                                     <button onClick={() => initiateDelete(item)} className="p-1.5 bg-white text-red-600 rounded shadow-sm hover:bg-red-50 border border-red-100" title="Delete">
                                       <Trash2 className="w-4 h-4" />
                                     </button>
                                </div>
                                <div className="absolute top-2 left-2 z-10">
                                    <button onClick={() => toggleSelect(item.id)} className="bg-white rounded shadow-sm p-0.5 border border-slate-200">
                                        {selectedIds.has(item.id) ? <CheckSquare className="w-5 h-5 text-orange-500" /> : <Square className="w-5 h-5 text-slate-300" />}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </>
        )}
      </div>
    </div>
  )
}

// --- Multi-Item Modal ---

function AddGameModal({ onClose, onAdd, initialData }) {
  const [step, setStep] = useState(initialData ? 'edit-single' : 'select-type'); 
  const [detectedItems, setDetectedItems] = useState([]);
  const [currentItemIndex, setCurrentItemIndex] = useState(null); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState(null);
  
  const [formData, setFormData] = useState({
    type: 'WTS',
    title: '',
    price: '',
    condition: 8.0,
    images: [],
    image: '', 
    description: '',
    openForTrade: false,
    isBNIS: false,
    bggId: null
  });
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inputText, setInputText] = useState(''); 
  const [searchResults, setSearchResults] = useState([]);
  const [bggQuery, setBggQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [debounceTimer, setDebounceTimer] = useState(null);
  const multiImgRef = useRef(null);

  useEffect(() => {
    if (initialData) {
      const d = { ...initialData, images: initialData.images || (initialData.image ? [initialData.image] : []) };
      setFormData(d);
      setStep('edit-single');
    }
  }, [initialData]);

  const handleProcessItems = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onAdd(detectedItems);
    } catch (e) {
      console.error(e);
      setIsSubmitting(false);
    }
  };

  const getConditionText = (val) => {
    if (val >= 10) return "Sealed, BNIS";
    if (val >= 9.5) return "Opened, Never Played / Played Once";
    if (val >= 9) return "Opened, Played a few times";
    if (val >= 8) return "Played lightly, looks new";
    if (val >= 7) return "Played moderately, minor wear";
    if (val >= 6) return "Played moderately, clear wear";
    if (val >= 5) return "Played heavily, visible wear/damage";
    if (val > 1) return "Damaged or moldy";
    return "Trash / Spare Parts";
  };

  const handleSingleSave = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.title.trim()) {
        setErrorMsg("Boardgame Title is compulsory.");
        return;
    }
    
    if (formData.type !== 'WTB') {
        if (formData.price === "" || formData.price === null || formData.price === undefined) {
            setErrorMsg("Price is compulsory.");
            return;
        }
    }

    if (step === 'edit-single' && initialData) {
      if (isSubmitting) return;
      setIsSubmitting(true);
      try {
        await onAdd(formData);
      } catch(e) {
        console.error(e);
        setIsSubmitting(false);
      }
    } else {
      const newItems = [...detectedItems];
      if (currentItemIndex !== null && currentItemIndex >= 0) {
        newItems[currentItemIndex] = formData;
      } else {
        newItems.push(formData);
      }
      setDetectedItems(newItems);
      setStep('review'); 
      setCurrentItemIndex(null);
    }
  };

  const handleFileProcess = (files) => {
    Array.from(files).forEach(async (file) => {
        const compressed = await resizeImage(file);
        setFormData(prev => {
          const newImages = [...(prev.images || []), compressed];
          return { ...prev, images: newImages, image: newImages[0] };
        });
    });
  };

  const handleMultiImageUpload = (e) => {
    const files = e.target.files;
    if (files.length > 0) handleFileProcess(files);
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileProcess(e.dataTransfer.files);
        e.dataTransfer.clearData();
    }
  };

  const removeImage = (idx) => {
    setFormData(prev => {
      const newImages = prev.images.filter((_, i) => i !== idx);
      return { ...prev, images: newImages, image: newImages.length > 0 ? newImages[0] : '' };
    });
  };

  const setCoverImage = (idx) => {
    setFormData(prev => {
      const img = prev.images[idx];
      const others = prev.images.filter((_, i) => i !== idx);
      const newImages = [img, ...others];
      return { ...prev, images: newImages, image: img };
    });
  };

  // --- AI Logic (Proxied to Backend) ---

  const enrichWithBGG = async (items) => {
    const updatedItems = [...items];
    for (let i = 0; i < updatedItems.length; i++) {
        const item = updatedItems[i];
        if (!item.title) continue;

        try {
            if (i > 0) await new Promise(r => setTimeout(r, 500));
            const res = await api.get(`/bgg/search?q=${encodeURIComponent(item.title)}`);
            const results = res.data;
            if (!results || results.length === 0) continue;

            const exactMatch = results.find(r => r.title.toLowerCase() === item.title.toLowerCase());
            const match = exactMatch || results[0];

            if (match) {
                 updatedItems[i] = { ...item };
                 // Overwrite or fill image
                 if (match.image) {
                     const existing = updatedItems[i].images || [];
                     updatedItems[i].image = match.image;
                     updatedItems[i].images = [match.image, ...existing];
                     updatedItems[i].bggId = match.id;
                 }
                 // Fill description if missing or short? BGG desc is usually good
                 if (match.description) {
                     updatedItems[i].description = match.description.replace(/<[^>]*>/g, ' ').slice(0, 1000) + "...";
                 }
            }
        } catch (e) { console.error(e); }
    }
    return updatedItems;
  };

  const processScanFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;
      setIsAnalyzing(true);
      setErrorMsg('');
      try {
        const res = await api.post('/ai/scan-image', { image: base64 });
        const items = Array.isArray(res.data) ? res.data : [res.data];
        
        const compressed = await resizeImage(file); 
        const itemsWithImg = items.map(i => ({ 
          ...i, 
          images: [compressed], 
          image: compressed, 
          type: formData.type || 'WTS',
          openForTrade: false 
        }));
        
        // Auto-search BGG covers immediately
        const enrichedItems = await enrichWithBGG(itemsWithImg);
        
        setDetectedItems(enrichedItems);
        setStep('review');
      } catch (err) {
        console.error(err);
        setErrorMsg("Failed to identify boardgames. Try again.");
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleScanInput = (e) => {
      processScanFile(e.target.files[0]);
  };

  const handleScanDrop = (e) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processScanFile(e.dataTransfer.files[0]);
          e.dataTransfer.clearData();
      }
  };

  const handleTextAnalysis = async () => {
    if (!inputText) return;
    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const res = await api.post('/ai/parse-text', { text: inputText });
      const items = res.data;
      const formatted = (Array.isArray(items) ? items : [items]).map(i => ({...i, type: formData.type || 'WTS', images: [], image: '', openForTrade: false}));
      
      // Auto-search BGG covers immediately
      const enrichedItems = await enrichWithBGG(formatted);

      setDetectedItems(enrichedItems);
      setStep('review');
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to parse text.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleQuickList = async () => {
     if (!inputText) return;
     setIsAnalyzing(true);
     const titles = inputText.split('\n').filter(t => t.trim().length > 0);
     const items = titles.map(t => ({
        type: 'WTB',
        title: t.trim(),
        price: '',
        condition: 8.0,
        images: [],
        image: '',
        description: '',
        openForTrade: false
     }));
     
     // Auto-search BGG covers for quick list too
     const enrichedItems = await enrichWithBGG(items);
     
     setDetectedItems(enrichedItems);
     setStep('review');
     setIsAnalyzing(false);
  }

  // --- BGG Logic (Proxied to Backend) ---

  const handleBGGSearch = async (q) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!q || q.length < 3) return;
    
    const timer = setTimeout(async () => {
        setBggQuery(q);
        try {
          const res = await api.get(`/bgg/search?q=${encodeURIComponent(q)}`);
          setSearchResults(res.data);
        } catch (e) { console.error(e); }
    }, 500);
    setDebounceTimer(timer);
  };

  const selectBGGGame = (game) => {
    setFormData({
      type: formData.type || 'WTS',
      title: game.title,
      image: game.image || '',
      images: game.image ? [game.image] : [],
      condition: 8.0, 
      price: '', 
      description: game.description || `BGG ID: ${game.id} - ${game.year}`,
      bggId: game.id,
      openForTrade: false
    });
    setStep('edit-single');
  };

  // --- BGG Fetchers ---
  
  const fetchCoverFromBGG = async () => {
    if (!formData.title || formData.title.length < 3) {
      setErrorMsg("Enter a title first to search BGG.");
      return;
    }
    setIsAnalyzing(true);
    try {
      const res = await api.get(`/bgg/search?q=${encodeURIComponent(formData.title)}`);
      // Pick first result with image
      const match = res.data.find(r => r.image);
      if (match) {
        const bggImg = match.image;
        setFormData(prev => {
          const newImages = [bggImg, ...(prev.images || [])];
          return { ...prev, images: newImages, image: bggImg, bggId: match.id };
        });
        setErrorMsg(""); 
      } else {
        setErrorMsg("No cover found on BGG.");
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to fetch BGG cover.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateDescription = async () => {
    if (!formData.title) return;
    setIsAnalyzing(true);
    try {
        const res = await api.get(`/bgg/search?q=${encodeURIComponent(formData.title)}`);
        // Find best match (exact title preferred, otherwise first)
        const match = res.data.find(r => r.title.toLowerCase() === formData.title.toLowerCase()) || res.data[0];
        
        if (match && match.description) {
             // Simple cleanup of HTML tags if backend didn't strip them all
             const desc = match.description.replace(/<[^>]*>/g, ' ').slice(0, 1000); 
             setFormData(prev => ({...prev, description: desc + "..."}));
        } else {
             // Fallback to simple default if BGG fails
             setFormData(prev => ({...prev, description: `Selling ${formData.title}. Great condition.`}));
        }
    } catch(err) { console.error(err); } 
    finally { setIsAnalyzing(false); }
  }

  const handleBulkAutoFill = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
        const updatedItems = [...detectedItems];
        for (let i = 0; i < updatedItems.length; i++) {
            const item = updatedItems[i];
            if ((item.image && item.description) || !item.title) continue;

            try {
                if (i > 0) await new Promise(r => setTimeout(r, 500));
                const res = await api.get(`/bgg/search?q=${encodeURIComponent(item.title)}`);
                const results = res.data;
                if (!results || results.length === 0) continue;

                const exactMatch = results.find(r => r.title.toLowerCase() === item.title.toLowerCase());
                const match = exactMatch || results[0];

                if (match) {
                     updatedItems[i] = { ...item };
                     if (!updatedItems[i].image && match.image) {
                         const existing = updatedItems[i].images || [];
                         updatedItems[i].image = match.image;
                         updatedItems[i].images = [match.image, ...existing];
                         updatedItems[i].bggId = match.id;
                     }
                     if (!updatedItems[i].description && match.description) {
                         updatedItems[i].description = match.description.replace(/<[^>]*>/g, ' ').slice(0, 1000) + "...";
                     }
                }
            } catch (e) { console.error(e); }
        }
        setDetectedItems(updatedItems);
    } finally {
        setIsSubmitting(false);
    }
  };

  const updateItemPrice = (idx, val) => {
      const newItems = [...detectedItems];
      if (/^\d*$/.test(val)) {
          newItems[idx] = { ...newItems[idx], price: val };
          setDetectedItems(newItems);
      }
  };

  // --- Render Steps ---

  const renderContent = () => {
    if (step === 'select-type') return renderSelectType();
    if (step === 'select-method') return renderSelectMethod();
    if (step === 'edit-single') return renderEditForm();
    if (step === 'input-bgg') return renderInputBGG();
    if (step === 'input-scan') return renderInputScan();
    if (step === 'input-parser') return renderInputParser();
    if (step === 'review') return renderReview();
    return null;
  };

  const renderEditForm = () => (
    <form onSubmit={handleSingleSave} className="space-y-6 py-2">
      {/* Type & Price Row */}
      <div className="grid grid-cols-2 gap-6">
         <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Type</label>
            <select className="w-full p-3 border border-slate-300 rounded-xl bg-slate-50 focus:ring-2 focus:ring-orange-100 outline-none" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
               <option value="WTS">Sell (WTS)</option>
               <option value="WTB">Buy (WTB)</option>
               <option value="WTL" disabled>Lelong (WTL) - Coming Soon</option>
            </select>
         </div>
         <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">{formData.type === 'WTB' ? 'Willing to Pay (RM)' : 'Price (RM)'} {formData.type !== 'WTB' && <span className="text-red-500">*</span>}</label>
            <input 
              type="text" 
              inputMode="numeric" 
              required={formData.type !== 'WTB'}
              className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-100 outline-none font-bold text-slate-800" 
              value={formData.price} 
              onChange={e => {
                  const val = e.target.value;
                  if (val === '' || /^\d+$/.test(val)) {
                      setFormData({...formData, price: val});
                  }
              }}
              placeholder={formData.type === 'WTB' ? "Optional" : "0"} 
            />
         </div>
      </div>

      {formData.type === 'WTS' && (
        <div className="flex items-center space-x-3 bg-teal-50 p-3 rounded-xl border border-teal-100">
           <input type="checkbox" id="openForTrade" checked={formData.openForTrade} onChange={e => setFormData({...formData, openForTrade: e.target.checked})} className="w-5 h-5 rounded text-teal-600 focus:ring-teal-500 border-gray-300" />
           <label htmlFor="openForTrade" className="text-sm font-bold text-teal-800">Open for Trade?</label>
        </div>
      )}

      <div>
         <label className="block text-sm font-bold text-slate-700 mb-1.5">Boardgame Title <span className="text-red-500">*</span></label>
         <input type="text" required className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-100 outline-none" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="e.g. Catan" />
      </div>

      <div>
         <label className="block text-sm font-bold text-slate-700 mb-2">Photos {formData.type === 'WTB' ? "(Optional)" : ""}</label>
         <div 
            className="flex gap-3 overflow-x-auto pb-2"
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
         >
            <button type="button" onClick={() => multiImgRef.current?.click()} className="w-24 h-24 flex-shrink-0 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-orange-500 hover:text-orange-500 transition-colors bg-slate-50">
               <Plus className="w-8 h-8" />
               <span className="text-[10px] font-bold mt-1 uppercase">Add Photo</span>
            </button>
            <input type="file" multiple ref={multiImgRef} hidden accept="image/*" onChange={handleMultiImageUpload} />
            
            {formData.images?.map((img, idx) => (
               <div key={idx} className="relative w-24 h-24 flex-shrink-0 group">
                  <img src={img} className={`w-full h-full object-cover rounded-xl border-2 ${idx === 0 ? 'border-orange-500' : 'border-transparent'}`} />
                  {idx === 0 && <span className="absolute bottom-0 left-0 right-0 bg-orange-500 text-white text-[9px] text-center font-bold py-0.5 rounded-b-lg">COVER</span>}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2 backdrop-blur-sm">
                     {idx !== 0 && <button type="button" onClick={() => setCoverImage(idx)} className="text-white hover:text-orange-300 p-1 bg-white/20 rounded-full" title="Make Cover"><CheckCircle className="w-5 h-5" /></button>}
                     <button type="button" onClick={() => removeImage(idx)} className="text-white hover:text-red-300 p-1 bg-white/20 rounded-full"><XCircle className="w-5 h-5" /></button>
                  </div>
               </div>
            ))}
         </div>
         <button type="button" onClick={fetchCoverFromBGG} disabled={isAnalyzing} className="text-xs text-blue-600 hover:text-blue-800 flex items-center mt-2 font-bold bg-blue-50 px-3 py-1.5 rounded-full w-fit">
            {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin mr-1.5"/> : <Globe className="w-3 h-3 mr-1.5"/>}
            Search BGG for Cover Art
         </button>
      </div>

      {formData.type !== 'WTB' && (
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
         <div>
             <div className="flex justify-between mb-2">
               <label className="block text-sm font-bold text-slate-700">Condition</label>
               <span className={`text-sm font-black px-2 py-0.5 rounded ${formData.condition >= 9 ? 'bg-green-100 text-green-700' : formData.condition >= 7 ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{Number(formData.condition).toFixed(1)}</span>
             </div>
             <input type="range" min="1" max="10" step="0.5" disabled={formData.isBNIS} className={`w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900 ${formData.isBNIS ? 'opacity-50 cursor-not-allowed' : ''}`} value={formData.condition} onChange={e => setFormData({...formData, condition: e.target.value})} />
             <div className="text-xs text-slate-500 mt-2 font-medium text-center">
                {getConditionText(Number(formData.condition))}
             </div>
         </div>
         
         <div className="flex items-center space-x-3 bg-white p-3 rounded-lg border border-slate-200">
            <input type="checkbox" id="isBNIS" checked={formData.isBNIS} onChange={e => setFormData(prev => ({...prev, isBNIS: e.target.checked, condition: e.target.checked ? 10.0 : prev.condition}))} className="w-5 h-5 rounded text-orange-600 focus:ring-orange-500 border-gray-300" />
            <label htmlFor="isBNIS" className="text-sm font-bold text-slate-700">Brand New In Shrink (BNIS)</label>
         </div>
      </div>
      )}

      <div>
         <div className="flex justify-between mb-1.5">
            <label className="block text-sm font-bold text-slate-700">Description</label>
            <button type="button" onClick={handleGenerateDescription} disabled={isAnalyzing} className="text-xs text-purple-600 flex items-center hover:bg-purple-50 px-2 py-1 rounded transition-colors font-bold"><Wand2 className="w-3 h-3 mr-1"/> AI Auto-write</button>
         </div>
         <textarea className="w-full p-3 border border-slate-300 rounded-xl h-32 text-sm focus:ring-2 focus:ring-orange-100 outline-none resize-none" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Describe condition, missing pieces, etc..."></textarea>
      </div>

      <div className="pt-2 flex justify-between items-center border-t border-slate-100 mt-4">
         <button type="button" onClick={() => initialData ? onClose() : (detectedItems.length > 0 ? setStep('review') : setStep('select-method'))} className="text-slate-500 font-bold hover:text-slate-800 px-4 py-2">Back</button>
         <button type="submit" disabled={isSubmitting} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 flex items-center shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {initialData ? 'Update Listing' : (detectedItems.length > 0 ? 'Save to List' : 'Review & Post')}
         </button>
      </div>
    </form>
  )

  const renderSelectType = () => (
    <div className="space-y-8 text-center py-4">
      <h4 className="text-2xl font-bold text-slate-800">What would you like to do?</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <button onClick={() => { setFormData(prev => ({...prev, type: 'WTS'})); setStep('select-method'); }} className="group p-6 rounded-3xl border-2 border-orange-100 bg-orange-50 hover:border-orange-500 hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col items-center justify-center h-48">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <DollarSign className="w-8 h-8 text-orange-500" />
            </div>
            <div className="text-2xl font-black text-orange-600 mb-1">Sell</div>
            <div className="text-sm text-slate-500 font-medium">WTS</div>
        </button>
        <button onClick={() => { setFormData(prev => ({...prev, type: 'WTB'})); setStep('select-method'); }} className="group p-6 rounded-3xl border-2 border-blue-100 bg-blue-50 hover:border-blue-500 hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col items-center justify-center h-48">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <ShoppingBag className="w-8 h-8 text-blue-500" />
            </div>
            <div className="text-2xl font-black text-blue-600 mb-1">Buy</div>
            <div className="text-sm text-slate-500 font-medium">WTB</div>
        </button>
        <button disabled className="group p-6 rounded-3xl border-2 border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed flex flex-col items-center justify-center h-48">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 grayscale">
                <Gavel className="w-8 h-8 text-slate-400" />
            </div>
            <div className="text-2xl font-black text-slate-400 mb-1">Lelong</div>
            <div className="text-sm text-slate-400 font-medium">Coming Soon</div>
        </button>
      </div>
    </div>
  )

  const renderSelectMethod = () => (
    <div className="space-y-8 py-4">
      <div className="flex items-center mb-6">
         <button onClick={() => setStep('select-type')} className="text-slate-400 hover:text-slate-600 mr-4 p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors"><ArrowLeft className="w-6 h-6"/></button>
         <h4 className="text-2xl font-bold text-slate-800">How would you like to add?</h4>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <button 
            onClick={() => { setSelectedMethod('bgg'); setStep('input-bgg'); }} 
            className="group p-6 border-2 rounded-3xl text-left transition-all relative border-slate-100 hover:border-green-500 hover:shadow-xl hover:-translate-y-1 bg-white"
        >
          <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-green-500 transition-colors">
             <Globe className="w-8 h-8 text-green-500 group-hover:text-white transition-colors" />
          </div>
          <div className="font-bold text-xl text-slate-800 mb-1">BGG Database</div>
          <div className="text-sm text-slate-500">Search & Auto-fill</div>
        </button>

        <button 
            onClick={() => { setSelectedMethod('scan'); setStep('input-scan'); }} 
            className="group p-6 border-2 rounded-3xl text-left transition-all relative border-slate-100 hover:border-purple-500 hover:shadow-xl hover:-translate-y-1 bg-white overflow-hidden"
        >
          <div className="absolute top-3 right-3 bg-purple-100 text-purple-700 text-[10px] font-bold px-3 py-1 rounded-full">MULTI</div>
          <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-purple-500 transition-colors">
             <Camera className="w-8 h-8 text-purple-500 group-hover:text-white transition-colors" />
          </div>
          <div className="font-bold text-xl text-slate-800 mb-1">AI Photo Scan</div>
          <div className="text-sm text-slate-500">Upload Game Stack</div>
        </button>

        <button 
            onClick={() => { setSelectedMethod('parser'); setStep('input-parser'); }} 
            className="group p-6 border-2 rounded-3xl text-left transition-all relative border-slate-100 hover:border-blue-500 hover:shadow-xl hover:-translate-y-1 bg-white"
        >
             <div className="absolute top-3 right-3 bg-blue-100 text-blue-700 text-[10px] font-bold px-3 py-1 rounded-full">MULTI</div>
             <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-blue-500 transition-colors">
                {formData.type === 'WTB' ? <ListPlus className="w-8 h-8 text-blue-500 group-hover:text-white transition-colors" /> : <Facebook className="w-8 h-8 text-blue-500 group-hover:text-white transition-colors" />}
             </div>
             <div className="font-bold text-xl text-slate-800 mb-1">{formData.type === 'WTB' ? 'Quick List' : 'Smart Parser'}</div>
             <div className="text-sm text-slate-500">{formData.type === 'WTB' ? 'Type multiple titles' : 'Paste bulk sell list'}</div>
        </button>
      </div>

      <div className="text-center mt-8">
          <button onClick={() => { setFormData({...formData, title: ''}); setStep('edit-single'); }} className="text-slate-400 hover:text-slate-600 text-sm border-b border-slate-300 pb-0.5 hover:border-slate-500 transition-colors">
              Or enter manually
          </button>
      </div>
    </div>
  )

  const renderInputBGG = () => (
    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 h-full">
        <div className="flex items-center mb-4">
            <button onClick={() => setStep('select-method')} className="text-slate-400 hover:text-slate-600 mr-4"><ArrowLeft className="w-5 h-5"/></button>
            <h4 className="text-lg font-medium text-slate-700">Search BGG</h4>
        </div>
        <div className="relative mb-4">
            <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
            <input type="text" placeholder="Search BoardGameGeek..." className="w-full pl-10 p-3 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-green-200 focus:border-green-500 outline-none transition-all" onChange={e => handleBGGSearch(e.target.value)} autoFocus />
        </div>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {searchResults.map(g => (
                <div key={g.id} onClick={() => selectBGGGame(g)} className="flex items-center p-2 hover:bg-slate-100 cursor-pointer rounded border border-transparent hover:border-slate-200 bg-white shadow-sm">
                <div className="w-10 h-10 bg-slate-200 rounded mr-3 overflow-hidden flex-shrink-0">
                    {g.image ? <img src={g.image} className="w-full h-full object-cover" /> : null}
                </div>
                <div><div className="font-bold text-sm text-slate-800">{g.title}</div><div className="text-xs text-slate-500">{g.year}</div></div>
                </div>
            ))}
            {bggQuery.length > 2 && searchResults.length === 0 && <div className="text-center text-slate-400 text-sm py-4">Searching...</div>}
        </div>
    </div>
  )

  const renderInputScan = () => (
    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 h-full flex flex-col">
        <div className="flex items-center mb-4">
            <button onClick={() => setStep('select-method')} className="text-slate-400 hover:text-slate-600 mr-4"><ArrowLeft className="w-5 h-5"/></button>
            <h4 className="text-lg font-medium text-slate-700">Scan from Photo</h4>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center">
            <div 
                onDrop={handleScanDrop} 
                onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-purple-500 hover:bg-purple-50 transition-colors bg-white cursor-pointer w-full max-w-sm"
                onClick={() => document.getElementById('ai-scan-input').click()}
            >
                <input type="file" id="ai-scan-input" hidden accept="image/*" onChange={handleScanInput} />
                <Camera className="w-12 h-12 mx-auto text-purple-400 mb-2" />
                <div className="font-bold text-slate-700">Upload Shelfie</div>
                <div className="text-xs text-slate-400">Drag & drop or click</div>
            </div>
            {isAnalyzing && <div className="mt-4 text-center text-purple-600 animate-pulse text-sm">Scanning boardgames...</div>}
            {errorMsg && <div className="mt-2 text-center text-red-500 text-xs">{errorMsg}</div>}
        </div>
    </div>
  )

  const renderInputParser = () => (
    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 h-full flex flex-col">
        <div className="flex items-center mb-4">
            <button onClick={() => setStep('select-method')} className="text-slate-400 hover:text-slate-600 mr-4"><ArrowLeft className="w-5 h-5"/></button>
            <h4 className="text-lg font-medium text-slate-700">{formData.type === 'WTB' ? 'Quick List' : 'Smart Parser'}</h4>
        </div>
        <div className="flex-1 flex flex-col">
            <textarea 
                className="w-full p-3 border border-slate-300 rounded-lg flex-1 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none resize-none"
                placeholder={formData.type === 'WTB' ? "Catan\nTicket to Ride\nWingspan" : "Paste your Facebook/Whatsapp selling post here..."}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
            ></textarea>
            <div className="mt-4 flex justify-end">
                <button onClick={formData.type === 'WTB' ? handleQuickList : handleTextAnalysis} disabled={isAnalyzing || !inputText} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center">
                    {isAnalyzing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {formData.type === 'WTB' ? 'Create List' : 'Analyze Text'}
                </button>
            </div>
            {errorMsg && <div className="mt-2 text-center text-red-500 text-xs">{errorMsg}</div>}
        </div>
    </div>
  );

  const renderReview = () => (
    <div className="h-full flex flex-col">
        <div className="flex justify-between items-center mb-4">
            <span className="text-xs font-bold text-slate-400 uppercase">{detectedItems.length} Items Ready</span>
            <button onClick={() => {
                setFormData({
                    type: formData.type || 'WTS',
                    title: '',
                    price: '',
                    condition: 8.0,
                    images: [],
                    image: '',
                    description: '',
                    openForTrade: false,
                    isBNIS: false,
                    bggId: null
                });
                setCurrentItemIndex(null); 
                setStep('edit-single');
            }} className="text-sm text-blue-600 hover:underline flex items-center"><Plus className="w-4 h-4 mr-1"/> Add More</button> 
        </div>
        <div className="space-y-3 overflow-y-auto flex-1 pr-2">
            {detectedItems.map((item, idx) => (
                <div key={idx} className="flex items-start p-3 bg-white border border-slate-200 rounded-lg group hover:border-orange-300 transition-colors">
                    <div className="w-16 h-16 bg-slate-100 rounded mr-3 overflow-hidden flex-shrink-0 relative cursor-pointer" onClick={() => { setCurrentItemIndex(idx); setFormData(item); setStep('edit-single'); }}>
                        {item.images && item.images.length > 0 ? <img src={item.images[0]} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-slate-300"/></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                            <div className="font-bold text-sm truncate text-slate-800 cursor-pointer hover:text-blue-600" onClick={() => { setCurrentItemIndex(idx); setFormData(item); setStep('edit-single'); }}>
                                {item.title || "Untitled"}
                            </div>
                            <button onClick={() => {
                                const newItems = detectedItems.filter((_, i) => i !== idx);
                                setDetectedItems(newItems);
                                if (newItems.length === 0) setStep('select-method');
                            }} className="text-slate-300 hover:text-red-500"><X className="w-4 h-4"/></button>
                        </div>
                        
                        <div className="flex items-center gap-2 mt-1">
                            {item.type === 'WTS' ? (
                                <div className="relative w-24">
                                    <span className="absolute left-2 top-1.5 text-xs text-slate-400">RM</span>
                                    <input 
                                        type="text" 
                                        className="w-full pl-8 py-1 text-xs border border-slate-200 rounded focus:border-orange-500 outline-none font-bold text-slate-700"
                                        placeholder="Price"
                                        value={item.price || ''}
                                        onChange={(e) => updateItemPrice(idx, e.target.value)}
                                    />
                                </div>
                            ) : (
                                <div className="text-xs text-slate-500">RM {item.price || "?"}</div>
                            )}
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                {item.type !== 'WTB' && <span>• Cond: {item.condition} {item.isBNIS && "(BNIS)"}</span>}
                                {item.openForTrade && <span className="text-teal-600 font-bold ml-1">• Trade</span>}
                            </span>
                        </div>
                        
                        <div className="text-[10px] text-slate-400 truncate mt-1 cursor-pointer hover:text-slate-600" onClick={() => { setCurrentItemIndex(idx); setFormData(item); setStep('edit-single'); }}>
                            {item.description || "No description"}
                        </div>
                    </div>
                </div>
            ))}
        </div>
        <div className="flex justify-between items-center pt-4 border-t border-slate-100">
            <button onClick={handleBulkAutoFill} disabled={isSubmitting} className="text-sm text-blue-600 hover:underline flex items-center">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1"/> : <Wand2 className="w-4 h-4 mr-1"/>}
                Auto-fill from BGG
            </button>
            <div className="flex gap-2">
                <button onClick={() => setStep('select-type')} className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50">Back</button>
                <button onClick={handleProcessItems} disabled={isSubmitting} className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center">
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : <Save className="w-5 h-5 mr-2"/>}
                    Save All ({detectedItems.length})
                </button>
            </div>
        </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">
            {step === 'edit-single' && initialData ? 'Edit Listing' : 'Add Boardgames'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}

function EditProfileModal({ user, onClose, onUpdate }) {
    const [formData, setFormData] = useState({
        displayName: user.displayName || '',
        email: user.email || '',
        phone: user.phone || '',
        facebookLink: user.facebookLink || '',
        password: '',
        image: '' // Base64
    });
    const [preview, setPreview] = useState(user.picture || user.image || '');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleImageChange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const base64 = await resizeImage(file, 200, 200);
            setFormData({ ...formData, image: base64 });
            setPreview(base64);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onUpdate(formData);
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-lg text-slate-800">Edit Profile</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
                    {/* Avatar */}
                    <div className="flex justify-center mb-6">
                        <div className="relative w-28 h-28 group">
                            <div className="w-28 h-28 rounded-full overflow-hidden bg-slate-100 border-4 border-white shadow-md">
                                {preview ? <img src={preview} className="w-full h-full object-cover" /> : <User className="w-12 h-12 text-slate-300 m-auto mt-8" />}
                            </div>
                            <label className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full cursor-pointer hover:bg-blue-700 shadow-lg hover:scale-110 transition-all">
                                <Camera className="w-5 h-5" />
                                <input type="file" hidden accept="image/*" onChange={handleImageChange} />
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">Display Name</label>
                        <input name="displayName" value={formData.displayName} onChange={handleChange} className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all" required />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">Email</label>
                        <input name="email" value={formData.email} onChange={handleChange} className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all" required type="email" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">Phone (Whatsapp)</label>
                        <input name="phone" value={formData.phone} onChange={handleChange} className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all" placeholder="e.g. 60123456789" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">Facebook Profile Link</label>
                        <input name="facebookLink" value={formData.facebookLink} onChange={handleChange} className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all" placeholder="https://facebook.com/username" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">New Password (Optional)</label>
                        <input name="password" value={formData.password} onChange={handleChange} className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all" type="password" placeholder="Leave blank to keep current" />
                    </div>

                    <div className="pt-4">
                        <button type="submit" disabled={loading} className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all flex justify-center items-center">
                            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function ListingCard({ game, onClick }) {
    const handleContact = (type, value) => {
        if (!value) return;
        if (type === 'whatsapp') {
            const cleanNumber = value.replace(/\D/g, '');
            const finalNumber = cleanNumber.startsWith('01') ? `6${cleanNumber}` : cleanNumber;
            window.open(`https://wa.me/${finalNumber}`, '_blank');
        } else if (type === 'facebook') {
            const url = value.startsWith('http') ? value : `https://${value}`;
            window.open(url, '_blank');
        }
    };

    const isWTB = game.type === 'WTB';

    return (
        <div onClick={onClick} className={`bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group border flex flex-col h-full cursor-pointer ${isWTB ? 'border-blue-200 bg-blue-50/30' : 'border-slate-100'}`}>
            <div className="relative h-48 overflow-hidden bg-slate-200">
                {game.image ? (
                    <img src={game.image} alt={game.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <ImageIcon className="w-12 h-12 opacity-50" />
                    </div>
                )}
                <div className="absolute top-2 right-2 flex flex-col gap-1">
                    <span className={`text-xs font-bold px-2 py-1 rounded shadow-sm uppercase text-center ${
                        game.type === 'WTS' ? 'bg-orange-500 text-white' : 
                        game.type === 'WTB' ? 'bg-blue-500 text-white' : 
                        game.type === 'WTL' ? 'bg-purple-600 text-white' : 'bg-teal-500 text-white'
                    }`}>
                        {game.type}
                    </span>
                    {game.condition && game.type === 'WTS' && (
                        <span className={`text-xs font-bold px-2 py-1 rounded shadow-sm bg-white text-slate-700 border border-slate-100 text-center`}>
                            {game.isBNIS ? "BNIS" : `Cond: ${game.condition.toFixed(1)}`}
                        </span>
                    )}
                </div>
                {game.status === 'sold' && (
                    <div className="absolute inset-0 bg-white bg-opacity-60 flex items-center justify-center backdrop-blur-[1px]">
                        <span className="bg-slate-800 text-white px-4 py-2 rounded-full font-bold shadow-xl transform -rotate-12 border-2 border-white">SOLD</span>
                    </div>
                )}
            </div>
            <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-bold text-slate-800 text-base leading-tight mb-1 line-clamp-2" title={game.title}>{game.title}</h3>
                <p className="text-xs text-slate-500 mb-3 line-clamp-2 flex-1">{game.description}</p>
                
                <div className={`mt-auto pt-3 border-t ${isWTB ? 'border-blue-100' : 'border-slate-50'}`}>
                    <div className="flex justify-between items-center mb-2">
                        <div className="font-extrabold text-slate-900 text-lg">
                            {game.price ? `RM ${game.price}` : <span className="text-xs text-slate-400 italic">Make Offer</span>}
                        </div>
                        {/* Open for Trade Mark */}
                        {game.openForTrade && game.type !== 'WTT' && (
                            <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded border border-teal-100 flex items-center">
                                <RefreshCw className="w-3 h-3 mr-1" /> Open Trade
                            </span>
                        )}
                    </div>
                    
                    <div className="flex items-center justify-between">
                        {game.sellerName && (
                            <div className="flex items-center text-xs text-slate-500" title={`Seller: ${game.sellerName}`}>
                                <div className="w-5 h-5 rounded-full bg-slate-200 overflow-hidden mr-1.5 flex-shrink-0">
                                    {game.sellerAvatar ? <img src={game.sellerAvatar} className="w-full h-full object-cover"/> : <User className="w-3 h-3 m-auto mt-1"/>}
                                </div>
                                <span className="max-w-[80px] truncate">{game.sellerName}</span>
                            </div>
                        )}
                        
                        <div className="flex gap-1">
                            {game.sellerPhone && (
                                <button onClick={(e) => { e.stopPropagation(); handleContact('whatsapp', game.sellerPhone); }} className="p-1.5 bg-green-50 text-green-600 rounded-full hover:bg-green-100 transition-colors" title="Chat on Whatsapp">
                                    <MessageCircle className="w-4 h-4" />
                                </button>
                            )}
                            {game.sellerFb && (
                                <button onClick={(e) => { e.stopPropagation(); handleContact('facebook', game.sellerFb); }} className="p-1.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors" title="View Facebook Profile">
                                    <Facebook className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function AuctionCard({ game, onBid }) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-purple-100 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500"></div>
            <div className="p-4">
                <div className="flex gap-4">
                    <div className="w-24 h-24 bg-slate-200 rounded-lg overflow-hidden flex-shrink-0">
                        {game.image ? <img src={game.image} className="w-full h-full object-cover" /> : null}
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-slate-800 line-clamp-1">{game.title}</h3>
                        <p className="text-xs text-slate-500 mb-2">{game.description}</p>
                        <div className="flex justify-between items-end">
                            <div>
                                <div className="text-[10px] uppercase font-bold text-slate-400">Current Bid</div>
                                <div className="text-xl font-black text-purple-700">RM {game.currentBid}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] uppercase font-bold text-slate-400">Bids</div>
                                <div className="text-sm font-bold text-slate-700">{game.bidCount || 0}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-50 flex justify-between items-center">
                    <div className="flex items-center text-red-500 text-xs font-bold animate-pulse">
                        <Clock className="w-3 h-3 mr-1" /> Ending Soon
                    </div>
                    {onBid && (
                        <button disabled className="bg-slate-100 text-slate-400 px-4 py-2 rounded-lg font-bold text-xs cursor-not-allowed">
                            Bid (Closed)
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function MobileBottomNav({ view, setView, user }) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-[9999] px-6 py-3 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      <div className="flex justify-between items-center max-w-sm mx-auto">
        <NavIcon icon={<Home className="w-6 h-6"/>} label="Home" active={view === 'home'} onClick={() => setView('home')} />
        <NavIcon icon={<ShoppingBag className="w-6 h-6"/>} label="Market" active={view === 'explore'} onClick={() => setView('explore')} />
        <NavIcon icon={<Gavel className="w-6 h-6"/>} label="Lelong" active={view === 'auctions'} onClick={() => setView('auctions')} />
        <NavIcon icon={<User className="w-6 h-6"/>} label={user ? "Profile" : "Login"} active={view === 'dashboard' || view === 'auth'} onClick={() => setView(user ? 'dashboard' : 'auth')} />
      </div>
    </div>
  )
}

function NavIcon({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center w-14 space-y-1 transition-colors ${active ? 'text-orange-600' : 'text-slate-400 hover:text-slate-600'}`}>
      {icon}
      <span className="text-[10px] font-bold tracking-tight">{label}</span>
    </button>
  )
}

function GameDetailsModal({ game, user, onClose, onAddComment, onDeleteComment, onNext, onPrev, onLoginRequest }) {
  const [commentText, setCommentText] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

  // Reset state when game changes
  useEffect(() => {
      setActiveImage(0);
      setCommentText('');
  }, [game.id]);

  const handlePost = async (e) => {
      e.preventDefault();
      if(!commentText.trim()) return;
      setIsPosting(true);
      await onAddComment(game.id, commentText);
      setCommentText('');
      setIsPosting(false);
  };

  const images = game.images && game.images.length > 0 ? game.images : (game.image ? [game.image] : []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-4 bg-slate-900/90 backdrop-blur-md">
       <div className="bg-white w-full h-full sm:h-[90vh] sm:max-w-5xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300 relative group/modal">
          
          <div className="absolute top-4 right-4 z-20">
             <button onClick={onClose} className="p-2 bg-white/80 hover:bg-white rounded-full shadow-lg backdrop-blur-sm transition-all hover:scale-110 group">
                <X className="w-6 h-6 text-slate-800 group-hover:rotate-90 transition-transform"/>
             </button>
          </div>

          {/* Navigation Buttons - Visible on Mobile too */}
          <button onClick={onPrev} className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 p-2 sm:p-3 bg-white/80 hover:bg-white rounded-full shadow-lg backdrop-blur-sm transition-all hover:scale-110 flex items-center justify-center group/nav">
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-slate-800 group-hover/nav:-translate-x-0.5 transition-transform"/>
          </button>
          <button onClick={onNext} className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 p-2 sm:p-3 bg-white/80 hover:bg-white rounded-full shadow-lg backdrop-blur-sm transition-all hover:scale-110 flex items-center justify-center group/nav">
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-slate-800 group-hover/nav:translate-x-0.5 transition-transform"/>
          </button>

          <div className="flex-1 overflow-y-auto">
             <div className="grid grid-cols-1 md:grid-cols-12 min-h-full">
                
                <div className="md:col-span-5 bg-slate-100 flex flex-col relative group">
                   <div className="flex-1 relative min-h-[300px] md:min-h-0 bg-slate-900 flex items-center justify-center overflow-hidden">
                      {images.length > 0 ? (
                          <div className="relative w-full h-full flex items-center justify-center">
                              {/* Blurred Background */}
                              <div className="absolute inset-0 overflow-hidden">
                                  <img src={images[activeImage]} alt={game.title} className="w-full h-full object-cover opacity-50 blur-xl scale-110" />
                              </div>
                              {/* Main Image */}
                              <img src={images[activeImage]} alt={game.title} className="relative w-full h-full object-contain z-10 shadow-2xl" />
                          </div>
                      ) : (
                          <div className="absolute inset-0 flex items-center justify-center"><ImageIcon className="w-20 h-20 text-slate-300"/></div>
                      )}
                   </div>

                   {images.length > 1 && (
                       <div className="absolute bottom-4 left-16 right-16 flex gap-2 overflow-x-auto pb-1 px-1 no-scrollbar justify-center z-10">
                           {images.map((img, idx) => (
                               <button key={idx} onClick={() => setActiveImage(idx)} className={`w-12 h-12 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all shadow-lg bg-white ${activeImage === idx ? 'border-orange-500 scale-110 ring-2 ring-orange-500/50' : 'border-white/80 opacity-80 hover:opacity-100 hover:scale-105'}`}>
                                   <img src={img} className="w-full h-full object-cover" />
                               </button>
                           ))}
                       </div>
                   )}
                </div>

                <div className="md:col-span-7 flex flex-col bg-white">
                    <div className="p-6 md:p-8 space-y-8 flex-1">
                        
                        <div>
                            <div className="flex flex-wrap gap-2 mb-3">
                                <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                                    game.type === 'WTS' ? 'bg-orange-100 text-orange-600' : 
                                    game.type === 'WTB' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                                }`}>{game.type}</span>
                                {game.isBNIS && <span className="bg-slate-900 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">BNIS</span>}
                                {game.status === 'sold' && <span className="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">SOLD</span>}
                                {game.openForTrade && <span className="bg-teal-100 text-teal-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm border border-teal-200">OPEN TRADE</span>}
                                {game.condition && game.type !== 'WTB' && !game.isBNIS && <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold border border-slate-200">Cond: {game.condition}</span>}
                            </div>
                            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-2 leading-tight">{game.title}</h1>
                            <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-600">
                                {game.type === 'WTL' ? `Current Bid: RM ${game.currentBid}` : (game.price ? `RM ${game.price}` : <span className="text-slate-400 italic font-medium">Make Offer</span>)}
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4 group cursor-default">
                            <div className="w-12 h-12 bg-slate-100 rounded-full overflow-hidden border-2 border-white shadow-sm group-hover:scale-105 transition-transform">
                                {game.sellerAvatar ? <img src={game.sellerAvatar} className="w-full h-full object-cover"/> : <User className="w-6 h-6 m-auto mt-2 text-slate-400"/>}
                            </div>
                            <div className="flex-1">
                                <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">{game.type === 'WTB' ? 'Buyer' : 'Seller'}</div>
                                <div className="font-bold text-slate-800">{game.sellerName || "Unknown"}</div>
                            </div>
                            <div className="flex gap-2">
                                {game.sellerPhone && <button onClick={() => window.open(`https://wa.me/${game.sellerPhone}`, '_blank')} className="p-2 bg-green-50 text-green-600 rounded-full hover:bg-green-100 transition-colors" title="Whatsapp"><MessageCircle className="w-5 h-5"/></button>}
                                {game.sellerFb && <button onClick={() => window.open(game.sellerFb, '_blank')} className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors" title="Facebook"><Facebook className="w-5 h-5"/></button>}
                            </div>
                        </div>

                        <div className="prose prose-sm prose-slate max-w-none text-slate-600">
                            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-2">ABOUT THIS BOARDGAME</h3>
                            <p className="whitespace-pre-wrap leading-relaxed opacity-90">{game.description || "No description provided."}</p>
                        </div>
                    </div>

                    <div className="bg-slate-50 border-t border-slate-100 p-6 md:p-8">
                        <h3 className="font-bold text-slate-800 mb-6 flex items-center"><MessageCircle className="w-5 h-5 mr-2 text-orange-500"/> Comments ({game.comments?.length || 0})</h3>
                        
                        <div className="space-y-4 mb-6 max-h-64 overflow-y-auto pr-2">
                            {game.comments?.map((c) => (
                                <div key={c.id} className={`flex gap-3 ${user && user.id === c.userId ? 'flex-row-reverse' : ''}`}>
                                    <div className="w-8 h-8 bg-white rounded-full border border-slate-200 overflow-hidden flex-shrink-0 shadow-sm mt-1">
                                        {c.userAvatar ? <img src={c.userAvatar} className="w-full h-full object-cover"/> : <User className="w-4 h-4 m-auto mt-2 text-slate-300"/>}
                                    </div>
                                    <div className={`flex-1 max-w-[85%] p-3 rounded-2xl shadow-sm text-sm relative group ${user && user.id === c.userId ? 'bg-orange-100 text-slate-800 rounded-tr-none' : 'bg-white text-slate-600 rounded-tl-none border border-slate-100'}`}>
                                        <div className="flex justify-between items-center mb-1 gap-4">
                                            <span className="font-bold text-xs opacity-70">{c.userName}</span>
                                            <span className="text-[10px] opacity-50">{new Date(c.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                        </div>
                                        <p>{c.text}</p>
                                        {user && user.id === c.userId && (
                                            <button onClick={() => onDeleteComment(game.id, c.id)} className="absolute -top-2 -left-2 bg-white text-red-500 p-1 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"><Trash2 className="w-3 h-3"/></button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {(!game.comments || game.comments.length === 0) && <div className="text-center py-8 text-slate-400 text-sm italic">It's quiet here... Start the conversation!</div>}
                        </div>

                        {user ? (
                            <form onSubmit={handlePost} className="relative">
                                <input 
                                   type="text" 
                                   className="w-full bg-white border border-slate-200 rounded-full pl-5 pr-12 py-3 text-sm focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-50 transition-all shadow-sm"
                                   placeholder="Ask the seller a question..." 
                                   value={commentText}
                                   onChange={e => setCommentText(e.target.value)}
                                />
                                <button type="submit" disabled={isPosting || !commentText.trim()} className="absolute right-1.5 top-1.5 bg-slate-900 hover:bg-orange-600 text-white rounded-full p-2 w-9 h-9 flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                    {isPosting ? <Loader2 className="w-4 h-4 animate-spin"/> : <ArrowLeft className="w-4 h-4 rotate-180"/>} 
                                </button>
                            </form>
                        ) : (
                            <div className="text-center p-4 bg-orange-50/50 rounded-xl text-orange-800 text-sm font-medium border border-orange-100">
                                <button onClick={onLoginRequest} className="underline hover:text-orange-900">Login</button> to join the conversation.
                            </div>
                        )}
                    </div>
                </div>
             </div>
          </div>
       </div>
    </div>
  );
}
