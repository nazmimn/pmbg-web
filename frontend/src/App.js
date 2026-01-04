import React, { useState, useEffect, useRef } from 'react';
import { 
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
  ListPlus
} from 'lucide-react';
import axios from 'axios';

// --- Configuration ---
const API_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";
const api = axios.create({
    baseURL: API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`
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

  // Auth Initialization
  useEffect(() => {
    const savedUser = localStorage.getItem('pm_user');
    if (savedUser) {
        setUser(JSON.parse(savedUser));
    }
    setLoading(false);
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


  const handleLogin = async (displayName) => {
      try {
          const res = await api.post('/auth/login', { displayName });
          const userData = res.data.user;
          setUser(userData);
          localStorage.setItem('pm_user', JSON.stringify(userData));
          setView('dashboard');
          showNotification(`Welcome, ${userData.displayName}!`);
      } catch (e) {
          console.error(e);
          showNotification("Login failed", "error");
      }
  };

  const handleLogout = () => {
    localStorage.removeItem('pm_user');
    setUser(null);
    setView('home');
    showNotification("Logged out successfully");
  };

  const handleSeedData = async () => {
    if (!user) {
      showNotification("Please log in to seed data", "error");
      return;
    }
    setLoading(true);
    try {
      const demoData = [
        {
          title: 'Wingspan',
          price: 220,
          condition: 9.0,
          type: 'WTS',
          status: 'active',
          openForTrade: true,
          description: 'Played twice. Cards are sleeved. Beautiful artwork.',
          image: 'https://cf.geekdo-images.com/yLZJCVLlIx4c7eJEWUNJ7w__imagepage/img/yFqG5c5j-76i87yXb8w5q8x-95E=/fit-in/900x600/filters:no_upscale():strip_icc()/pic4458123.jpg', 
          sellerId: user.id,
          images: []
        },
        {
          title: 'Dune: Imperium',
          price: 180,
          condition: 8.5,
          type: 'WTL',
          status: 'active',
          openForTrade: false,
          currentBid: 180,
          bidCount: 0,
          description: 'Starting auction for Dune Imperium. Base game only.',
          image: 'https://cf.geekdo-images.com/Phjhyysl1rfM44HN8D9aZg__imagepage/img/k3vV5gD7gqgQ0i-g3q5gX_X1-5E=/fit-in/900x600/filters:no_upscale():strip_icc()/pic5666597.jpg',
          sellerId: user.id,
          images: []
        }
      ];

      await api.post('/listings', demoData);
      showNotification("Database seeded!");
      // Trigger refresh
      const res = await api.get('/listings');
      setListings(res.data);
    } catch (err) {
      console.error(err);
      showNotification("Failed to seed data", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveListing = async (dataOrArray) => {
    if (!user) return;
    try {
      const itemsToSave = Array.isArray(dataOrArray) ? dataOrArray : [dataOrArray];
      
      const preparedItems = itemsToSave.map(item => ({
          ...item,
          image: (item.images && item.images.length > 0) ? item.images[0] : (item.image || ''),
          sellerId: user.id,
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

  const handleEditClick = (item) => {
    setEditingItem(item);
    setShowAddModal(true);
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
      case 'home': return <HomeView listings={listings} setView={setView} onSeed={handleSeedData} />;
      case 'explore': return <ExploreView listings={listings} onSeed={handleSeedData} />;
      case 'auctions': return <AuctionsView listings={listings} onBid={placeBid} />;
      case 'dashboard': 
        if (!user) {
          return <AuthView onLogin={handleLogin} onCancel={() => setView('home')} />;
        }
        return <DashboardView 
                  user={user}
                  myListings={myListings} 
                  onAdd={() => { setEditingItem(null); setShowAddModal(true); }} 
                  onSeed={handleSeedData} 
                  onDelete={handleDeleteListing}
                  onEdit={handleEditClick}
                  onMarkSold={handleMarkSold}
                />;
      case 'auth': return <AuthView onLogin={handleLogin} onCancel={() => setView('home')} />;
      default: return <HomeView listings={listings} setView={setView} onSeed={handleSeedData} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <nav className="sticky top-0 z-40 bg-white border-b border-orange-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center cursor-pointer" onClick={() => setView('home')}>
              <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center mr-3 shadow-orange-200 shadow-lg transform -rotate-3">
                <ShoppingBag className="text-white h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800 tracking-tight">Pasar Malam</h1>
                <p className="text-xs text-orange-500 font-medium uppercase tracking-wider">Boardgame</p>
              </div>
            </div>
            
            <div className="hidden md:flex items-center space-x-8">
              <NavItem active={view === 'home'} onClick={() => setView('home')}>Home</NavItem>
              <NavItem active={view === 'explore'} onClick={() => setView('explore')}>Buy, Sell & Trade</NavItem>
              <NavItem active={view === 'auctions'} onClick={() => setView('auctions')}>
                <span className="flex items-center text-orange-600 font-bold"><Gavel className="w-4 h-4 mr-1"/> Lelong</span>
              </NavItem>
            </div>

            <div className="flex items-center space-x-4">
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
                    onClick={handleLogout}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    title="Logout"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => setView('auth')}
                  className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-full shadow-lg shadow-orange-200 transition-all text-sm"
                >
                  Join / Login
                </button>
              )}
              
              <button className="md:hidden p-2 text-slate-500" onClick={() => setView('dashboard')}>
                <Menu className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          </div>
        ) : (
          renderView()
        )}
      </main>

      {notification && (
        <div className={`fixed bottom-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg text-white transform transition-all duration-500 ${notification.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
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
    </div>
  );
}

// --- Sub-Views ---

function AuthView({ onLogin, onCancel }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onLogin(name);
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-orange-100">
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-8 text-white text-center">
          <h2 className="text-3xl font-extrabold mb-2">Join the Party</h2>
          <p className="text-orange-100 opacity-90">Set a display name to start trading.</p>
        </div>
        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Display Name</label>
              <input type="text" required className="w-full p-3 border border-slate-300 rounded-lg" placeholder="e.g. MeepleKing" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <button type="submit" disabled={loading} className="w-full py-3 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-all flex justify-center items-center">
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Start Trading'}
            </button>
          </form>
          <div className="mt-6 text-center space-y-4">
            <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeView({ listings, setView, onSeed }) {
  const auctions = listings.filter(l => l.type === 'WTL');
  const forSale = listings.filter(l => l.type === 'WTS');

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
              <button onClick={() => setView('auctions')} className="px-6 py-3 bg-orange-700 bg-opacity-30 border-2 border-orange-200 border-opacity-30 text-white font-bold rounded-xl flex items-center"><Gavel className="w-5 h-5 mr-2" /> Join Lelong</button>
            </div>
          </div>
          <div className="hidden md:block md:w-1/2 relative h-full min-h-[300px]">
             <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-80 bg-white rotate-6 rounded-lg shadow-2xl flex flex-col p-4">
                <div className="h-40 bg-slate-200 rounded mb-4 overflow-hidden">
                  <img src="https://cf.geekdo-images.com/yLZJCVLlIx4c7eJEWUNJ7w__imagepage/img/yFqG5c5j-76i87yXb8w5q8x-95E=/fit-in/900x600/filters:no_upscale():strip_icc()/pic4458123.jpg" className="w-full h-full object-cover" alt="Boardgame" />
                </div>
                <div className="h-4 w-3/4 bg-slate-100 rounded mb-2"></div>
                <div className="h-4 w-1/2 bg-slate-100 rounded"></div>
                <div className="mt-auto flex justify-between items-center">
                   <span className="text-orange-500 font-bold text-xl">RM 220</span>
                   <div className="w-8 h-8 rounded-full bg-orange-100"></div>
                </div>
             </div>
          </div>
        </div>
      </div>

      {listings.length === 0 && (
         <div className="text-center py-12 bg-white rounded-xl border border-dashed border-orange-200">
            <h3 className="text-xl font-bold text-slate-800 mb-2">The Market is Quiet</h3>
            <p className="text-slate-500 mb-6">Be the first to set up a stall!</p>
            <button onClick={onSeed} className="px-6 py-3 bg-orange-100 text-orange-700 font-bold rounded-full hover:bg-orange-200 transition-colors flex items-center justify-center mx-auto">
              <Database className="w-4 h-4 mr-2" /> Seed Demo Database
            </button>
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
              {forSale.slice(0, 8).map(game => <ListingCard key={game.id} game={game} />)}
            </div>
        </section>
      )}
    </div>
  );
}

function ExploreView({ listings, onSeed }) {
  const [filter, setFilter] = useState('ALL'); 
  const filtered = listings.filter(l => filter === 'ALL' ? l.type !== 'WTL' : l.type === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Marketplace</h2>
          <p className="text-slate-500">Find your next favorite game or convert your shelf of shame to cash.</p>
        </div>
        <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm overflow-x-auto">
          {['ALL', 'WTS', 'WTB', 'WTT'].map(f => (
             <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${filter === f ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {f === 'ALL' ? 'All' : f}
             </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filtered.map(game => <ListingCard key={game.id} game={game} />)}
        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No listings found.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AuctionsView({ listings, onBid }) {
  const auctions = listings.filter(l => l.type === 'WTL');
  return (
    <div className="space-y-6">
      <div className="bg-orange-900 text-orange-50 p-6 rounded-xl flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center"><Gavel className="mr-2" /> Want to Lelong</h2>
          <p className="text-orange-200 opacity-80">Live bidding wars.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {auctions.map(game => <AuctionCard key={game.id} game={game} onBid={onBid} />)}
      </div>
    </div>
  );
}

function DashboardView({ user, myListings, onAdd, onSeed, onDelete, onEdit, onMarkSold }) {
  const [filter, setFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isProcessing, setIsProcessing] = useState(false);

  const counts = {
    ALL: myListings.length,
    WTS: myListings.filter(l => l.type === 'WTS').length,
    WTB: myListings.filter(l => l.type === 'WTB').length,
    WTT: myListings.filter(l => l.type === 'WTT').length,
    WTL: myListings.filter(l => l.type === 'WTL').length,
  };

  const filteredListings = myListings.filter(item => {
    const matchesFilter = filter === 'ALL' || item.type === filter;
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

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} items?`)) return;
    setIsProcessing(true);
    for (const id of selectedIds) {
      const item = myListings.find(i => i.id === id);
      if (item) await onDelete(item);
    }
    setSelectedIds(new Set());
    setIsProcessing(false);
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Sidebar */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 text-center">
           <div className="w-20 h-20 bg-slate-200 rounded-full mx-auto mb-4 overflow-hidden">
             <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}`} alt="Avatar" className="w-full h-full" />
           </div>
           <h3 className="font-bold text-lg">{user.displayName}</h3>
           <p className="text-sm text-slate-500">Member</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-100 font-semibold text-slate-700">Quick Stats</div>
          <div className="p-4 space-y-3">
             <div className="flex justify-between"><span className="text-slate-500">Active</span><span className="font-bold">{myListings.filter(l=>l.type==='WTS' && l.status!=='sold').length}</span></div>
             <div className="flex justify-between"><span className="text-slate-500">Wishlist</span><span className="font-bold">{myListings.filter(l=>l.type==='WTB').length}</span></div>
             <div className="flex justify-between"><span className="text-slate-500">Sold</span><span className="font-bold text-green-600">{myListings.filter(l=>l.status==='sold').length}</span></div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-3 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-2xl font-bold text-slate-800">My Listings</h2>
          <div className="flex gap-2">
             {myListings.length === 0 && (
                <button onClick={onSeed} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium flex items-center transition-all">
                  <Database className="w-5 h-5" />
                </button>
             )}
            <button onClick={onAdd} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium flex items-center shadow-lg transition-all">
              <Plus className="w-5 h-5 mr-2" /> Add Game
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
           <div className="flex space-x-2 overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
            {['ALL', 'WTS', 'WTB', 'WTT', 'WTL'].map(type => (
              <button key={type} onClick={() => setFilter(type)} className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${filter === type ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                {type === 'ALL' ? 'All' : type} <span className="opacity-70 ml-1">({counts[type]})</span>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
             <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
             <input 
               type="text" 
               placeholder="Search my boardgames..." 
               className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-full text-sm focus:outline-none focus:border-orange-500"
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
             />
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="bg-slate-900 text-white p-3 rounded-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2">
             <span className="text-sm font-bold ml-2">{selectedIds.size} selected</span>
             <div className="flex space-x-2">
                <button onClick={handleBulkMarkSold} disabled={isProcessing} className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded flex items-center">
                   <CheckCircle className="w-3 h-3 mr-1" /> Mark Sold
                </button>
                <button onClick={handleBulkDelete} disabled={isProcessing} className="text-xs bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded flex items-center">
                   <Trash2 className="w-3 h-3 mr-1" /> Delete
                </button>
             </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 min-h-[400px] overflow-hidden">
          {filteredListings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-slate-400">
               <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4"><Filter className="w-8 h-8 text-slate-300" /></div>
               <p className="text-lg font-medium">No items found</p>
            </div>
          ) : (
             <div className="divide-y divide-slate-100">
                {/* Header */}
                <div className="bg-slate-50 p-3 flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                   <div className="w-8 flex justify-center">
                      <button onClick={selectAll}>
                        {selectedIds.size === filteredListings.length && filteredListings.length > 0 ? <CheckSquare className="w-4 h-4 text-orange-500" /> : <Square className="w-4 h-4" />}
                      </button>
                   </div>
                   <div className="flex-1 ml-4">Game Details</div>
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
                      <div className="flex-1 ml-4 flex items-center space-x-4">
                         <div className="w-12 h-12 bg-slate-200 rounded-md overflow-hidden flex-shrink-0 relative">
                           {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400 text-xs">No Img</div>}
                         </div>
                         <div>
                            <div className="flex items-center space-x-2">
                               <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${item.type === 'WTL' ? 'bg-purple-100 text-purple-700' : item.type === 'WTS' ? 'bg-orange-100 text-orange-700' : item.type === 'WTT' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'}`}>
                                 {item.type}
                               </span>
                               {item.openForTrade && item.type === 'WTS' && <span className="text-[10px] bg-teal-50 text-teal-600 px-1.5 py-0.5 rounded border border-teal-100">Trade Open</span>}
                               <h4 className={`font-bold text-sm ${item.status === 'sold' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{item.title}</h4>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                               {item.type === 'WTL' ? `Bid: RM ${item.currentBid}` : `RM ${item.price}`} • Cond: {item.condition}
                            </p>
                         </div>
                      </div>
                      <div className="hidden sm:block w-32 text-right mr-4">
                         <span className={`text-xs font-bold px-2 py-1 rounded-full ${item.status === 'sold' ? 'bg-slate-200 text-slate-600' : 'bg-green-100 text-green-700'}`}>
                           {item.status === 'sold' ? 'SOLD' : 'ACTIVE'}
                         </span>
                      </div>
                      <div className="w-24 flex justify-center space-x-1">
                         <button onClick={() => onMarkSold(item)} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded" title="Toggle Sold">
                           {item.status === 'sold' ? <Repeat className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                         </button>
                         <button onClick={() => onEdit(item)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                           <Pencil className="w-4 h-4" />
                         </button>
                         <button onClick={() => onDelete(item)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                           <Trash2 className="w-4 h-4" />
                         </button>
                      </div>
                   </div>
                ))}
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Multi-Item Modal ---

function AddGameModal({ onClose, onAdd, initialData }) {
  const [step, setStep] = useState(initialData ? 'edit-single' : 'select-type'); 
  const [detectedItems, setDetectedItems] = useState([]);
  const [currentItemIndex, setCurrentItemIndex] = useState(null); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    type: 'WTS',
    title: '',
    price: '',
    condition: 8.0,
    images: [],
    image: '', 
    description: '',
    openForTrade: false,
    bggId: null
  });
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inputText, setInputText] = useState(''); 
  const [searchResults, setSearchResults] = useState([]);
  const [bggQuery, setBggQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
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
        setErrorMsg("Game Title is compulsory.");
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

  const handleMultiImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    files.forEach(async (file) => {
        const compressed = await resizeImage(file);
        setFormData(prev => {
          const newImages = [...(prev.images || []), compressed];
          return { ...prev, images: newImages, image: newImages[0] };
        });
    });
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

  const handleAIPhotoScan = (e) => {
    const file = e.target.files[0];
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
        
        setDetectedItems(itemsWithImg);
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

  const handleTextAnalysis = async () => {
    if (!inputText) return;
    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const res = await api.post('/ai/parse-text', { text: inputText });
      const items = res.data;
      const formatted = (Array.isArray(items) ? items : [items]).map(i => ({...i, type: formData.type || 'WTS', images: [], image: '', openForTrade: false}));
      
      setDetectedItems(formatted);
      setStep('review');
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to parse text.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleQuickList = () => {
     if (!inputText) return;
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
     setDetectedItems(items);
     setStep('review');
  }

  // --- BGG Logic (Proxied to Backend) ---

  const handleBGGSearch = async (q) => {
    if (!q || q.length < 3) return;
    setBggQuery(q); // Track query
    try {
      const res = await api.get(`/bgg/search?q=${encodeURIComponent(q)}`);
      setSearchResults(res.data);
    } catch (e) { console.error(e); }
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

  // --- Render Steps ---

  const renderEditForm = () => (
    <form onSubmit={handleSingleSave} className="space-y-4">
      {/* Type & Price Row */}
      <div className="grid grid-cols-2 gap-4">
         <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
            <select className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
               <option value="WTS">Sell (WTS)</option>
               <option value="WTB">Buy (WTB)</option>
               <option value="WTT">Trade (WTT)</option>
            </select>
         </div>
         <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Price (RM) {formData.type !== 'WTB' && <span className="text-red-500">*</span>}</label>
            <input 
              type="text" 
              inputMode="numeric" 
              required={formData.type !== 'WTB'}
              className="w-full p-2 border border-slate-300 rounded-lg" 
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
        <div className="flex items-center space-x-2 bg-teal-50 p-2 rounded border border-teal-100">
           <input type="checkbox" id="openForTrade" checked={formData.openForTrade} onChange={e => setFormData({...formData, openForTrade: e.target.checked})} className="rounded text-teal-600 focus:ring-teal-500" />
           <label htmlFor="openForTrade" className="text-sm font-medium text-teal-700">Open for Trade?</label>
        </div>
      )}

      <div>
         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Game Title <span className="text-red-500">*</span></label>
         <input type="text" required className="w-full p-2 border border-slate-300 rounded-lg" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
      </div>

      <div>
         <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Photos {formData.type === 'WTB' ? "(Optional)" : ""}</label>
         <div className="flex gap-2 overflow-x-auto pb-2">
            <button type="button" onClick={() => multiImgRef.current?.click()} className="w-20 h-20 flex-shrink-0 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:border-orange-500 hover:text-orange-500 transition-colors">
               <Plus className="w-6 h-6" />
               <span className="text-[10px] mt-1">Add</span>
            </button>
            <input type="file" multiple ref={multiImgRef} hidden accept="image/*" onChange={handleMultiImageUpload} />
            
            {formData.images?.map((img, idx) => (
               <div key={idx} className="relative w-20 h-20 flex-shrink-0 group">
                  <img src={img} className={`w-full h-full object-cover rounded-lg border-2 ${idx === 0 ? 'border-orange-500' : 'border-transparent'}`} />
                  {idx === 0 && <span className="absolute bottom-0 left-0 right-0 bg-orange-500 text-white text-[8px] text-center font-bold">COVER</span>}
                  <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1">
                     {idx !== 0 && <button type="button" onClick={() => setCoverImage(idx)} className="text-white hover:text-orange-300" title="Make Cover"><CheckCircle className="w-4 h-4" /></button>}
                     <button type="button" onClick={() => removeImage(idx)} className="text-white hover:text-red-300"><XCircle className="w-4 h-4" /></button>
                  </div>
               </div>
            ))}
         </div>
         <button type="button" onClick={fetchCoverFromBGG} disabled={isAnalyzing} className="text-xs text-blue-600 hover:text-blue-800 flex items-center mt-1">
            {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin mr-1"/> : <Globe className="w-3 h-3 mr-1"/>}
            Search BGG for Cover Art
         </button>
      </div>

      <div>
         <div className="flex justify-between mb-1">
           <label className="block text-xs font-bold text-slate-500 uppercase">Condition (1.0 - 10.0)</label>
           <span className={`text-xs font-bold ${formData.condition >= 9 ? 'text-green-600' : formData.condition >= 7 ? 'text-blue-600' : 'text-orange-600'}`}>{Number(formData.condition).toFixed(1)}</span>
         </div>
         <input type="range" min="1" max="10" step="0.5" className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500" value={formData.condition} onChange={e => setFormData({...formData, condition: e.target.value})} />
         <div className="text-[10px] text-slate-500 mt-1 font-medium text-center bg-slate-50 p-1 rounded">
            {getConditionText(Number(formData.condition))}
         </div>
      </div>

      <div>
         <div className="flex justify-between mb-1">
            <label className="block text-xs font-bold text-slate-500 uppercase">Description</label>
            <button type="button" onClick={handleGenerateDescription} disabled={isAnalyzing} className="text-[10px] text-purple-600 flex items-center hover:underline"><Wand2 className="w-3 h-3 mr-1"/> Auto-write</button>
         </div>
         <textarea className="w-full p-2 border border-slate-300 rounded-lg h-24 text-sm" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
      </div>

      <div className="pt-4 flex justify-between">
         <button type="button" onClick={() => initialData ? onClose() : (detectedItems.length > 0 ? setStep('review') : setStep('select-method'))} className="text-slate-500">Cancel</button>
         <button type="submit" disabled={isSubmitting} className="bg-slate-900 text-white px-6 py-2 rounded-lg font-bold hover:bg-slate-800 flex items-center">
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {initialData ? 'Update' : (detectedItems.length > 0 ? 'Save to List' : 'Post Now')}
         </button>
      </div>
    </form>
  );

  const renderSelectMethod = () => (
    <div className="space-y-6">
      <div className="flex items-center mb-4">
         <button onClick={() => setStep('select-type')} className="text-slate-400 hover:text-slate-600 mr-4"><ArrowLeft className="w-5 h-5"/></button>
         <h4 className="text-lg font-medium text-slate-700">How to add?</h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button onClick={() => { setStep('bgg-search'); }} className="p-4 border-2 border-slate-100 hover:border-green-500 rounded-xl text-left transition-all relative group">
          <Globe className="w-8 h-8 text-green-500 mb-3 group-hover:scale-110 transition-transform" />
          <div className="font-bold text-slate-800">BGG Database</div>
          <div className="text-xs text-slate-500 mt-1">Search & Auto-fill</div>
        </button>

        <button onClick={() => document.getElementById('ai-scan-input').click()} className="p-4 border-2 border-slate-100 hover:border-purple-500 rounded-xl text-left transition-all relative overflow-hidden group">
          <div className="absolute top-2 right-2 bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full">MULTI</div>
          <Camera className="w-8 h-8 text-purple-500 mb-3 group-hover:scale-110 transition-transform" />
          <div className="font-bold text-slate-800">AI Photo Scan</div>
          <div className="text-xs text-slate-500 mt-1">Upload Game Stack</div>
          <input id="ai-scan-input" type="file" className="hidden" onChange={handleAIPhotoScan} accept="image/*" />
        </button>

        {formData.type === 'WTB' ? (
           <button onClick={() => { setStep('text-parser'); }} className="p-4 border-2 border-slate-100 hover:border-blue-500 rounded-xl text-left transition-all relative group">
             <div className="absolute top-2 right-2 bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">MULTI</div>
             <ListPlus className="w-8 h-8 text-blue-500 mb-3 group-hover:scale-110 transition-transform" />
             <div className="font-bold text-slate-800">Quick List</div>
             <div className="text-xs text-slate-500 mt-1">Type multiple titles</div>
           </button>
        ) : (
           <button onClick={() => { setStep('text-parser'); }} className="p-4 border-2 border-slate-100 hover:border-blue-500 rounded-xl text-left transition-all relative group">
             <div className="absolute top-2 right-2 bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">MULTI</div>
             <Facebook className="w-8 h-8 text-blue-500 mb-3 group-hover:scale-110 transition-transform" />
             <div className="font-bold text-slate-800">Smart Parser</div>
             <div className="text-xs text-slate-500 mt-1">Paste bulk sell list</div>
           </button>
        )}
      </div>
      <div className="text-center pt-2">
        <button onClick={() => { setStep('edit-single'); }} className="text-sm font-bold text-slate-500 hover:text-orange-600 flex items-center justify-center mx-auto">
           Or enter manually <Pencil className="w-3 h-3 ml-1" />
        </button>
      </div>
    </div>
  );

  const renderReviewList = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-bold text-slate-700">Review Items ({detectedItems.length})</h4>
        <button onClick={() => { setFormData({type: formData.type || 'WTS', condition:8.0, images:[]}); setCurrentItemIndex(-1); setStep('edit-single'); }} className="text-xs flex items-center bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-full"><Plus className="w-3 h-3 mr-1"/> Add Another</button>
      </div>
      <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-2">
        {detectedItems.map((item, idx) => (
          <div key={idx} className="flex gap-3 p-3 border border-slate-200 rounded-lg hover:border-orange-300 transition-colors bg-white">
            <div className="w-16 h-16 bg-slate-100 rounded-md flex-shrink-0 overflow-hidden">
              {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">No Img</div>}
            </div>
            <div className="flex-1 min-w-0">
              <h5 className="font-bold text-slate-800 truncate">{item.title || "Unknown Title"}</h5>
              <div className="flex items-center text-xs text-slate-500 mt-1 space-x-2">
                <span className="bg-slate-100 px-1.5 py-0.5 rounded">RM {item.price || 0}</span>
                <span className={`px-1.5 py-0.5 rounded ${item.condition >= 8 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>Cond: {item.condition}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 justify-center">
              <button onClick={() => { setFormData(item); setCurrentItemIndex(idx); setStep('edit-single'); }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => setDetectedItems(detectedItems.filter((_, i) => i !== idx))} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <div className="pt-4 flex justify-between border-t border-slate-100">
        <button onClick={() => setStep('select-method')} className="text-slate-500 hover:text-slate-800">Back</button>
        <button onClick={handleProcessItems} disabled={detectedItems.length === 0 || isSubmitting} className="bg-orange-500 text-white px-6 py-2 rounded-lg font-bold hover:bg-orange-600 flex items-center">
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Confirm ${detectedItems.length} Listings`}
        </button>
      </div>
    </div>
  );

  const renderSelectType = () => (
    <div className="space-y-6 text-center">
      <h4 className="text-lg font-medium text-slate-700">What is your goal?</h4>
      <div className="grid grid-cols-3 gap-4">
        {['WTS', 'WTB', 'WTL'].map(t => (
          <button 
            key={t}
            onClick={() => { 
                if (t === 'WTL') return; 
                setFormData(prev => ({...prev, type: t})); 
                setStep('select-method'); 
            }}
            disabled={t === 'WTL'}
            className={`p-6 rounded-2xl border-2 transition-all shadow-sm ${
                t === 'WTL' 
                ? 'opacity-50 cursor-not-allowed border-slate-100 bg-slate-50'
                : t==='WTS'?'border-orange-200 bg-orange-50 hover:border-orange-500 hover:shadow-md hover:-translate-y-1'
                : 'border-blue-200 bg-blue-50 hover:border-blue-500 hover:shadow-md hover:-translate-y-1'
            }`}
          >
            <div className={`text-2xl font-black mb-2 ${t==='WTS'?'text-orange-600':t==='WTB'?'text-blue-600':'text-slate-400'}`}>{t}</div>
            <div className="text-xs text-slate-500 font-medium">
              {t==='WTS'?'Sell Game':t==='WTB'?'Buy Game':'Auction (Soon)'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <h3 className="text-xl font-bold text-slate-800">
            {step === 'select-type' ? 'List Boardgames' : step === 'select-method' ? 'Choose Method' : step === 'review' ? 'Review Detected' : 'Game Details'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
        </div>
        <div className="p-6">
          {isAnalyzing && (
            <div className="flex flex-col items-center justify-center py-12">
              <Sparkles className="w-12 h-12 text-purple-500 animate-spin mb-4" />
              <p className="text-purple-700 font-bold">Analyzing...</p>
            </div>
          )}
          {!isAnalyzing && (
            <>
              {step === 'select-type' && renderSelectType()}
              {step === 'select-method' && renderSelectMethod()}
              {step === 'review' && renderReviewList()}
              {step === 'edit-single' && renderEditForm()}
              
              {step === 'text-parser' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-700 mb-2">
                    {formData.type === 'WTB' ? "Tip: Enter one game title per line." : "Tip: Paste your full selling post from Facebook or WhatsApp."}
                  </div>
                  <textarea className="w-full p-3 border border-slate-300 rounded-lg h-40 text-sm" placeholder={formData.type === 'WTB' ? "Catan\nWingspan\nRoot" : "Selling these boardgames..."} value={inputText} onChange={e => setInputText(e.target.value)}></textarea>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setStep('select-method')} className="px-4 py-2 text-slate-500">Back</button>
                    {formData.type === 'WTB' ? (
                       <button onClick={handleQuickList} disabled={!inputText} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center">
                         Create List
                       </button>
                    ) : (
                       <button onClick={handleTextAnalysis} disabled={!inputText} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center">
                         <Sparkles className="w-4 h-4 mr-2" /> Parse Text
                       </button>
                    )}
                  </div>
                </div>
              )}

              {step === 'bgg-search' && (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                    <input type="text" placeholder="Search BoardGameGeek..." className="w-full pl-10 p-3 border border-slate-300 rounded-lg" onChange={e => handleBGGSearch(e.target.value)} autoFocus />
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {searchResults.map(g => (
                      <div key={g.id} onClick={() => selectBGGGame(g)} className="flex items-center p-2 hover:bg-slate-50 cursor-pointer rounded border border-transparent hover:border-slate-200">
                        <div className="w-10 h-10 bg-slate-200 rounded mr-3 overflow-hidden flex-shrink-0">
                           {g.image ? <img src={g.image} className="w-full h-full object-cover" /> : null}
                        </div>
                        <div><div className="font-bold text-sm text-slate-800">{g.title}</div><div className="text-xs text-slate-500">{g.year}</div></div>
                      </div>
                    ))}
                    {bggQuery.length > 2 && searchResults.length === 0 && <div className="text-center text-slate-400 text-sm py-4">Searching...</div>}
                  </div>
                  <div className="text-center pt-2"><button onClick={() => setStep('select-method')} className="text-sm text-slate-400 hover:text-slate-600">Back</button></div>
                </div>
              )}
            </>
          )}
          {errorMsg && <div className="mt-4 p-3 bg-red-50 text-red-600 rounded text-sm">{errorMsg}</div>}
        </div>
      </div>
    </div>
  );
}

// --- Cards ---

function ListingCard({ game }) {
  const isWTS = game.type === 'WTS';
  const isWTB = game.type === 'WTB';
  const isWTT = game.type === 'WTT';

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-slate-100 group relative">
      <div className="relative h-48 bg-slate-200 overflow-hidden">
        {game.image ? <img src={game.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400"><ImageIcon className="w-8 h-8" /></div>}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
           <span className={`px-2 py-1 text-xs font-bold rounded-md shadow-sm uppercase ${isWTS ? 'bg-orange-500 text-white' : isWTT ? 'bg-teal-500 text-white' : 'bg-blue-500 text-white'}`}>{game.type}</span>
           {game.openForTrade && isWTS && <span className="px-2 py-1 text-[10px] font-bold rounded-md shadow-sm bg-teal-500 text-white flex items-center"><RefreshCw className="w-3 h-3 mr-1" /> Trade</span>}
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-slate-800 line-clamp-1">{game.title}</h3>
        <div className="flex items-baseline mb-2"><span className="text-slate-400 text-xs mr-1">RM</span><span className="text-xl font-bold">{game.price}</span></div>
        <div className="flex items-center text-xs text-slate-500 space-x-2 mb-4">
           <span className="bg-slate-100 px-2 py-1 rounded">Cond: {game.condition}</span>
        </div>
        <button className="w-full py-2 border rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50">{isWTB ? 'Offer Game' : isWTT ? 'Propose Trade' : 'Contact'}</button>
      </div>
    </div>
  );
}

function AuctionCard({ game, onBid }) {
  const [isBidding, setIsBidding] = useState(false);
  const handleBid = async () => { setIsBidding(true); await onBid(game.id, game.currentBid || game.price); setIsBidding(false); };
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-lg border border-orange-100">
      <div className="relative h-56 bg-slate-800">
        <img src={game.image} className="w-full h-full object-cover opacity-80" />
        <div className="absolute top-0 right-0 bg-red-600 text-white text-xs font-bold px-3 py-1 m-2 rounded animate-pulse">LIVE</div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
           <div className="flex items-center text-orange-300 text-sm font-mono mb-1"><Clock className="w-4 h-4 mr-1" /> 23:59:59</div>
           <h3 className="text-white font-bold text-xl drop-shadow-md">{game.title}</h3>
        </div>
      </div>
      <div className="p-5">
        <div className="flex justify-between items-end mb-4">
          <div><p className="text-xs text-slate-500 font-bold">Current Bid</p><div className="flex items-baseline text-slate-800"><span className="text-sm mr-1">RM</span><span className="text-3xl font-extrabold">{game.currentBid || game.price}</span></div></div>
          <div className="text-right text-xs text-slate-500">{game.bidCount || 0} bids</div>
        </div>
        <button onClick={handleBid} disabled={isBidding} className="w-full py-3 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 disabled:opacity-50 flex justify-center">{isBidding ? <Loader2 className="animate-spin" /> : `Bid RM ${(game.currentBid||0)+5}`}</button>
      </div>
    </div>
  );
}

function NavItem({ active, children, onClick }) {
  return <div onClick={onClick} className={`cursor-pointer px-1 py-1 border-b-2 text-sm font-medium transition-colors ${active ? 'border-orange-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-orange-500'}`}>{children}</div>;
}
