const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

// Simple dotenv implementation
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        process.env[key.trim()] = value.trim();
      }
    });
  }
}

// Load environment variables from .env file
loadEnv();

// Mock the core.getInput function to simulate GitHub Actions inputs
const originalGetInput = core.getInput;
core.getInput = (name, options) => {
  // Map input names to environment variable names
  const envMapping = {
    'slack_access_token': 'SLACK_ACCESS_TOKEN',
    'github_access_token': 'GITHUB_ACCESS_TOKEN',
    'send_message_to_channel': 'SEND_MESSAGE_TO_CHANNEL',
    'send_message_to_user': 'SEND_MESSAGE_TO_USER',
    'commit_url': 'COMMIT_URL',
    'commit_author_username': 'COMMIT_AUTHOR_USERNAME',
    'commit_author_email': 'COMMIT_AUTHOR_EMAIL',
    'commit_message': 'COMMIT_MESSAGE',
    'status_name': 'STATUS_NAME',
    'status_description': 'STATUS_DESCRIPTION',
    'status_conclusion': 'STATUS_CONCLUSION',
    'status_url': 'STATUS_URL'
  };
  
  // Fallback values if .env file doesn't exist or values are missing
  const fallbackValues = {
    'slack_access_token': 'xoxb-test-token',
    'github_access_token': 'github-test-token',
    'send_message_to_channel': '#test-channel',
    'send_message_to_user': 'true',
    'commit_url': 'https://github.com/test/repo/commit/abc123',
    'commit_author_username': 'testuser',
    'commit_author_email': 'test@example.com',
    'commit_message': 'Test commit message',
    'status_name': 'test-job',
    'status_description': 'Test job description',
    'status_conclusion': 'success',
    'status_url': 'https://github.com/test/repo/actions/runs/123456'
  };
  
  const envVar = envMapping[name];
  const value = envVar ? process.env[envVar] : '';
  const finalValue = value || fallbackValues[name] || '';
  
  if (options && options.required && !finalValue) {
    throw new Error(`Input required and not supplied: ${name} (mapped to ${envVar})`);
  }
  return finalValue;
};

// Mock other core functions
core.info = (message) => console.log(`INFO: ${message}`);
core.warning = (message) => console.log(`WARNING: ${message}`);
core.error = (message) => console.log(`ERROR: ${message}`);
core.setFailed = (message) => console.log(`FAILED: ${message}`);
core.setOutput = (name, value) => console.log(`OUTPUT: ${name} = ${value}`);

// Set GITHUB_OUTPUT environment variable for testing
process.env.GITHUB_OUTPUT = '/tmp/test-output';

// Mock the WebClient and fetch to avoid actual API calls
const mockWebClient = {
  chat: {
    postMessage: async () => ({ channel: 'C123456', ts: '1234567890.123456' })
  },
  users: {
    lookupByEmail: async () => ({ user: { id: 'U123456' } })
  }
};

const mockFetch = async () => ({
  json: async () => ({ data: { organization: { samlIdentityProvider: { externalIdentities: { edges: [] } } } } })
});

// Replace imports
const originalWebClient = require('@slack/web-api').WebClient;
const originalFetch = require('node-fetch');
require('@slack/web-api').WebClient = function() { return mockWebClient; };
require.cache[require.resolve('node-fetch')].exports = mockFetch;

// Run the main script
console.log('Testing with inputs (with: syntax)...');
console.log('Environment variables loaded from .env file (if present), with fallback values for missing ones');
console.log('');
require('./main.js');

console.log('Test completed successfully!');
