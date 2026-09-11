import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { query } from "./db.js";
import {
  createUser,
  verifyUser,
  signToken,
  verifyToken,
} from "./auth.js";
import { uploadImage } from "./storage.js";

const app = express();
app.set("trust proxy", 1);
const PORT = Number(process.env.PORT || 3001);

if (!process.env.CLIENT_ORIGIN) throw new Error("CLIENT_ORIGIN is required.");
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Supabase environment variables are required.");
}

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN,
  credentials: true,
}));
app.use(express.json({ limit: "50kb" }));
app.use(cookieParser());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

app.use("/api", apiLimiter);

function setAuthCookie(res, token) {
  res.cookie("mapphoto_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 30,
    path: "/",
  });
}

function requireAuth(req, res, next) {
  try {
    const token = req.cookies.mapphoto_token;
    if (!token) return res.status(401).json({ error: "You must be logged in." });

    const payload = verifyToken(token);
    req.userId = Number(payload.sub);
    next();
  } catch {
    res.status(401).json({ error: "You must be logged in." });
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const user = await createUser(
      String(req.body.username || ""),
      String(req.body.password || "")
    );
    setAuthCookie(res, signToken(user));
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const user = await verifyUser(
      String(req.body.username || ""),
      String(req.body.password || "")
    );

    if (!user) return res.status(401).json({ error: "Invalid username or password." });

    setAuthCookie(res, signToken(user));
    res.json(user);
  } catch {
    res.status(500).json({ error: "Login failed." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("mapphoto_token", { httpOnly: true, sameSite: "lax", path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const result = await query("SELECT id, username FROM users WHERE id = $1", [req.userId]);
  if (!result.rows[0]) return res.status(401).json({ error: "Not logged in." });
  res.json(result.rows[0]);
});

app.get("/api/users/search", requireAuth, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json([]);

  const result = await query(`
    SELECT
      u.id,
      u.username,
      EXISTS(
        SELECT 1 FROM follows f
        WHERE f.follower_id = $1 AND f.following_id = u.id
      ) AS following
    FROM users u
    WHERE u.username ILIKE $2
      AND u.id <> $1
    ORDER BY u.username
    LIMIT 20
  `, [req.userId, `%${q}%`]);

  res.json(result.rows);
});

app.post("/api/users/:id/follow", requireAuth, async (req, res) => {
  const target = Number(req.params.id);

  if (!Number.isInteger(target)) return res.status(400).json({ error: "Invalid user." });
  if (target === req.userId) return res.status(400).json({ error: "You cannot follow yourself." });

  const exists = await query("SELECT id FROM users WHERE id = $1", [target]);
  if (!exists.rows[0]) return res.status(404).json({ error: "User not found." });

  await query(
    "INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [req.userId, target]
  );

  res.json({ following: true });
});

app.delete("/api/users/:id/follow", requireAuth, async (req, res) => {
  await query(
    "DELETE FROM follows WHERE follower_id = $1 AND following_id = $2",
    [req.userId, Number(req.params.id)]
  );
  res.json({ following: false });
});

app.post("/api/posts", requireAuth, uploadLimiter, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Image is required." });

    const detected = await fileTypeFromBuffer(req.file.buffer);
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);

    if (!detected || !allowed.has(detected.mime)) {
      return res.status(400).json({ error: "Only valid JPG, PNG and WebP images are allowed." });
    }

    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180
    ) {
      return res.status(400).json({ error: "Invalid map location." });
    }

    const image = await uploadImage(
      req.file.buffer,
      detected.mime,
      req.file.originalname
    );

    const result = await query(`
      INSERT INTO posts (user_id, image_path, latitude, longitude)
      VALUES ($1, $2, $3, $4)
      RETURNING id, latitude, longitude, created_at
    `, [req.userId, image.path, latitude, longitude]);

    res.status(201).json({
      ...result.rows[0],
      image_url: image.url,
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Image upload failed." });
  }
});

const publicImageBase =
  `${process.env.SUPABASE_URL}/storage/v1/object/public/${process.env.SUPABASE_STORAGE_BUCKET || "photos"}`;

const postQuery = `
  SELECT
    p.id,
    p.latitude,
    p.longitude,
    p.created_at,
    u.username,
    p.image_path
  FROM posts p
  JOIN users u ON u.id = p.user_id
`;

app.get("/api/feed", requireAuth, async (req, res) => {
  const result = await query(`
    ${postQuery}
    JOIN follows f ON f.following_id = p.user_id
    WHERE f.follower_id = $1
    ORDER BY p.created_at DESC
    LIMIT 100
  `, [req.userId]);

  res.json(result.rows);
});

app.get("/api/posts/map", requireAuth, async (req, res) => {
  const result = await query(`
    ${postQuery}
    JOIN follows f ON f.following_id = p.user_id
    WHERE f.follower_id = $1
    ORDER BY p.created_at DESC
    LIMIT 1000
  `, [req.userId]);

  res.json(result.rows.map((row) => ({
    ...row,
    image_url: `${publicImageBase}/${row.image_path}`,
  })));
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: "Image must be 10 MB or smaller." });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong." });
});

app.listen(PORT, () => {
  console.log(`MapPhoto API running on port ${PORT}`);
});
