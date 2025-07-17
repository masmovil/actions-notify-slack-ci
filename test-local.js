#!/usr/bin/env node

// Mock the GitHub Actions core module
const mockCore = {
  getInput: (name, options) => {
    const inputs = {
      'github_token': process.env.GITHUB_ACCESS_TOKEN || 'your-github-token',
      'slack_token': process.env.SLACK_ACCESS_TOKEN || 'your-slack-token',
      'slack_channel': process.env.SEND_MESSAGE_TO_CHANNEL || 'general',
      'slack_user': process.env.SEND_MESSAGE_TO_USER || 'test@example.com',
      'slack_message': process.env.COMMIT_MESSAGE || 'Test message from local run',
      'github_org': process.env.GITHUB_ORG || 'masmovil',
      'github_username': process.env.COMMIT_AUTHOR_USERNAME || 'your-username'
    };
    
    const value = inputs[name];
    if (options?.required && !value) {
      throw new Error(`Input required and not supplied: ${name}`);
    }
    return value || '';
  },
  setOutput: (name, value) => {
    console.log(`OUTPUT: ${name} = ${value}`);
  },
  setFailed: (message) => {
    console.error(`FAILED: ${message}`);
    process.exit(1);
  },
  info: (message) => {
    console.log(`INFO: ${message}`);
  },
  warning: (message) => {
    console.warn(`WARNING: ${message}`);
  },
  error: (message) => {
    console.error(`ERROR: ${message}`);
  }
};

// Mock the GitHub module
const mockGithub = {
  context: {
    repo: {
      owner: 'test-owner',
      repo: 'test-repo'
    }
  }
};

// Replace the modules in the main.js file
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id === '@actions/core') {
    return mockCore;
  }
  if (id === '@actions/github') {
    return mockGithub;
  }
  return originalRequire.apply(this, arguments);
};

// Load and run the main script
console.log('Starting local test...');
console.log('Environment variables:');
console.log(`SLACK_ACCESS_TOKEN: ${process.env.SLACK_ACCESS_TOKEN ? '[SET]' : '[NOT SET]'}`);
console.log(`GITHUB_ACCESS_TOKEN: ${process.env.GITHUB_ACCESS_TOKEN ? '[SET]' : '[NOT SET]'}`);
console.log(`SEND_MESSAGE_TO_CHANNEL: ${process.env.SEND_MESSAGE_TO_CHANNEL || '[NOT SET]'}`);
console.log(`SEND_MESSAGE_TO_USER: ${process.env.SEND_MESSAGE_TO_USER || '[NOT SET]'}`);
console.log(`COMMIT_AUTHOR_USERNAME: ${process.env.COMMIT_AUTHOR_USERNAME || '[NOT SET]'}`);
console.log(`COMMIT_AUTHOR_EMAIL: ${process.env.COMMIT_AUTHOR_EMAIL || '[NOT SET]'}`);
console.log(`COMMIT_MESSAGE: ${process.env.COMMIT_MESSAGE || '[NOT SET]'}`);
console.log(`STATUS_NAME: ${process.env.STATUS_NAME || '[NOT SET]'}`);
console.log(`STATUS_CONCLUSION: ${process.env.STATUS_CONCLUSION || '[NOT SET]'}`);
console.log('---');

require('./main.js');
