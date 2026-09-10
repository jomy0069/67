const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: "include",
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(data?.error || data || "Request failed");
  }

  return data;
}

export const api = {
  register: (username, password) =>
    request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),

  login: (username, password) =>
    request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  feed: () => request("/feed"),
  mapPosts: () => request("/posts/map"),

  searchUsers: (query) =>
    request(`/users/search?q=${encodeURIComponent(query)}`),

  follow: (userId) =>
    request(`/users/${userId}/follow`, { method: "POST" }),

  unfollow: (userId) =>
    request(`/users/${userId}/follow`, { method: "DELETE" }),

  upload: (formData) =>
    request("/posts", {
      method: "POST",
      body: formData,
    }),
};

export function imageUrl(path) {
  return path;
}
