import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import { api, imageUrl } from "./api";

 delete L.Icon.Default.prototype._getIconUrl;
 L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
 });
const DEFAULT_CENTER = [59.9139, 10.7522];

function FocusMap({ focus }) { const map = useMap(); useEffect(() => { if (focus) map.flyTo([focus.lat, focus.lng], 14, { duration: .7 }); }, [focus, map]); return null; }
function LocationPicker({ value, onChange }) { useMapEvents({ click(e) { onChange([e.latlng.lat, e.latlng.lng]); } }); return value ? <Marker position={value} /> : null; }

function Auth({ onLoggedIn }) {
  const [mode, setMode] = useState("login"), [username, setUsername] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(e) { e.preventDefault(); setError(""); setBusy(true); try { const user = mode === "login" ? await api.login(username, password) : await api.register(username, password); onLoggedIn(user); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <main className="auth-page"><div className="auth-card"><h1>67</h1><p className="muted">Photos. People. Places.</p><form onSubmit={submit}><label>Username<input value={username} onChange={e => setUsername(e.target.value)} minLength={3} maxLength={24} autoComplete="username" required /></label><label>Password<input value={password} onChange={e => setPassword(e.target.value)} minLength={8} maxLength={128} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>{error && <div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}</button></form><button className="text-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}</button></div></main>;
}

function Header({ user, page, setPage, onLogout, onProfile }) {
 return <header className="header"><button className="logo" onClick={() => setPage("feed")}>67</button><nav><button className={page === "feed" ? "active" : ""} onClick={() => setPage("feed")}>Feed</button><button className={page === "map" ? "active" : ""} onClick={() => setPage("map")}>Map</button><button className={page === "upload" ? "active" : ""} onClick={() => setPage("upload")}>＋</button></nav><div className="account"><button className="profile-link" onClick={() => onProfile(user.username)}>@{user.username}</button><button onClick={onLogout}>Log out</button></div></header>;
}

function UserSearch({ onProfile }) {
 const [query, setQuery] = useState(""), [users, setUsers] = useState([]), [error, setError] = useState("");
 useEffect(() => { const timer = setTimeout(async () => { if (query.trim().length < 2) { setUsers([]); return; } try { setUsers(await api.searchUsers(query.trim())); } catch (err) { setError(err.message); } }, 250); return () => clearTimeout(timer); }, [query]);
 async function toggle(user) { setError(""); try { if (user.following) await api.unfollow(user.id); else await api.follow(user.id); setUsers(c => c.map(u => u.id === user.id ? { ...u, following: !u.following } : u)); } catch (err) { setError(err.message); } }
 return <section className="search-box"><h3>Find people</h3><input placeholder="Search username..." value={query} onChange={e => setQuery(e.target.value)} />{error && <div className="error">{error}</div>}{users.map(user => <div className="user-row" key={user.id}><button className="user-name" onClick={() => onProfile(user.username)}>@{user.username}</button><button onClick={() => toggle(user)}>{user.following ? "Following" : "Follow"}</button></div>)}</section>;
}

function PostCard({ post, currentUser, onShowMap, onProfile, onChanged }) {
 const [busy, setBusy] = useState(false);
 async function like() { setBusy(true); try { const result = post.liked ? await api.unlike(post.id) : await api.like(post.id); onChanged(post.id, result); } catch (e) { alert(e.message); } finally { setBusy(false); } }
 async function remove() { if (!confirm("Delete this photo?")) return; setBusy(true); try { await api.deletePost(post.id); onChanged(post.id, null, true); } catch (e) { alert(e.message); } finally { setBusy(false); } }
 return <article className="post"><div className="post-head"><button className="post-user" onClick={() => onProfile(post.username)}>@{post.username}</button><span>{new Date(post.created_at).toLocaleString()}</span></div><img src={imageUrl(post.image_url)} alt="" loading="lazy" /><div className="post-actions"><button className={`like-button ${post.liked ? "liked" : ""}`} onClick={like} disabled={busy}>{post.liked ? "♥" : "♡"} {post.like_count || 0}</button><button className="location-button" onClick={() => onShowMap(post.latitude, post.longitude)}>View on map</button>{post.user_id === currentUser.id && <button className="delete-button" onClick={remove} disabled={busy}>Delete</button>}</div></article>;
}

function Feed({ currentUser, onShowMap, onProfile }) {
 const [posts, setPosts] = useState([]), [error, setError] = useState("");
 useEffect(() => { api.feed().then(setPosts).catch(e => setError(e.message)); }, []);
 function changed(id, result, removed = false) { if (removed) setPosts(c => c.filter(p => p.id !== id)); else setPosts(c => c.map(p => p.id === id ? { ...p, ...result } : p)); }
 return <div className="content"><div className="feed-layout"><section><h2>Your feed</h2>{error && <div className="error">{error}</div>}{!posts.length && !error && <div className="empty">Follow someone or upload your first photo.</div>}<div className="feed">{posts.map(p => <PostCard key={p.id} post={p} currentUser={currentUser} onShowMap={onShowMap} onProfile={onProfile} onChanged={changed} />)}</div></section><UserSearch onProfile={onProfile} /></div></div>;
}

function MapPage({ focus, onProfile }) {
 const [posts, setPosts] = useState([]); useEffect(() => { api.mapPosts().then(setPosts).catch(console.error); }, []);
 return <div className="map-page"><MapContainer center={focus ? [focus.lat, focus.lng] : DEFAULT_CENTER} zoom={focus ? 14 : 5} scrollWheelZoom><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><FocusMap focus={focus} />{posts.map(post => <Marker key={post.id} position={[post.latitude, post.longitude]}><Popup><div className="popup"><button className="post-user" onClick={() => onProfile(post.username)}>@{post.username}</button><img src={imageUrl(post.image_url)} alt="" loading="lazy" /></div></Popup></Marker>)}</MapContainer></div>;
}

function Upload({ onUploaded }) {
 const [file, setFile] = useState(null), [position, setPosition] = useState(null), [preview, setPreview] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
 function selectFile(e) { const selected = e.target.files?.[0]; setFile(selected || null); setPreview(selected ? URL.createObjectURL(selected) : ""); }
 async function submit(e) { e.preventDefault(); setError(""); if (!file) return setError("Choose an image."); if (!position) return setError("Click the map to choose a location."); const form = new FormData(); form.append("image", file); form.append("latitude", position[0]); form.append("longitude", position[1]); setBusy(true); try { await api.upload(form); onUploaded(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
 return <div className="content upload-page"><h2>Upload photo</h2><p className="muted">Choose a photo and click its location on the map. 67 never asks your browser for your location.</p><form onSubmit={submit} className="upload-form"><label className="file-input">Photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} /></label>{preview && <img className="preview" src={preview} alt="Preview" />}<div className="picker-map"><MapContainer center={DEFAULT_CENTER} zoom={5} scrollWheelZoom><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><LocationPicker value={position} onChange={setPosition} /></MapContainer></div>{position && <div className="coordinates">Selected: {position[0].toFixed(5)}, {position[1].toFixed(5)}</div>}{error && <div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy ? "Uploading..." : "Share photo"}</button></form></div>;
}

function UserList({ title, users, onProfile, onFollowChange }) { return <section className="list-panel"><h3>{title}</h3>{!users.length ? <p className="muted">No users yet.</p> : users.map(u => <div className="user-row" key={u.id}><button className="user-name" onClick={() => onProfile(u.username)}>@{u.username}</button><button onClick={async () => { try { if (u.following) await api.unfollow(u.id); else await api.follow(u.id); onFollowChange(u.id); } catch (e) { alert(e.message); } }}>{u.following ? "Following" : "Follow"}</button></div>)}</section>; }

function Profile({ username, currentUser, onProfile, onBack }) {
 const [profile, setProfile] = useState(null), [tab, setTab] = useState("posts"), [list, setList] = useState([]), [error, setError] = useState("");
 useEffect(() => { setError(""); setProfile(null); api.profile(username).then(setProfile).catch(e => setError(e.message)); }, [username]);
 async function toggleFollow() { try { if (profile.following) await api.unfollow(profile.id); else await api.follow(profile.id); setProfile(p => ({ ...p, following: !p.following, follower_count: p.follower_count + (p.following ? -1 : 1) })); } catch (e) { alert(e.message); } }
 async function openList(which) { setTab(which); try { setList(which === "followers" ? await api.followers(username) : await api.following(username)); } catch (e) { setError(e.message); } }
 if (error) return <div className="content"><button className="back-button" onClick={onBack}>← Back</button><div className="error">{error}</div></div>;
 if (!profile) return <div className="loading">Loading...</div>;
 return <div className="content profile-page"><button className="back-button" onClick={onBack}>← Back</button><section className="profile-card"><div className="avatar">{profile.username[0].toUpperCase()}</div><div className="profile-main"><div className="profile-title"><h2>@{profile.username}</h2>{profile.id !== currentUser.id && <button className={profile.following ? "secondary" : "primary small"} onClick={toggleFollow}>{profile.following ? "Following" : "Follow"}</button>}</div><div className="stats"><button onClick={() => setTab("posts")}><strong>{profile.post_count}</strong><span>Posts</span></button><button onClick={() => openList("followers")}><strong>{profile.follower_count}</strong><span>Followers</span></button><button onClick={() => openList("following")}><strong>{profile.following_count}</strong><span>Following</span></button></div></div></section>{tab === "posts" ? <div className="profile-grid">{profile.posts.map(post => <div className="profile-post" key={post.id}><img src={imageUrl(post.image_url)} alt="" />{post.user_id === currentUser.id && <button className="delete-overlay" onClick={async () => { if (!confirm("Delete this photo?")) return; try { await api.deletePost(post.id); setProfile(p => ({ ...p, posts: p.posts.filter(x => x.id !== post.id), post_count: p.post_count - 1 })); } catch(e) { alert(e.message); } }}>Delete</button>}<div className="grid-like">{post.liked ? "♥" : "♡"} {post.like_count || 0}</div></div>)}{!profile.posts.length && <div className="empty">No photos yet.</div>}</div> : <UserList title={tab === "followers" ? "Followers" : "Following"} users={list} onProfile={onProfile} onFollowChange={id => setList(c => c.map(u => u.id === id ? { ...u, following: !u.following } : u))} />}</div>;
}

export default function App() {
 const [user, setUser] = useState(null), [loading, setLoading] = useState(true), [page, setPage] = useState("feed"), [focus, setFocus] = useState(null), [profile, setProfile] = useState(null);
 useEffect(() => { api.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false)); }, []);
 async function logout() { await api.logout(); setUser(null); }
 function showMap(lat, lng) { setFocus({ lat, lng }); setPage("map"); setProfile(null); }
 function showProfile(username) { setProfile(username); }
 if (loading) return <div className="loading">Loading...</div>;
 if (!user) return <Auth onLoggedIn={setUser} />;
 return <><Header user={user} page={page} setPage={p => { setPage(p); setProfile(null); }} onLogout={logout} onProfile={showProfile} />{profile ? <Profile username={profile} currentUser={user} onProfile={showProfile} onBack={() => setProfile(null)} /> : page === "feed" ? <Feed currentUser={user} onShowMap={showMap} onProfile={showProfile} /> : page === "map" ? <MapPage focus={focus} onProfile={showProfile} /> : <Upload onUploaded={() => setPage("feed")} />}</>;
}
