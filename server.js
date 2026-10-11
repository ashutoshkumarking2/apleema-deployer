import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'apleema_fallback_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 3600000 * 24 }
}));

app.use(express.static(__dirname));

const userConnectionsStore = {};

app.get('/api/auth/github/repo', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const uid = req.query.uid || 'guest';
  req.session.oauthUserUid = uid;
  
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent('http://localhost:3000/api/auth/github/callback')}&scope=read:user%20repo%20project&state=${state}`;

  res.redirect(githubAuthUrl);
});

app.get('/api/auth/github/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!state || state !== req.session.oauthState) {
    return res.status(403).send('Security error: State mismatch.');
  }
  req.session.oauthState = null;
  const uid = req.session.oauthUserUid;

  try {
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code
    }, {
      headers: { Accept: 'application/json' }
    });

    const tokenData = tokenResponse.data;
    if (!tokenData.access_token) {
      return res.status(400).send('OAuth Token Exchange Failed.');
    }

    req.session.githubAccessToken = tokenData.access_token;

    const userRes = await axios.get('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${tokenData.access_token}`,
        'User-Agent': 'Apleema-Deployment-Platform'
      }
    });

    const githubUsername = userRes.data.login;

    if (uid && uid !== 'guest') {
      userConnectionsStore[uid] = {
        ...userConnectionsStore[uid],
        githubConnected: true,
        githubUsername: githubUsername,
        vercelConnected: userConnectionsStore[uid]?.vercelConnected ?? true
      };
    }

    const repoResponse = await axios.get('https://api.github.com/user/repos?sort=updated&per_page=100', {
      headers: {
        'Authorization': `token ${tokenData.access_token}`,
        'User-Agent': 'Apleema-Deployment-Platform'
      }
    });

    const repos = repoResponse.data;

    if (Array.isArray(repos) && repos.length > 0) {
      const repoList = repos.map(r => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        owner: r.owner.login,
        visibility: r.private ? 'Private' : 'Public',
        branch: r.default_branch,
        url: r.html_url,
        description: r.description,
        language: r.language
      }));

      const reposEncoded = Buffer.from(JSON.stringify(repoList)).toString('base64');
      res.redirect(`/?repos=${encodeURIComponent(reposEncoded)}&github_status=connected`);
    } else {
      res.redirect('/?repos=empty&github_status=connected');
    }

  } catch (error) {
    console.error("Backend Error:", error.response?.data || error.message);
    res.status(500).send("Internal Server Error during GitHub OAuth callback.");
  }
});

app.get('/api/user/connections', (req, res) => {
  const uid = req.query.uid;
  if (!uid) return res.status(400).json({ error: 'Missing UID' });

  if (!userConnectionsStore[uid]) {
    userConnectionsStore[uid] = {
      githubConnected: false,
      githubUsername: null,
      vercelConnected: true
    };
  }

  res.json({ success: true, connections: userConnectionsStore[uid] });
});

app.post('/api/user/disconnect-github', (req, res) => {
  const { uid } = req.body;
  if (uid && userConnectionsStore[uid]) {
    userConnectionsStore[uid].githubConnected = false;
    userConnectionsStore[uid].githubUsername = null;
  }
  res.json({ success: true });
});

app.post('/api/user/disconnect-vercel', (req, res) => {
  const { uid } = req.body;
  if (uid && userConnectionsStore[uid]) {
    userConnectionsStore[uid].vercelConnected = false;
  } else if (uid) {
    userConnectionsStore[uid] = { githubConnected: false, githubUsername: null, vercelConnected: false };
  }
  res.json({ success: true });
});

app.post('/api/user/connect-vercel', (req, res) => {
  const { uid } = req.body;
  if (uid) {
    if (!userConnectionsStore[uid]) userConnectionsStore[uid] = {};
    userConnectionsStore[uid].vercelConnected = true;
  }
  res.json({ success: true });
});

app.post('/api/deployments', async (req, res) => {
  const { projectName, repoOwner, repoName, repoId, branch, framework, buildCommand, outputDirectory, envVars } = req.body;

  if (!projectName || !repoOwner || !repoName) {
    return res.status(400).json({ error: 'Missing required deployment parameters.' });
  }

  try {
    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) {
      return res.status(500).json({ error: 'Vercel token is not configured on server.' });
    }

    const deploymentPayload = {
      name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      gitSource: {
        type: 'github',
        repoId: repoId ? String(repoId) : undefined,
        owner: repoOwner,
        repo: repoName,
        ref: branch || 'main'
      },
      projectSettings: {
        framework: framework || null,
        buildCommand: buildCommand || null,
        outputDirectory: outputDirectory || null
      }
    };

    if (envVars && typeof envVars === 'object' && Object.keys(envVars).length > 0) {
      deploymentPayload.env = envVars;
    }

    const teamId = process.env.VERCEL_TEAM_ID;
    const queryParams = teamId ? `?teamId=${teamId}` : '';

    const vercelRes = await axios.post(`https://api.vercel.com/v13/deployments${queryParams}`, deploymentPayload, {
      headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' }
    });

    res.json({ success: true, deployment: vercelRes.data });
  } catch (error) {
    console.error('Vercel deployment error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error?.message || 'Failed to trigger Vercel deployment.' });
  }
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Apleema Platform active at: http://localhost:${PORT}`);
  console.log(`====================================================`);
});