# 67 — production-ready

A public photo-sharing social app built with React, Express, PostgreSQL and Supabase Storage.

## Stack
- React + Vite
- React Leaflet + OpenStreetMap
- Express API
- PostgreSQL
- Supabase Storage (public image bucket)
- JWT authentication stored in an HttpOnly cookie
- Helmet, CORS, rate limiting and strict image validation

## 1. Create Supabase resources

Create a Supabase project. In Storage, create a bucket named `photos` and make it public.

Run the SQL in `server/sql/schema.sql` in the Supabase SQL editor.

Get:
- Project URL
- Service role key
- Database connection string

Never expose the service role key in the React app or commit `.env`.

## 2. Server environment

Copy:
```bash
cp server/.env.example server/.env
```

Set:
```env
PORT=3001
NODE_ENV=production
CLIENT_ORIGIN=https://your-domain.example
DATABASE_URL=postgresql://...
JWT_SECRET=use-a-long-random-secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=photos
```

## 3. Local development

Server:
```bash
cd server
npm install
npm run dev
```

Client:
```bash
cd client
npm install
npm run dev
```

For local frontend, use:
```env
VITE_API_URL=http://localhost:3001/api
```

## 4. Production deployment

### Backend
Deploy `server` to Render, Railway, Fly.io, or another Node host.

Set all environment variables from `.env.example`.

### Frontend
Deploy `client` to Vercel, Netlify, Cloudflare Pages, etc.

Build command:
```bash
npm run build
```

Set:
```env
VITE_API_URL=https://your-api-domain.example/api
```

### Database/storage
Use Supabase PostgreSQL and Supabase Storage.

## Security notes
- No browser geolocation API is used.
- Latitude/longitude only come from the point selected by the user on the map.
- Passwords are bcrypt-hashed.
- JWT is kept in an HttpOnly cookie.
- Image uploads are limited to 10 MB and validated by decoded file signature.
- Rate limits are applied to authentication, uploads and general API traffic.
- The service role key is server-only.

## Product behavior
- A new account needs only username and password.
- Feed and map show posts from accounts the current user follows.
- A user manually selects the map point when uploading.
- There is no profile name, email, phone number, or automatic location collection.
