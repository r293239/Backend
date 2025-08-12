const serverless = require('serverless-http');

// Import the main Express app
const app = require('../../server');

// Export the serverless handler
exports.handler = serverless(app, {
  binary: false,
  callbackWaitsForEmptyEventLoop: false
});
