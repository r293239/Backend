const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const { Octokit } = require('@octokit/rest');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-password', 'x-api-key'],
  credentials: true
}));

// Body parsing middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Environment variables
const BACKEND_PASSWORD = process.env.BACKEND_PASSWORD || 'change-this-secure-password';
const GITHUB_TOKEN = process.env.ACESS_TOKEN; // Keeping your requested name
const API_KEY = process.env.API_KEY; // Alternative auth method

// Initialize GitHub Octokit
let octokit;
if (GITHUB_TOKEN) {
  octokit = new Octokit({
    auth: GITHUB_TOKEN,
    userAgent: 'GitHub-Backend-API/1.0.0',
    baseUrl: 'https://api.github.com',
    log: {
      debug: () => {},
      info: () => {},
      warn: console.warn,
      error: console.error
    },
    request: {
      agent: undefined,
      fetch: undefined,
      timeout: 30000
    }
  });
}

// Authentication middleware
const authenticate = (req, res, next) => {
  const password = req.headers['x-password'] || req.query.password;
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  // Check password authentication
  if (password && password === BACKEND_PASSWORD) {
    req.authMethod = 'password';
    return next();
  }
  
  // Check API key authentication (if configured)
  if (API_KEY && apiKey && apiKey === API_KEY) {
    req.authMethod = 'api_key';
    return next();
  }
  
  return res.status(401).json({ 
    error: 'Unauthorized: Invalid credentials',
    message: 'Provide password via x-password header/query or API key via x-api-key header/query',
    timestamp: new Date().toISOString()
  });
};

// Logging middleware
const logRequests = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const ip = req.ip || req.connection.remoteAddress;
  
  console.log(`[${timestamp}] ${method} ${url} - IP: ${ip}`);
  next();
};

app.use(logRequests);

// Error handling middleware
const errorHandler = (error, req, res, next) => {
  console.error(`[ERROR] ${new Date().toISOString()}:`, error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
  
  if (error.status) {
    return res.status(error.status).json({
      error: error.message || 'An error occurred',
      timestamp: new Date().toISOString()
    });
  }
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Something went wrong on our end',
    timestamp: new Date().toISOString()
  });
};

// Routes

// Root endpoint - API documentation
app.get('/', (req, res) => {
  res.json({
    name: 'GitHub Backend API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    documentation: {
      authentication: {
        methods: [
          'Header: x-password with your password',
          'Query: ?password=your-password',
          'Header: x-api-key with your API key (if configured)',
          'Query: ?api_key=your-api-key (if configured)'
        ]
      },
      endpoints: {
        public: [
          'GET / - This documentation',
          'GET /status - Health check and system status',
          'GET /health - Detailed health information'
        ],
        github_user: [
          'GET /github/user - Get authenticated GitHub user information',
          'GET /github/user/repos - Get user repositories',
          'GET /github/user/orgs - Get user organizations',
          'GET /github/user/gists - Get user gists'
        ],
        github_repos: [
          'GET /github/repos - List authenticated user repositories',
          'GET /github/repo/:owner/:repo - Get specific repository details',
          'GET /github/repo/:owner/:repo/contents/:path? - Get repository contents',
          'GET /github/repo/:owner/:repo/commits - Get repository commits',
          'GET /github/repo/:owner/:repo/branches - Get repository branches',
          'GET /github/repo/:owner/:repo/tags - Get repository tags',
          'GET /github/repo/:owner/:repo/releases - Get repository releases',
          'POST /github/repo/:owner/:repo/contents/:path - Create/update file',
          'DELETE /github/repo/:owner/:repo/contents/:path - Delete file'
        ],
        github_issues: [
          'GET /github/repo/:owner/:repo/issues - List repository issues',
          'GET /github/repo/:owner/:repo/issues/:issue_number - Get specific issue',
          'POST /github/repo/:owner/:repo/issues - Create new issue',
          'PATCH /github/repo/:owner/:repo/issues/:issue_number - Update issue',
          'GET /github/repo/:owner/:repo/issues/:issue_number/comments - Get issue comments',
          'POST /github/repo/:owner/:repo/issues/:issue_number/comments - Add issue comment'
        ],
        github_search: [
          'GET /github/search/repos - Search repositories',
          'GET /github/search/users - Search users',
          'GET /github/search/issues - Search issues',
          'GET /github/search/commits - Search commits'
        ],
        utilities: [
          'GET /github/rate-limit - Check API rate limit status',
          'POST /github/webhook - Handle GitHub webhooks',
          'GET /github/events/:username? - Get user events'
        ]
      }
    },
    examples: {
      curl_with_header: 'curl -H "x-password: your-password" https://your-site.netlify.app/github/user',
      curl_with_query: 'curl "https://your-site.netlify.app/github/repos?password=your-password"',
      create_issue: 'curl -X POST -H "x-password: your-password" -H "Content-Type: application/json" -d \'{"title": "Bug Report", "body": "Description"}\' https://your-site.netlify.app/github/repo/owner/repo/issues'
    }
  });
});

// Health and status endpoints
app.get('/status', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory_usage: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
    github_token_configured: !!GITHUB_TOKEN,
    api_key_configured: !!API_KEY
  });
});

app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      server: 'ok',
      github_api: GITHUB_TOKEN ? 'configured' : 'not_configured',
      authentication: BACKEND_PASSWORD !== 'change-this-secure-password' ? 'secure' : 'default_password'
    },
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      node_version: process.version,
      platform: process.platform
    }
  };
  
  const overallHealthy = Object.values(health.checks).every(check => 
    check === 'ok' || check === 'configured' || check === 'secure'
  );
  
  res.status(overallHealthy ? 200 : 503).json(health);
});

// GitHub User endpoints
app.get('/github/user', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { data } = await octokit.rest.users.getAuthenticated();
    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'GitHub API Error',
      message: error.message,
      status: error.status,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/github/user/repos', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      sort: req.query.sort || 'updated',
      direction: req.query.direction || 'desc',
      per_page: Math.min(parseInt(req.query.per_page) || 30, 100),
      page: parseInt(req.query.page) || 1,
      visibility: req.query.visibility || 'all',
      type: req.query.type || 'all'
    });
    
    res.json({
      success: true,
      data: data,
      count: data.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'GitHub API Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/github/user/orgs', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { data } = await octokit.rest.orgs.listForAuthenticatedUser({
      per_page: Math.min(parseInt(req.query.per_page) || 30, 100),
      page: parseInt(req.query.page) || 1
    });
    
    res.json({
      success: true,
      data: data,
      count: data.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'GitHub API Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Repository endpoints
app.get('/github/repos', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      sort: req.query.sort || 'updated',
      direction: req.query.direction || 'desc',
      per_page: Math.min(parseInt(req.query.per_page) || 30, 100),
      page: parseInt(req.query.page) || 1,
      visibility: req.query.visibility || 'all'
    });
    
    res.json({
      success: true,
      data: data,
      count: data.length,
      pagination: {
        page: parseInt(req.query.page) || 1,
        per_page: Math.min(parseInt(req.query.per_page) || 30, 100)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'GitHub API Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
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
    
    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'GitHub API Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/github/repo/:owner/:repo/contents/:path(*)?', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { owner, repo, path } = req.params;
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: path || '',
      ref: req.query.ref
    });
    
    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'GitHub API Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/github/repo/:owner/:repo/commits', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { owner, repo } = req.params;
    const { data } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: req.query.sha,
      path: req.query.path,
      author: req.query.author,
      since: req.query.since,
      until: req.query.until,
      per_page: Math.min(parseInt(req.query.per_page) || 30, 100),
      page: parseInt(req.query.page) || 1
    });
    
    res.json({
      success: true,
      data: data,
      count: data.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'GitHub API Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/github/repo/:owner/:repo/branches', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { owner, repo } = req.params;
    const { data } = await octokit.rest.repos.listBranches({
      owner,
      repo,
      protected: req.query.protected,
      per_page: Math.min(parseInt(req.query.per_page) || 30, 100),
      page: parseInt(req.query.page) || 1
    });
    
    res.json({
      success: true,
      data: data,
      count: data.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'GitHub API Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Issues endpoints
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
      labels: req.query.labels,
      sort: req.query.sort || 'created',
      direction: req.query.direction || 'desc',
      since: req.query.since,
      per_page: Math.min(parseInt(req.query.per_page) || 30, 100),
      page: parseInt(req.query.page) || 1
    });
    
    res.json({
      success: true,
      data: data,
      count: data.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'GitHub API Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/github/repo/:owner/:repo/issues/:issue_number', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { owner, repo, issue_number } = req.params;
    const { data } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: parseInt(issue_number)
    });
    
    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'GitHub API Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/github/repo/:owner/:repo/issues', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { owner, repo } = req.params;
    const { title, body, labels, assignees, milestone } = req.body;
    
    if (!title) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Title is required',
        timestamp: new Date().toISOString()
      });
    }

    const { data } = await octokit.rest.issues.create({
      owner,
      repo,
      title,
      body,
      labels,
      assignees,
      milestone
    });
    
    res.status(201).json({
      success: true,
      data: data,
      message: 'Issue created successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'GitHub API Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.patch('/github/repo/:owner/:repo/issues/:issue_number', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { owner, repo, issue_number } = req.params;
    const updateData = req.body;
    
    const { data } = await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: parseInt(issue_number),
      ...updateData
    });
    
    res.json({
      success: true,
      data: data,
      message: 'Issue updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'GitHub API Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Search endpoints
app.get('/github/search/repos', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { q, sort, order, per_page, page } = req.query;
    
    if (!q) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Search query (q) parameter is required',
        timestamp: new Date().toISOString()
      });
    }

    const { data } = await octokit.rest.search.repos({
      q,
      sort,
      order,
      per_page: Math.min(parseInt(per_page) || 30, 100),
      page: parseInt(page) || 1
    });
    
    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'GitHub API Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Rate limit endpoint
app.get('/github/rate-limit', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const { data } = await octokit.rest.rateLimit.get();
    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'GitHub API Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Generic GitHub API proxy for advanced usage
app.all('/github/api/*', authenticate, async (req, res) => {
  if (!octokit) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  try {
    const path = req.params[0];
    const method = req.method.toUpperCase();
    
    // Build the request
    const requestConfig = {
      method,
      url: `/${path}`,
      ...req.query
    };
    
    // Add body for POST, PUT, PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(method) && req.body) {
      requestConfig.data = req.body;
    }
    
    const response = await octokit.request(requestConfig);
    
    res.json({
      success: true,
      data: response.data,
      status: response.status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'GitHub API Error',
      message: error.message,
      status: error.status,
      timestamp: new Date().toISOString()
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    message: `The endpoint ${req.method} ${req.originalUrl} does not exist`,
    available_endpoints: '/',
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 GitHub Backend API running on port ${port}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔑 GitHub token configured: ${!!GITHUB_TOKEN}`);
    console.log(`🔒 Password configured: ${BACKEND_PASSWORD !== 'change-this-secure-password'}`);
    console.log(`🌐 CORS origins: ${process.env.ALLOWED_ORIGINS || 'all'}`);
    console.log(`⚡ Server ready at http://localhost:${port}`);
  });
}

module.exports = app;
