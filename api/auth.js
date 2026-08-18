// Step 1 of the GitHub OAuth flow Decap CMS needs: redirect the admin
// panel's "Login with GitHub" click to GitHub's authorize screen.
// Requires OAUTH_CLIENT_ID (Vercel env var) — see README for setup.
export default function handler(req, res) {
  const clientId = process.env.OAUTH_CLIENT_ID;
  if (!clientId) {
    res.status(500).send("Missing OAUTH_CLIENT_ID environment variable.");
    return;
  }
  const redirectUri = `https://${req.headers.host}/api/callback`;
  const authUrl =
    `https://github.com/login/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=repo`;
  res.writeHead(302, { Location: authUrl });
  res.end();
}
