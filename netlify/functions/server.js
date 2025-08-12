const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const { Octokit } = require('@octokit/rest');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Environment variables
const BACKEND_PASSWORD = process.env.BACKEND_PASSWORD || 'your-secure-password';
const GITHUB_TOKEN = process.env.ACESS_TOKEN; // Note: keeping your typo as requested

// Initialize Octokit with GitHub token
let octokit;
if (GITHUB_TOKEN) {
  octokit = new Octokit({
    auth: GITHUB_TOKEN,
  });
}

// Password authentication middleware
const authenticate = (req, res, next) => {
  const password = req.headers['x-password'] || req.query.password;
  
  if (!password || password !== BACKEND_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized: Invalid password' });
  }
  
  next();
};

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'GitHub Backend API',
    status: 'running',
    endpoints: [
      'GET /status - Check server status',
      'GET /github/user - Get authenticated GitHub user info',
      'GET /github/repos - List user repositories',
      'GET /github/repo/:owner/:repo - Get specific repository info',
      'POST /github/repo/:owner/:repo/issues - Create an issue',
      'GET /github/repo/:owner/:repo/issues - List repository issues'
    ],
    authentication: 'Include password in x-password header or password query parameter'
  });
});

// Status endpoint (no auth required)
app.get('/status', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    github_token_configured: !!GITHUB_TOKEN
  });
});

// GitHub API endpoints (all require authentication)
app.get('/github/user', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { data } = await octokit.rest.users.getAuthenticated();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/github/repos', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: req.query.per_page || 30
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/github/repo/:owner/:repo', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { owner, repo } = req.params;
    const { data } = await octokit.rest.repos.get({
      owner,
      repo
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/github/repo/:owner/:repo/issues', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { owner, repo } = req.params;
    const { data } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: req.query.state || 'open',
      per_page: req.query.per_page || 30
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/github/repo/:owner/:repo/issues', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { owner, repo } = req.params;
    const { title, body, labels } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const { data } = await octokit.rest.issues.create({
      owner,
      repo,
      title,
      body,
      labels
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generic GitHub API proxy (for advanced usage)
app.all('/github/api/*', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const path = req.params[0];
    const method = req.method.toLowerCase();
    
    // This is a basic proxy - you might want to add more sophisticated handling
    const response = await octokit.request(`${method.toUpperCase()} /${path}`, {
      ...req.query,
      ...req.body
    });
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports.handler = serverless(app);
