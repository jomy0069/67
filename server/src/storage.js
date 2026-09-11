import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import path from "path";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const bucket = process.env.SUPABASE_STORAGE_BUCKET || "photos";

export async function uploadImage(buffer, mimeType, originalName) {
  const ext = path.extname(originalName).toLowerCase() || ".jpg";
  const filePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(filePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return { path: filePath, url: data.publicUrl };
}

export async function deleteImage(filePath) {
  if (!filePath) return;
  const { error } = await supabase.storage.from(bucket).remove([filePath]);
  if (error) throw error;
}
