import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");

export async function createUser(username, password) {
  const clean = String(username).trim();
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(clean)) {
    throw new Error("Username must be 3-24 characters: letters, numbers and underscore only.");
  }
  if (password.length < 8 || password.length > 128) throw new Error("Password must be 8-128 characters.");
  const hash = await bcrypt.hash(password, 12);
  try {
    const result = await query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
      [clean, hash]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === "23505") throw new Error("Username is already taken.");
    throw err;
  }
}

export async function verifyUser(username, password) {
  const result = await query(
    "SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER($1)",
    [String(username).trim()]
  );
  const user = result.rows[0];
  if (!user) return null;
  if (!(await bcrypt.compare(password, user.password_hash))) return null;
  return { id: user.id, username: user.username };
}

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), username: user.username }, JWT_SECRET, { expiresIn: "30d" });
}
export function verifyToken(token) { return jwt.verify(token, JWT_SECRET); }
