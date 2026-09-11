import React from "react";
import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { api, imageUrl } from "./api";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const DEFAULT_CENTER = [59.9139, 10.7522];

function FocusMap({ focus }) {
  const map = useMap();

  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], 14, { duration: 0.7 });
  }, [focus, map]);

  return null;
}

function LocationPicker({ value, onChange }) {
  useMapEvents({
    click(e) {
      onChange([e.latlng.lat, e.latlng.lng]);
    },
  });
  return value ? <Marker position={value} /> : null;
}

function Auth({ onLoggedIn }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const user =
        mode === "login"
          ? await api.login(username, password)
          : await api.register(username, password);
      onLoggedIn(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>MapPhoto</h1>
        <p className="muted">Photos. People. Places.</p>

        <form onSubmit={submit}>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={24}
              autoComplete="username"
              required
            />
          </label>

          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              maxLength={128}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </label>

          {error && <div className="error">{error}</div>}

          <button className="primary" disabled={busy}>
            {busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <button className="text-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login"
            ? "New here? Create an account"
            : "Already have an account? Log in"}
        </button>
      </div>
    </main>
  );
}

function Header({ user, page, setPage, onLogout }) {
  return (
    <header className="header">
      <button className="logo" onClick={() => setPage("feed")}>MapPhoto</button>

      <nav>
        <button className={page === "feed" ? "active" : ""} onClick={() => setPage("feed")}>Feed</button>
        <button className={page === "map" ? "active" : ""} onClick={() => setPage("map")}>Map</button>
        <button className={page === "upload" ? "active" : ""} onClick={() => setPage("upload")}>＋</button>
      </nav>

      <div className="account">
        <span>@{user.username}</span>
        <button onClick={onLogout}>Log out</button>
      </div>
    </header>
  );
}

function UserSearch() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setUsers([]);
        return;
      }
      try {
        setUsers(await api.searchUsers(query.trim()));
      } catch (err) {
        setError(err.message);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  async function toggle(user) {
    setError("");
    try {
      if (user.following) await api.unfollow(user.id);
      else await api.follow(user.id);

      setUsers((current) =>
        current.map((u) =>
          u.id === user.id ? { ...u, following: !u.following } : u
        )
      );
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="search-box">
      <h3>Find people</h3>
      <input
        placeholder="Search username..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <div className="error">{error}</div>}

      {users.map((user) => (
        <div className="user-row" key={user.id}>
          <span>@{user.username}</span>
          <button onClick={() => toggle(user)}>
            {user.following ? "Following" : "Follow"}
          </button>
        </div>
      ))}
    </section>
  );
}

function Feed({ onShowMap }) {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.feed().then(setPosts).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="content">
      <div className="feed-layout">
        <section>
          <h2>Your feed</h2>

          {error && <div className="error">{error}</div>}

          {!posts.length && !error && (
            <div className="empty">
              Follow someone or upload your first photo.
            </div>
          )}

          <div className="feed">
            {posts.map((post) => (
              <article className="post" key={post.id}>
                <div className="post-head">
                  <strong>@{post.username}</strong>
                  <span>{new Date(post.created_at).toLocaleString()}</span>
                </div>

                <img src={imageUrl(post.image_url)} alt="" loading="lazy" />

                <button
                  className="location-button"
                  onClick={() => onShowMap(post.latitude, post.longitude)}
                >
                  View on map
                </button>
              </article>
            ))}
          </div>
        </section>

        <UserSearch />
      </div>
    </div>
  );
}

function MapPage({ focus }) {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    api.mapPosts().then(setPosts).catch(console.error);
  }, []);

  return (
    <div className="map-page">
      <MapContainer center={focus ? [focus.lat, focus.lng] : DEFAULT_CENTER} zoom={focus ? 14 : 5} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FocusMap focus={focus} />

        {posts.map((post) => (
          <Marker key={post.id} position={[post.latitude, post.longitude]}>
            <Popup>
              <div className="popup">
                <strong>@{post.username}</strong>
                <img src={imageUrl(post.image_url)} alt="" loading="lazy" />
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function Upload({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [position, setPosition] = useState(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function selectFile(e) {
    const selected = e.target.files?.[0];
    setFile(selected || null);
    setPreview(selected ? URL.createObjectURL(selected) : "");
  }

  async function submit(e) {
    e.preventDefault();
    setError("");

    if (!file) return setError("Choose an image.");
    if (!position) return setError("Click the map to choose a location.");

    const form = new FormData();
    form.append("image", file);
    form.append("latitude", position[0]);
    form.append("longitude", position[1]);

    setBusy(true);

    try {
      await api.upload(form);
      onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content upload-page">
      <h2>Upload photo</h2>
      <p className="muted">
        Choose a photo and click its location on the map. MapPhoto never asks
        your browser for your location.
      </p>

      <form onSubmit={submit} className="upload-form">
        <label className="file-input">
          Photo
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} />
        </label>

        {preview && <img className="preview" src={preview} alt="Preview" />}

        <div className="picker-map">
          <MapContainer center={DEFAULT_CENTER} zoom={5} scrollWheelZoom>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <LocationPicker value={position} onChange={setPosition} />
          </MapContainer>
        </div>

        {position && (
          <div className="coordinates">
            Selected: {position[0].toFixed(5)}, {position[1].toFixed(5)}
          </div>
        )}

        {error && <div className="error">{error}</div>}

        <button className="primary" disabled={busy}>
          {busy ? "Uploading..." : "Share photo"}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("feed");
  const [focus, setFocus] = useState(null);

  useEffect(() => {
    api.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await api.logout();
    setUser(null);
  }

  function showMap(lat, lng) {
    setFocus({ lat, lng });
    setPage("map");
  }

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Auth onLoggedIn={setUser} />;

  return (
    <>
      <Header user={user} page={page} setPage={setPage} onLogout={logout} />

      {page === "feed" && <Feed onShowMap={showMap} />}
      {page === "map" && <MapPage focus={focus} />}
      {page === "upload" && <Upload onUploaded={() => setPage("feed")} />}
    </>
  );
}
