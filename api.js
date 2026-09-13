const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

async function request(path, options = {}) {
  const token = localStorage.getItem("67_token");
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API}${path}`, { credentials: "include", ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data?.error || data || "Request failed");
  return data;
}

export const api = {
  register: async (username, password) => {
    const user = await request("/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    if (user.token) localStorage.setItem("67_token", user.token);
    return user;
  },
  login: async (username, password) => {
    const user = await request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    if (user.token) localStorage.setItem("67_token", user.token);
    return user;
  },
  logout: async () => {
    try { await request("/auth/logout", { method: "POST" }); }
    finally { localStorage.removeItem("67_token"); }
  },
  me: () => request("/auth/me"),
  feed: () => request("/feed"),
  mapPosts: () => request("/posts/map"),
  searchUsers: (query) => request(`/users/search?q=${encodeURIComponent(query)}`),
  profile: (username) => request(`/users/${encodeURIComponent(username)}/profile`),
  followers: (username) => request(`/users/${encodeURIComponent(username)}/followers`),
  following: (username) => request(`/users/${encodeURIComponent(username)}/following`),
  follow: (userId) => request(`/users/${userId}/follow`, { method: "POST" }),
  unfollow: (userId) => request(`/users/${userId}/follow`, { method: "DELETE" }),
  like: (postId) => request(`/posts/${postId}/like`, { method: "POST" }),
  unlike: (postId) => request(`/posts/${postId}/like`, { method: "DELETE" }),
  deletePost: (postId) => request(`/posts/${postId}`, { method: "DELETE" }),
  upload: (formData) => request("/posts", { method: "POST", body: formData }),
};

export function imageUrl(path) { return path; }
