import * as core from '@actions/core';
import * as github from '@actions/github';
import { WebClient } from '@slack/web-api';
import fetch from 'node-fetch';

interface GithubUserSSO {
  data: {
    organization: {
      samlIdentityProvider: {
        externalIdentities: {
          edges: Array<{
            node: {
              samlIdentity: {
                nameId: string;
              };
            };
          }>;
        };
      };
    };
  };
}

interface Commit {
  url: string;
  authorUsername: string;
  authorEmail: string;
  commitMessage: string;
}

interface CommitStatus {
  name: string;
  description: string;
  conclusion: string;
  url: string;
}

function getCommitMessageTitle(commitMessage: string): string {
  return commitMessage.split('\n')[0];
}

function commitStatusSucceeded(conclusion: string): boolean {
  return conclusion === 'success';
}

function commitStatusFailed(conclusion: string): boolean {
  return conclusion === 'failure' || conclusion === 'error';
}

async function getGithubAuthorEmail(org: string, username: string, githubToken: string): Promise<string> {
  const query = `
    query($org: String!, $login: String!) {
      organization(login: $org) {
        samlIdentityProvider {
          externalIdentities(first: 1, login: $login) {
            edges {
              node {
                samlIdentity {
                  nameId
                }
              }
            }
          }
        }
      }
    }
  `;
  const variables = { org, login: username };
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `bearer ${githubToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }
  const body = await response.json();
  const githubAuthorSSO: GithubUserSSO = body;
  const edges = githubAuthorSSO.data.organization.samlIdentityProvider.externalIdentities.edges;
  if (!edges || edges.length === 0) {
    throw new Error('No external identity edges from GitHub API response');
  }
  return edges[0].node.samlIdentity.nameId;
}

async function buildUserMention(slackClient: WebClient, authorEmail: string, githubAuthorUsername: string): Promise<string> {
  const githubAuthorUrl = `https://github.com/${githubAuthorUsername}`;
  try {
    const user = await slackClient.users.lookupByEmail({ email: authorEmail });
    if (user.user?.id) {
      return `<@${user.user.id}> (<${githubAuthorUrl}|${githubAuthorUsername}>)`;
    }
  } catch (err: any) {
    core.info(`ℹ️ Got error getting slack user by email, defaulting to GitHub link: ${err.message}`);
  }
  return `<${githubAuthorUrl}|${githubAuthorUsername}>`;
}

async function buildFailedJobChannelMessage(slackClient: WebClient, commit: Commit, commitStatus: CommitStatus): Promise<string> {
  const userMention = await buildUserMention(slackClient, commit.authorEmail, commit.authorUsername);
  const commitTitle = getCommitMessageTitle(commit.commitMessage);

  return `:warning: The commit <${commit.url}|"_${commitTitle}_"> by ${userMention} has failed the pipeline step <${commitStatus.url}|${commitStatus.name}>`;
}

function buildSuccessPublishDirectMessage(commit: Commit, commitStatus: CommitStatus): string {
  let statusEmoji: string;
  let statusDescription: string;

  if (commitStatusSucceeded(commitStatus.conclusion)) {
    statusEmoji = ':large_green_circle:';
    statusDescription = 'was successful';
  } else if (commitStatusFailed(commitStatus.conclusion)) {
    statusEmoji = ':red_circle:';
    statusDescription = 'failed';
  } else {
    core.info(`ℹ️ Got unknown commit status: ${commitStatus.conclusion}`);
    statusEmoji = ':question:';
    statusDescription = 'has unknown status';
  }

  const commitTitle = getCommitMessageTitle(commit.commitMessage);

  return `${statusEmoji} The CI job <${commitStatus.url}|${commitStatus.name}> for <${commit.url}|"_${commitTitle}_"> ${statusDescription}`;
}

function buildCommit(): Commit {
  return {
    url: core.getInput('commit_url', { required: true }),
    authorUsername: core.getInput('commit_author_username', { required: true }),
    authorEmail: core.getInput('commit_author_email', { required: true }),
    commitMessage: core.getInput('commit_message', { required: true })
  };
}

function buildCommitStatus(): CommitStatus {
  return {
    name: core.getInput('status_name', { required: true }),
    description: core.getInput('status_description', { required: true }),
    conclusion: core.getInput('status_conclusion', { required: true }),
    url: core.getInput('status_url', { required: true })
  };
}

async function sendMessageToChannel(slackClient: WebClient, channel: string, message: string): Promise<{channel: string, ts: string}> {
  try {
    const resp = await slackClient.chat.postMessage({
      channel,
      text: message,
      as_user: true,
      unfurl_links: false,
    });
    core.info(`ℹ️ Message sent to channel ${resp.channel} at ${resp.ts}`);

    // Output the Slack message timestamp and channel ID for GitHub Actions
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (githubOutput) {
      core.info(`ℹ️ DEBUG: $GITHUB_OUTPUT value: ${githubOutput}`);
      try {
        const fs = require('fs');
        fs.appendFileSync(githubOutput, `slack_message_id=${resp.ts}\n`);
        fs.appendFileSync(githubOutput, `slack_channel_id=${resp.channel}\n`);
      } catch (err: any) {
        core.warning(`⚠️ Could not write outputs to $GITHUB_OUTPUT: ${err.message}`);
      }
    } else {
      core.info('ℹ️ No $GITHUB_OUTPUT environment variable set, skipping output writing');
    }

    return { channel: resp.channel as string, ts: resp.ts as string };
  } catch (err: any) {
    core.error(`❌ Error posting message to Slack channel: ${err.message}`);
    throw err;
  }
}

async function sendMessageToUser(slackClient: WebClient, userEmail: string, message: string): Promise<{user: string, ts: string}> {
  try {
    const user = await slackClient.users.lookupByEmail({ email: userEmail });

    core.info(`ℹ️ Sending message: ${message}`);

    const resp = await slackClient.chat.postMessage({
      channel: user.user?.id as string,
      text: message,
      as_user: true,
      unfurl_links: false,
    });
    core.info(`ℹ️ Message sent to user ${user.user?.id} at ${resp.ts}`);

    // Output the Slack message timestamp and channel ID for GitHub Actions
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (githubOutput) {
      core.info(`ℹ️ DEBUG: $GITHUB_OUTPUT value: ${githubOutput}`);
      try {
        const fs = require('fs');
        fs.appendFileSync(githubOutput, `slack_message_id=${resp.ts}\n`);
        fs.appendFileSync(githubOutput, `slack_channel_id=${user.user?.id}\n`);
      } catch (err: any) {
        core.warning(`⚠️ Could not write outputs to $GITHUB_OUTPUT: ${err.message}`);
      }
    } else {
      core.info('ℹ️ No $GITHUB_OUTPUT environment variable set, skipping output writing');
    }

    return { user: user.user?.id as string, ts: resp.ts as string };
  } catch (err: any) {
    core.error(`❌ Error posting message to Slack user: ${err.message}`);
    throw err;
  }
}

async function run(): Promise<void> {
  // Entry point for the GitHub Action
  try {
    core.info('ℹ️ Running actions-notify-slack-ci');

    // Check if required inputs are set
    const slackAccessToken = core.getInput('slack_access_token', { required: true });
    const githubAccessToken = core.getInput('github_access_token', { required: true });

    if (!slackAccessToken) {
      core.setFailed('❌ Error: slack_access_token input is not set');
      return;
    }
    if (!githubAccessToken) {
      core.setFailed('❌ Error: github_access_token input is not set');
      return;
    }

    // Create a Slack client using the provided token
    const slackClient = new WebClient(slackAccessToken);

    // Build commit and status information
    const commit = buildCommit();
    const commitStatus = buildCommitStatus();

    // Determine if we should send messages
    const sendMessageToChannelInput = core.getInput('send_message_to_channel');
    const mustSendChannelMessage = sendMessageToChannelInput !== 'null' && sendMessageToChannelInput !== '';
    const slackChannelName = sendMessageToChannelInput;
    const mustSendDirectMessage = core.getInput('send_message_to_user') === 'true';

    // Try to get author email from GitHub SSO if possible
    if (commit.authorUsername) {
      try {
        const authorEmail = await getGithubAuthorEmail('masmovil', commit.authorUsername, githubAccessToken);
        commit.authorEmail = authorEmail;
        core.info(`ℹ️ Resolved GitHub SAML email: ${authorEmail}`);
      } catch (err: any) {
        core.info(`ℹ️ Got error getting email from GitHub SSO: ${err.message}`);
        // Continue with the email from commit metadata
      }
    }

    // Notify job result to Slack user via direct message
    if (mustSendDirectMessage) {
      core.info(`ℹ️ Sending message to user ${commit.authorEmail}`);
      const message = buildSuccessPublishDirectMessage(commit, commitStatus);
      try {
        const userResp = await sendMessageToUser(slackClient, commit.authorEmail, message);
        core.info(`ℹ️ Setting output: direct_slack_message_id = ${userResp.ts}`);
        core.setOutput('direct_slack_message_id', userResp.ts);
        core.info(`ℹ️ Setting output: direct_slack_user_id = ${userResp.user}`);
        core.setOutput('direct_slack_user_id', userResp.user);
      } catch (err) {
        core.error('❌ Failed to send message to user.');
      }
    }

    // Notify job result to Slack channel only if the job failed
    if (mustSendChannelMessage && slackChannelName && commitStatusFailed(commitStatus.conclusion)) {
      core.info(`ℹ️ Sending message to channel ${slackChannelName}`);
      const message = await buildFailedJobChannelMessage(slackClient, commit, commitStatus);
      try {
        const channelResp = await sendMessageToChannel(slackClient, slackChannelName, message);
        core.info(`ℹ️ Setting output: channel_slack_message_id = ${channelResp.ts}`);
        core.setOutput('channel_slack_message_id', channelResp.ts);
        core.info(`ℹ️ Setting output: channel_slack_channel_id = ${channelResp.channel}`);
        core.setOutput('channel_slack_channel_id', channelResp.channel);
      } catch (err) {
        core.error('❌ Failed to send message to channel.');
      }
    }

    if (mustSendDirectMessage && mustSendChannelMessage) {
      core.warning('⚠️ Both direct message and channel message will be sent, but only the last one will be outputted to GitHub Actions');
    }

  } catch (err: any) {
    core.setFailed(err.message);
  }
}

// Run the main function
run();
