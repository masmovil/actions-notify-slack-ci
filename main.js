"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const web_api_1 = require("@slack/web-api");
const node_fetch_1 = __importDefault(require("node-fetch"));
function getCommitMessageTitle(commitMessage) {
    return commitMessage.split('\n')[0];
}
function commitStatusSucceeded(conclusion) {
    return conclusion === 'success';
}
function commitStatusFailed(conclusion) {
    return conclusion === 'failure' || conclusion === 'error';
}
async function getGithubAuthorEmail(org, username, githubToken) {
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
    const response = await (0, node_fetch_1.default)('https://api.github.com/graphql', {
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
    const githubAuthorSSO = body;
    const edges = githubAuthorSSO.data.organization.samlIdentityProvider.externalIdentities.edges;
    if (!edges || edges.length === 0) {
        throw new Error('No external identity edges from GitHub API response');
    }
    return edges[0].node.samlIdentity.nameId;
}
async function buildUserMention(slackClient, authorEmail, githubAuthorUsername) {
    const githubAuthorUrl = `https://github.com/${githubAuthorUsername}`;
    try {
        const user = await slackClient.users.lookupByEmail({ email: authorEmail });
        if (user.user?.id) {
            return `<@${user.user.id}> (<${githubAuthorUrl}|${githubAuthorUsername}>)`;
        }
    }
    catch (err) {
        core.info(`ℹ️ Got error getting slack user by email, defaulting to GitHub link: ${err.message}`);
    }
    return `<${githubAuthorUrl}|${githubAuthorUsername}>`;
}
async function buildFailedJobChannelMessage(slackClient, commit, commitStatus) {
    const userMention = await buildUserMention(slackClient, commit.authorEmail, commit.authorUsername);
    const commitTitle = getCommitMessageTitle(commit.commitMessage);
    return `:warning: The commit <${commit.url}|"_${commitTitle}_"> by ${userMention} has failed the pipeline step <${commitStatus.url}|${commitStatus.name}>`;
}
function buildSuccessPublishDirectMessage(commit, commitStatus) {
    let statusEmoji;
    let statusDescription;
    if (commitStatusSucceeded(commitStatus.conclusion)) {
        statusEmoji = ':large_green_circle:';
        statusDescription = 'was successful';
    }
    else if (commitStatusFailed(commitStatus.conclusion)) {
        statusEmoji = ':red_circle:';
        statusDescription = 'failed';
    }
    else {
        core.info(`ℹ️ Got unknown commit status: ${commitStatus.conclusion}`);
        statusEmoji = ':question:';
        statusDescription = 'has unknown status';
    }
    const commitTitle = getCommitMessageTitle(commit.commitMessage);
    return `${statusEmoji} The CI job <${commitStatus.url}|${commitStatus.name}> for <${commit.url}|"_${commitTitle}_"> ${statusDescription}`;
}
function buildCommit() {
    return {
        url: core.getInput('commit-url', { required: true }),
        authorUsername: core.getInput('commit-author-username', { required: true }),
        authorEmail: core.getInput('commit-author-email', { required: true }),
        commitMessage: core.getInput('commit-message', { required: true })
    };
}
function buildCommitStatus() {
    return {
        name: core.getInput('status-name', { required: true }),
        description: core.getInput('status-description', { required: true }),
        conclusion: core.getInput('status-conclusion', { required: true }),
        url: core.getInput('status-url', { required: true })
    };
}
async function sendMessageToChannel(slackClient, channel, message) {
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
            }
            catch (err) {
                core.warning(`⚠️ Could not write outputs to $GITHUB_OUTPUT: ${err.message}`);
            }
        }
        else {
            core.info('ℹ️ No $GITHUB_OUTPUT environment variable set, skipping output writing');
        }
        return { channel: resp.channel, ts: resp.ts };
    }
    catch (err) {
        core.error(`❌ Error posting message to Slack channel: ${err.message}`);
        throw err;
    }
}
async function sendMessageToUser(slackClient, userEmail, message) {
    try {
        const user = await slackClient.users.lookupByEmail({ email: userEmail });
        core.info(`ℹ️ Sending message: ${message}`);
        const resp = await slackClient.chat.postMessage({
            channel: user.user?.id,
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
            }
            catch (err) {
                core.warning(`⚠️ Could not write outputs to $GITHUB_OUTPUT: ${err.message}`);
            }
        }
        else {
            core.info('ℹ️ No $GITHUB_OUTPUT environment variable set, skipping output writing');
        }
        return { user: user.user?.id, ts: resp.ts };
    }
    catch (err) {
        core.error(`❌ Error posting message to Slack user: ${err.message}`);
        throw err;
    }
}
async function run() {
    // Entry point for the GitHub Action
    try {
        core.info('ℹ️ Running actions-notify-slack-ci');
        // Check if required inputs are set
        const slackAccessToken = core.getInput('slack-access-token', { required: true });
        const githubAccessToken = core.getInput('github-access-token', { required: true });
        if (!slackAccessToken) {
            core.setFailed('❌ Error: slack-access-token input is not set');
            return;
        }
        if (!githubAccessToken) {
            core.setFailed('❌ Error: github-access-token input is not set');
            return;
        }
        // Create a Slack client using the provided token
        const slackClient = new web_api_1.WebClient(slackAccessToken);
        // Build commit and status information
        const commit = buildCommit();
        const commitStatus = buildCommitStatus();
        // Determine if we should send messages
        const sendMessageToChannelInput = core.getInput('send-message-to-channel');
        const mustSendChannelMessage = sendMessageToChannelInput !== 'null' && sendMessageToChannelInput !== '';
        const slackChannelName = sendMessageToChannelInput;
        const mustSendDirectMessage = core.getInput('send-message-to-user') === 'true';
        // Try to get author email from GitHub SSO if possible
        if (commit.authorUsername) {
            try {
                const authorEmail = await getGithubAuthorEmail('masmovil', commit.authorUsername, githubAccessToken);
                commit.authorEmail = authorEmail;
                core.info(`ℹ️ Resolved GitHub SAML email: ${authorEmail}`);
            }
            catch (err) {
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
                core.info(`ℹ️ Setting output: direct-slack-message-id = ${userResp.ts}`);
                core.setOutput('direct-slack-message-id', userResp.ts);
                core.info(`ℹ️ Setting output: direct-slack-user-id = ${userResp.user}`);
                core.setOutput('direct-slack-user-id', userResp.user);
            }
            catch (err) {
                core.error('❌ Failed to send message to user.');
            }
        }
        // Notify job result to Slack channel only if the job failed
        if (mustSendChannelMessage && slackChannelName && commitStatusFailed(commitStatus.conclusion)) {
            core.info(`ℹ️ Sending message to channel ${slackChannelName}`);
            const message = await buildFailedJobChannelMessage(slackClient, commit, commitStatus);
            try {
                const channelResp = await sendMessageToChannel(slackClient, slackChannelName, message);
                core.info(`ℹ️ Setting output: channel-slack-message-id = ${channelResp.ts}`);
                core.setOutput('channel-slack-message-id', channelResp.ts);
                core.info(`ℹ️ Setting output: channel-slack-channel-id = ${channelResp.channel}`);
                core.setOutput('channel-slack-channel-id', channelResp.channel);
            }
            catch (err) {
                core.error('❌ Failed to send message to channel.');
            }
        }
        if (mustSendDirectMessage && mustSendChannelMessage) {
            core.warning('⚠️ Both direct message and channel message will be sent, but only the last one will be outputted to GitHub Actions');
        }
    }
    catch (err) {
        core.setFailed(err.message);
    }
}
// Run the main function
run();
