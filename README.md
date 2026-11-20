This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Version 2 setup notes

- **Practice abuse limits**: run `supabase/add_practice_rate_limits.sql` once in the Supabase SQL Editor.
  Until it is applied, `/api/generate-practice` and `/api/check-practice` fall back to a
  best-effort in-memory limiter per server instance. The RPC is called with the server-only
  `SUPABASE_SECRET_KEY` (must be set in Vercel for the shared limiter to be used).
- **Password recovery**: add `https://easymathai.com/reset-password` (and any preview/local
  origins you use, e.g. `http://localhost:3000/reset-password`) to Supabase →
  Authentication → URL Configuration → Redirect URLs.
- **Owner tools**: set the server-only `OWNER_EMAILS` and `DEVELOPER_EMAILS`
  variables in Vercel (comma-separated, never `NEXT_PUBLIC_`). These tools are
  not linked from the public site.
- **Photo uploads**: the API rejects images over 10 MB. Note that Vercel Functions also cap
  request bodies at about 4.5 MB, so very large photos are rejected by the platform first
  (the app shows the same friendly "photo is too large" message).
