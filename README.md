# Slack Notify GitHub Action

This action is used to notify results of CI/CD jobs running on GitHub commits via Slack. It supports sending messages to both Slack channels and direct messages to users, with automatic GitHub SSO email resolution.

## Features

- ✅ **Dual messaging**: Send notifications to Slack channels and/or direct messages to users
- ✅ **GitHub SSO integration**: Automatically resolve GitHub usernames to SAML email addresses
- ✅ **Smart fallback**: Falls back to commit metadata if SSO resolution fails
- ✅ **Flexible status handling**: Supports success, failure, and unknown status states
- ✅ **Rich formatting**: Uses emojis and Slack markdown for better readability
- ✅ **Multiple outputs**: Provides message IDs and channel/user IDs for chaining actions

## Environment Variables

This action uses environment variables instead of traditional GitHub Action inputs:

### Required Variables

| Variable | Description |
|----------|-------------|
| `SLACK_ACCESS_TOKEN` | Slack Bot Token (starts with `xoxb-`) for posting messages |
| `GITHUB_ACCESS_TOKEN` | GitHub Personal Access Token for GraphQL API access |

### Message Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `SEND_MESSAGE_TO_CHANNEL` | Slack channel name (with #) or set to `null` to disable | `#ci-notifications` |
| `SEND_MESSAGE_TO_USER` | Set to `true` to send direct messages, `false` to disable | `true` |

### Commit Information

| Variable | Description | Source |
|----------|-------------|--------|
| `COMMIT_URL` | URL to the commit | `${{ github.event.head_commit.url }}` |
| `COMMIT_AUTHOR_USERNAME` | GitHub username of commit author | `${{ github.event.head_commit.author.username }}` |
| `COMMIT_AUTHOR_EMAIL` | Email of commit author | `${{ github.event.head_commit.author.email }}` |
| `COMMIT_MESSAGE` | The commit message | `${{ github.event.head_commit.message }}` |

### Status Information

| Variable | Description | Values |
|----------|-------------|--------|
| `STATUS_NAME` | Name of the CI/CD job or check | `build`, `test`, `deploy` |
| `STATUS_DESCRIPTION` | Description of the status | Any descriptive text |
| `STATUS_CONCLUSION` | Result of the status check | `success`, `failure`, `error` |
| `STATUS_URL` | URL to the CI/CD job details | Link to job logs or dashboard |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_OUTPUT` | Path to GitHub Actions output file | Auto-detected |

## Outputs

The action provides the following outputs for use in subsequent steps:

| Output | Description |
|--------|-------------|
| `channel_slack_message_id` | Slack message timestamp (ID) for channel message |
| `channel_slack_channel_id` | Slack channel ID where message was sent |
| `direct_slack_message_id` | Slack message timestamp (ID) for direct message |
| `direct_slack_user_id` | Slack user ID who received the direct message |

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
  env:
    SLACK_ACCESS_TOKEN: ${{ secrets.SLACK_ACCESS_TOKEN }}
    GITHUB_ACCESS_TOKEN: ${{ secrets.GITHUB_ACCESS_TOKEN }}
    SEND_MESSAGE_TO_CHANNEL: "#ci-notifications"
    SEND_MESSAGE_TO_USER: "true"
    COMMIT_URL: ${{ github.event.head_commit.url }}
    COMMIT_AUTHOR_USERNAME: ${{ github.event.head_commit.author.username }}
    COMMIT_AUTHOR_EMAIL: ${{ github.event.head_commit.author.email }}
    COMMIT_MESSAGE: ${{ github.event.head_commit.message }}
    STATUS_NAME: "build"
    STATUS_DESCRIPTION: "Build and test"
    STATUS_CONCLUSION: ${{ job.status }}
    STATUS_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
```

### Advanced Usage with Status Context

```yaml
- name: Notify Slack on Failure
  if: failure()
  uses: masmovil/actions-notify-slack-ci@v1
  env:
    SLACK_ACCESS_TOKEN: ${{ secrets.SLACK_ACCESS_TOKEN }}
    GITHUB_ACCESS_TOKEN: ${{ secrets.GITHUB_ACCESS_TOKEN }}
    SEND_MESSAGE_TO_CHANNEL: "#build-failures"
    SEND_MESSAGE_TO_USER: "true"
    COMMIT_URL: ${{ github.event.head_commit.url }}
    COMMIT_AUTHOR_USERNAME: ${{ github.event.head_commit.author.username }}
    COMMIT_AUTHOR_EMAIL: ${{ github.event.head_commit.author.email }}
    COMMIT_MESSAGE: ${{ github.event.head_commit.message }}
    STATUS_NAME: ${{ github.job }}
    STATUS_DESCRIPTION: "Job failed in ${{ github.workflow }}"
    STATUS_CONCLUSION: "failure"
    STATUS_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}

- name: Use Slack outputs
  run: |
    echo "Channel message ID: ${{ steps.notify-slack.outputs.channel_slack_message_id }}"
    echo "User message ID: ${{ steps.notify-slack.outputs.direct_slack_message_id }}"
```

### Channel-Only Notification

```yaml
- name: Notify Channel Only
  uses: masmovil/actions-notify-slack-ci@v1
  env:
    SLACK_ACCESS_TOKEN: ${{ secrets.SLACK_ACCESS_TOKEN }}
    GITHUB_ACCESS_TOKEN: ${{ secrets.GITHUB_ACCESS_TOKEN }}
    SEND_MESSAGE_TO_CHANNEL: "#deployments"
    SEND_MESSAGE_TO_USER: "false"
    # ... other variables
```

### Direct Message Only

```yaml
- name: Notify User Only
  uses: masmovil/actions-notify-slack-ci@v1
  env:
    SLACK_ACCESS_TOKEN: ${{ secrets.SLACK_ACCESS_TOKEN }}
    GITHUB_ACCESS_TOKEN: ${{ secrets.GITHUB_ACCESS_TOKEN }}
    SEND_MESSAGE_TO_CHANNEL: "null"
    SEND_MESSAGE_TO_USER: "true"
    # ... other variables
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

For local development, use the provided test scripts:

```bash
# Copy environment template
cp .env.example .env

# Edit with your tokens and test data
vim .env

# Run tests
npm run test:env
```