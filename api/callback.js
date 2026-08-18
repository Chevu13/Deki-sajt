// Step 2 of the GitHub OAuth flow: GitHub redirects back here with a
// one-time `code`, which we exchange server-side for an access token
// (this exchange needs OAUTH_CLIENT_SECRET, which must never reach the
// browser) and hand to the admin panel via postMessage, exactly as Decap
// CMS's github backend expects.
export default async function handler(req, res) {
  const { code, error, error_description } = req.query;

  if (error) {
    res.status(400).send(`GitHub OAuth error: ${error_description || error}`);
    return;
  }

  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).send("Missing OAUTH_CLIENT_ID / OAUTH_CLIENT_SECRET environment variables.");
    return;
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    res.status(400).send(`GitHub token exchange failed: ${tokenData.error_description || tokenData.error}`);
    return;
  }

  const payload = JSON.stringify({ token: tokenData.access_token, provider: "github" });

  res.setHeader("Content-Type", "text/html");
  res.send(`<!doctype html>
<script>
(function () {
  function receiveMessage(e) {
    window.opener.postMessage('authorization:github:success:${payload}', e.origin);
    window.removeEventListener('message', receiveMessage, false);
  }
  window.addEventListener('message', receiveMessage, false);
  window.opener.postMessage('authorizing:github', '*');
})();
</script>`);
}
