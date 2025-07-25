# Slack Notify GitHub Action

This action is used to notify results of CI/CD jobs running on GitHub commits via Slack. It supports sending messages to both Slack channels and direct messages to users, with automatic GitHub SSO email resolution.

## Features

- ✅ **Dual messaging**: Send notifications to Slack channels and/or direct messages to users
- ✅ **GitHub SSO integration**: Automatically resolve GitHub usernames to SAML email addresses
- ✅ **Smart fallback**: Falls back to commit metadata if SSO resolution fails
- ✅ **Flexible status handling**: Supports success, failure, and unknown status states
- ✅ **Rich formatting**: Uses emojis and Slack markdown for better readability
- ✅ **Multiple outputs**: Provides message IDs and channel/user IDs for chaining actions
- ✅ **Standard GitHub Actions**: Uses `with:` syntax following GitHub Actions best practices

## Inputs

This action uses standard GitHub Actions inputs:

### Required Inputs

| Input | Description |
|-------|-------------|
| `slack-access-token` | Slack Bot Token (starts with `xoxb-`) for posting messages |
| `github-access-token` | GitHub Personal Access Token for GraphQL API access |

### Message Configuration

| Input | Description | Example |
|-------|-------------|---------|
| `send-message-to-channel` | Slack channel name (with #) or set to `null` to disable | `#ci-notifications` |
| `send-message-to-user` | Set to `true` to send direct messages, `false` to disable | `true` |

### Commit Information

| Input | Description | Source |
|-------|-------------|--------|
| `commit-url` | URL to the commit | `${{ github.event.head_commit.url }}` |
| `commit-author-username` | GitHub username of commit author | `${{ github.event.head_commit.author.username }}` |
| `commit-author-email` | Email of commit author | `${{ github.event.head_commit.author.email }}` |
| `commit-message` | The commit message | `${{ github.event.head_commit.message }}` |

### Status Information

| Input | Description | Values |
|-------|-------------|--------|
| `status-name` | Name of the CI/CD job or check | `build`, `test`, `deploy` |
| `status-description` | Description of the status | Any descriptive text |
| `status-conclusion` | Result of the status check | `success`, `failure`, `error` |
| `status-url` | URL to the CI/CD job details | Link to job logs or dashboard |

## Outputs

The action provides the following outputs for use in subsequent steps:

| Output | Description |
|--------|-------------|
| `channel-slack-message-id` | Slack message timestamp (ID) for channel message |
| `channel-slack-channel-id` | Slack channel ID where message was sent |
| `direct-slack-message-id` | Slack message timestamp (ID) for direct message |
| `direct-slack-user-id` | Slack user ID who received the direct message |

## Message Types

### Success Message (Direct Message)
- 🟢 **Green circle** for successful jobs
- 🔴 **Red circle** for failed jobs
- ❓ **Question mark** for unknown status

### Failure Message (Channel)
- ⚠️ **Warning emoji** for failed pipeline steps
- **User mention** with GitHub profile link
- **Commit link** with truncated message

## Example Usage

### Basic Usage

```yaml
- name: Notify Slack
  uses: masmovil/actions-notify-slack-ci@v1
  with:
    slack-access-token: ${{ secrets.SLACK_ACCESS_TOKEN }}
    github-access-token: ${{ secrets.GITHUB_ACCESS_TOKEN }}
    send-message-to-channel: "#ci-notifications"
    send-message-to-user: "true"
    commit-url: ${{ github.event.head_commit.url }}
    commit-author-username: ${{ github.event.head_commit.author.username }}
    commit-author-email: ${{ github.event.head_commit.author.email }}
    commit-message: ${{ github.event.head_commit.message }}
    status-name: "build"
    status-description: "Build and test"
    status-conclusion: ${{ job.status }}
    status-url: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
```

### Advanced Usage with Status Context

```yaml
- name: Notify Slack on Failure
  if: failure()
  uses: masmovil/actions-notify-slack-ci@v1
  with:
    slack-access-token: ${{ secrets.SLACK_ACCESS_TOKEN }}
    github-access-token: ${{ secrets.GITHUB_ACCESS_TOKEN }}
    send-message-to-channel: "#build-failures"
    send-message-to-user: "true"
    commit-url: ${{ github.event.head_commit.url }}
    commit-author-username: ${{ github.event.head_commit.author.username }}
    commit-author-email: ${{ github.event.head_commit.author.email }}
    commit-message: ${{ github.event.head_commit.message }}
    status-name: ${{ github.job }}
    status-description: "Job failed in ${{ github.workflow }}"
    status-conclusion: "failure"
    status-url: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}

- name: Use Slack outputs
  run: |
    echo "Channel message ID: ${{ steps.notify-slack.outputs.channel-slack-message-id }}"
    echo "User message ID: ${{ steps.notify-slack.outputs.direct-slack-message-id }}"
```

### Channel-Only Notification

```yaml
- name: Notify Channel Only
  uses: masmovil/actions-notify-slack-ci@v1
  with:
    slack-access-token: ${{ secrets.SLACK_ACCESS_TOKEN }}
    github-access-token: ${{ secrets.GITHUB_ACCESS_TOKEN }}
    send-message-to-channel: "#deployments"
    send-message-to-user: "false"
    # ... other inputs
```

### Direct Message Only

```yaml
- name: Notify User Only
  uses: masmovil/actions-notify-slack-ci@v1
  with:
    slack-access-token: ${{ secrets.SLACK_ACCESS_TOKEN }}
    github-access-token: ${{ secrets.GITHUB_ACCESS_TOKEN }}
    send-message-to-channel: "null"
    send-message-to-user: "true"
    # ... other inputs
```

## Setup Requirements

### 1. Slack Bot Token
1. Create a Slack app at https://api.slack.com/apps
2. Add the following OAuth scopes:
   - `chat:write`
   - `users:read`
   - `users:read.email`
3. Install the app to your workspace
4. Copy the Bot User OAuth Token (starts with `xoxb-`)

### 2. GitHub Access Token
1. Create a Personal Access Token with `read:org` scope
2. Store it as a repository secret

### 3. Repository Secrets
Add these secrets to your repository:
- `SLACK_ACCESS_TOKEN`: Your Slack bot token
- `GITHUB_ACCESS_TOKEN`: Your GitHub personal access token

## Behavior

### GitHub SSO Resolution
- The action attempts to resolve GitHub usernames to SAML email addresses
- Falls back to commit metadata email if SSO resolution fails
- Currently configured for the `masmovil` organization

### Message Logic
- **Direct messages**: Always use the success/failure format with status emojis
- **Channel messages**: Use failure format with user mentions and warnings
- **Dual messaging**: Both messages can be sent, but only the last one's outputs are available

### Error Handling
- Graceful failure for Slack API errors
- Continues execution even if one message type fails
- Provides detailed logging with emojis for better visibility

## Logging

The action provides detailed logging with emojis:
- ℹ️ **Info**: General information and progress
- ⚠️ **Warning**: Non-critical issues
- ❌ **Error**: Critical failures
- 💬 **Output**: GitHub Actions output values

## Local Testing

For local development, use the provided test script:

```bash
# Test the action locally
npm test
```

### How Testing Works

The test script simulates the GitHub Actions environment by:
- Loading environment variables from a `.env` file (if present)
- Mapping them to the correct input names
- Using fallback values for missing variables
- Mocking Slack and GitHub APIs to avoid real API calls

### Setup for Testing

```bash
# Copy environment template (optional, for real token testing)
cp .env.example .env

# Edit with your tokens and test data (optional)
vim .env

# Run the test
npm test
```

**Without `.env` file**: Uses safe fallback values for basic functionality testing.
**With `.env` file**: Uses your real tokens for full integration testing (but with mocked APIs for safety).

## Development

This action is written in TypeScript and needs to be built before it can be used in GitHub Actions.

### Building the Action

The action uses `@vercel/ncc` to bundle all dependencies into a single JavaScript file:

```bash
# Install dependencies
npm install

# Build TypeScript and bundle dependencies
npm run build

# Or just bundle without TypeScript compilation
npm run package
```

### Important Notes

- The `dist/` directory contains the bundled JavaScript file and **must be committed** to git
- GitHub Actions runs the bundled `dist/index.js` file, not the source `main.ts`
- After making changes to the source code, always run `npm run build` before committing
- The `node_modules` directory is ignored by git since dependencies are bundled

### Release Process

1. Make your changes to `main.ts`
2. Run `npm run build` to create the bundled version
3. Commit both source changes and the updated `dist/index.js`
4. Create a new release/tag