/**
 * Local testing script for the GitHub Action
 * 
 * This script allows you to test the action locally by:
 * 1. Loading environment variables from .env file
 * 2. Mocking GitHub Actions core functions
 * 3. Mocking Slack API calls while using real GitHub API
 * 
 * Usage: node test.js
 */

const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

// Simple dotenv implementation
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      // Skip empty lines and comments
      if (!line.trim() || line.trim().startsWith('#')) {
        return;
      }
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('='); // Handle values with = in them
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
    'slack-access-token': 'SLACK_ACCESS_TOKEN',
    'github-access-token': 'GITHUB_ACCESS_TOKEN',
    'send-message-to-channel': 'SEND_MESSAGE_TO_CHANNEL',
    'send-message-to-user': 'SEND_MESSAGE_TO_USER',
    'commit-url': 'COMMIT_URL',
    'commit-author-username': 'COMMIT_AUTHOR_USERNAME',
    'commit-author-email': 'COMMIT_AUTHOR_EMAIL',
    'commit-message': 'COMMIT_MESSAGE',
    'status-name': 'STATUS_NAME',
    'status-description': 'STATUS_DESCRIPTION',
    'status-conclusion': 'STATUS_CONCLUSION',
    'status-url': 'STATUS_URL'
  };
  
  // Fallback values if .env file doesn't exist or values are missing
  const fallbackValues = {
    'slack-access-token': 'xoxb-test-token',
    'github-access-token': 'github-test-token',
    'send-message-to-channel': '#test-channel',
    'send-message-to-user': 'true',
    'commit-url': 'https://github.com/masmovil/mm-monorepo/commit/5494d59c335d1dabc1e7fb6739b2e4b2f1aa2eff',
    'commit-author-username': 'testuser',
    'commit-author-email': 'test@example.com',
    'commit-message': 'Test commit message',
    'status-name': 'test-job',
    'status-description': 'Test job description',
    'status-conclusion': 'failure',
    'status-url': 'https://github.com/test/repo/actions/runs/123456'
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

// Mock the WebClient to avoid actual Slack API calls during testing
const mockWebClient = {
  chat: {
    postMessage: async (options) => {
      console.log(`INFO: 📧 [MOCK] Slack message to ${options.channel}:`);
      console.log(`      ${options.text.substring(0, 100)}...`);
      return { 
        ok: true, 
        ts: `${Date.now() / 1000}`,
        channel: options.channel === '#masstack-cicd-test' ? 'C0943A91UMD' : options.channel,
        user: 'U07MOCK123' // Mock user ID
      };
    }
  },
  users: {
    lookupByEmail: async ({ email }) => {
      console.log(`INFO: 👤 [MOCK] Slack user lookup for: ${email}`);
      return {
        ok: true,
        user: { id: 'U07MOCK123' }
      };
    }
  }
};

// Override the WebClient constructor more robustly
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(...args) {
  if (args[0] === '@slack/web-api') {
    console.log('INFO: 🔧 [MOCK] Intercepted @slack/web-api import');
    return {
      WebClient: function(options) {
        console.log('INFO: 🔧 [MOCK] WebClient created with mock implementation');
        return mockWebClient;
      }
    };
  }
  return originalRequire.apply(this, args);
};

// Run the main script
console.log('🧪 Testing GitHub Action locally...');
console.log('📁 Environment variables loaded from .env file');
console.log('🔗 Using REAL GitHub API and MOCK Slack API');
console.log('🔧 WebClient mock should be active');
console.log('');

require('./main.js');

console.log('✅ Test completed successfully!');
