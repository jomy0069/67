import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { query } from "./db.js";
import { createUser, verifyUser, signToken, verifyToken } from "./auth.js";
import { uploadImage, deleteImage } from "./storage.js";

const app = express();
app.set("trust proxy", 1);
const PORT = Number(process.env.PORT || 3001);
if (!process.env.CLIENT_ORIGIN) throw new Error("CLIENT_ORIGIN is required.");
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase environment variables are required.");

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "50kb" }));
app.use(cookieParser());

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: "draft-8", legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
app.use("/api", apiLimiter);

function setAuthCookie(res, token) {
  res.cookie("mapphoto_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 60 * 24 * 30,
    path: "/",
  });
}
function clearAuthCookie(res) {
  res.clearCookie("mapphoto_token", { httpOnly: true, secure: true, sameSite: "none", path: "/" });
}
function requireAuth(req, res, next) {
  try {
    // Prefer the Authorization header so mobile browsers do not need to allow
    // third-party cookies between Vercel and Render. Keep the cookie as a fallback.
    const auth = req.get("authorization") || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const token = bearer || req.cookies.mapphoto_token;
    if (!token) return res.status(401).json({ error: "You must be logged in." });
    req.userId = Number(verifyToken(token).sub);
    next();
  } catch { res.status(401).json({ error: "You must be logged in." });
  }
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const publicImageBase = `${process.env.SUPABASE_URL}/storage/v1/object/public/${process.env.SUPABASE_STORAGE_BUCKET || "photos"}`;
const postSelect = `
  SELECT p.id, p.user_id, p.latitude, p.longitude, p.created_at, p.image_path,
         u.username,
         COUNT(l.post_id)::int AS like_count,
         EXISTS(SELECT 1 FROM likes ml WHERE ml.post_id = p.id AND ml.user_id = $1) AS liked
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN likes l ON l.post_id = p.id
`;
function formatPosts(rows) { return rows.map(r => ({ ...r, image_url: `${publicImageBase}/${r.image_path}` })); }

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const user = await createUser(String(req.body.username || ""), String(req.body.password || ""));
    const token = signToken(user);
    setAuthCookie(res, token);
    res.status(201).json({ ...user, token });
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const user = await verifyUser(String(req.body.username || ""), String(req.body.password || ""));
    if (!user) return res.status(401).json({ error: "Invalid username or password." });
    setAuthCookie(res, signToken(user));
    res.json({ ...user, token: signToken(user) });
  } catch { res.status(500).json({ error: "Login failed." }); }
});
app.post("/api/auth/logout", (req, res) => { clearAuthCookie(res); res.json({ ok: true }); });
app.get("/api/auth/me", requireAuth, async (req, res) => {
  const r = await query("SELECT id, username FROM users WHERE id = $1", [req.userId]);
  if (!r.rows[0]) return res.status(401).json({ error: "Not logged in." });
  res.json(r.rows[0]);
});

app.get("/api/users/search", requireAuth, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json([]);
  const r = await query(`
    SELECT u.id, u.username,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = u.id) AS following
    FROM users u WHERE u.username ILIKE $2 AND u.id <> $1 ORDER BY u.username LIMIT 20
  `, [req.userId, `%${q}%`]);
  res.json(r.rows);
});

app.get("/api/users/:username/profile", requireAuth, async (req, res) => {
  const r = await query(`
    SELECT u.id, u.username, u.created_at,
      (SELECT COUNT(*)::int FROM posts p WHERE p.user_id = u.id) AS post_count,
      (SELECT COUNT(*)::int FROM follows f WHERE f.following_id = u.id) AS follower_count,
      (SELECT COUNT(*)::int FROM follows f WHERE f.follower_id = u.id) AS following_count,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = u.id) AS following
    FROM users u WHERE LOWER(u.username) = LOWER($2)
  `, [req.userId, req.params.username]);
  if (!r.rows[0]) return res.status(404).json({ error: "User not found." });
  const user = r.rows[0];
  const posts = await query(`${postSelect} WHERE p.user_id = $2 GROUP BY p.id, u.id ORDER BY p.created_at DESC`, [req.userId, user.id]);
  res.json({ ...user, posts: formatPosts(posts.rows) });
});

app.get("/api/users/:username/followers", requireAuth, async (req, res) => {
  const r = await query(`
    SELECT u.id, u.username, EXISTS(SELECT 1 FROM follows x WHERE x.follower_id = $1 AND x.following_id = u.id) AS following
    FROM follows f JOIN users u ON u.id = f.follower_id
    WHERE f.following_id = (SELECT id FROM users WHERE LOWER(username)=LOWER($2)) ORDER BY u.username
  `, [req.userId, req.params.username]);
  res.json(r.rows);
});
app.get("/api/users/:username/following", requireAuth, async (req, res) => {
  const r = await query(`
    SELECT u.id, u.username, EXISTS(SELECT 1 FROM follows x WHERE x.follower_id = $1 AND x.following_id = u.id) AS following
    FROM follows f JOIN users u ON u.id = f.following_id
    WHERE f.follower_id = (SELECT id FROM users WHERE LOWER(username)=LOWER($2)) ORDER BY u.username
  `, [req.userId, req.params.username]);
  res.json(r.rows);
});

app.post("/api/users/:id/follow", requireAuth, async (req, res) => {
  const target = Number(req.params.id);
  if (!Number.isInteger(target) || target === req.userId) return res.status(400).json({ error: "Invalid user." });
  const exists = await query("SELECT id FROM users WHERE id = $1", [target]);
  if (!exists.rows[0]) return res.status(404).json({ error: "User not found." });
  await query("INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [req.userId, target]);
  res.json({ following: true });
});
app.delete("/api/users/:id/follow", requireAuth, async (req, res) => {
  await query("DELETE FROM follows WHERE follower_id = $1 AND following_id = $2", [req.userId, Number(req.params.id)]);
  res.json({ following: false });
});

app.post("/api/posts", requireAuth, uploadLimiter, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Image is required." });
    const detected = await fileTypeFromBuffer(req.file.buffer);
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!detected || !allowed.has(detected.mime)) return res.status(400).json({ error: "Only valid JPG, PNG and WebP images are allowed." });
    const latitude = Number(req.body.latitude), longitude = Number(req.body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: "Invalid map location." });
    }
    const image = await uploadImage(req.file.buffer, detected.mime, req.file.originalname);
    const r = await query(`INSERT INTO posts (user_id, image_path, latitude, longitude) VALUES ($1,$2,$3,$4) RETURNING id, latitude, longitude, created_at`, [req.userId, image.path, latitude, longitude]);
    res.status(201).json({ ...r.rows[0], image_url: image.url });
  } catch (err) { console.error(err); res.status(400).json({ error: "Image upload failed." }); }
});

app.delete("/api/posts/:id", requireAuth, async (req, res) => {
  const r = await query("DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING image_path", [Number(req.params.id), req.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: "Post not found or you do not own it." });
  try { await deleteImage(r.rows[0].image_path); } catch (err) { console.error("Storage delete failed", err); }
  res.json({ ok: true });
});

app.post("/api/posts/:id/like", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const exists = await query("SELECT id FROM posts WHERE id = $1", [id]);
  if (!exists.rows[0]) return res.status(404).json({ error: "Post not found." });
  await query("INSERT INTO likes (post_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, req.userId]);
  const r = await query("SELECT COUNT(*)::int AS like_count FROM likes WHERE post_id = $1", [id]);
  res.json({ liked: true, like_count: r.rows[0].like_count });
});
app.delete("/api/posts/:id/like", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  await query("DELETE FROM likes WHERE post_id = $1 AND user_id = $2", [id, req.userId]);
  const r = await query("SELECT COUNT(*)::int AS like_count FROM likes WHERE post_id = $1", [id]);
  res.json({ liked: false, like_count: r.rows[0]?.like_count || 0 });
});

app.get("/api/feed", requireAuth, async (req, res) => {
  const r = await query(`${postSelect} JOIN follows f ON f.following_id = p.user_id WHERE f.follower_id = $1 GROUP BY p.id, u.id ORDER BY p.created_at DESC LIMIT 100`, [req.userId]);
  res.json(formatPosts(r.rows));
});
app.get("/api/posts/map", requireAuth, async (req, res) => {
  const r = await query(`${postSelect} JOIN follows f ON f.following_id = p.user_id WHERE f.follower_id = $1 GROUP BY p.id, u.id ORDER BY p.created_at DESC LIMIT 1000`, [req.userId]);
  res.json(formatPosts(r.rows));
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: "Image must be 10 MB or smaller." });
  console.error(err); res.status(500).json({ error: "Something went wrong." });
});
app.listen(PORT, () => console.log(`67 API running on port ${PORT}`));
