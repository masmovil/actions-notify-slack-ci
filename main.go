package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/slack-go/slack"
)

const (
	GitHubOrganization = "masmovil"
	PublishJobName     = "mas-stack/publish:master"
)

type Commit struct {
	url            string
	authorUsername string
	authorEmail    string
	commitMessage  string
}

func (c Commit) getCommitMessageTitle() string {
	return strings.Split(c.commitMessage, "\n")[0]
}

type CommitStatus struct {
	Name        string
	Description string
	Conclusion  string
	Url         string
}

func (o CommitStatus) Succeeded() bool {
	return o.Conclusion == "success"
}

func (o CommitStatus) Failed() bool {
	return o.Conclusion == "failure" || o.Conclusion == "error"
}

// GithubUserSSO is used to unmarshall GitHub API response
type GithubUserSSO struct {
	Data struct {
		Organization struct {
			SAMLIdentityProvider struct {
				ExternalIdentities struct {
					Edges []struct {
						Node struct {
							SamlIdentity struct {
								NameId string `json:"nameId"`
							} `json:"samlIdentity"`
						} `json:"node"`
					} `json:"edges"`
				} `json:"externalIdentities"`
			} `json:"samlIdentityProvider"`
		} `json:"organization"`
	} `json:"data"`
}

func main() {
	fmt.Println("Running actions-notify-slack-ci")

	slackClient := getSlackClient()
	commit := buildCommit()
	commitStatus := buildCommitStatus()
	mustSendChannelMessage := os.Getenv("SEND_MESSAGE_TO_CHANNEL") != "null"
	slackChannelName := os.Getenv("SEND_MESSAGE_TO_CHANNEL")
	mustSendDirectMessage := os.Getenv("SEND_MESSAGE_TO_USER") == "true"

	// Notify job result to Slack user via direct message
	if mustSendDirectMessage {
		fmt.Println("Sending message to user", commit.authorEmail)
		message := buildSuccessPublishDirectMessage(commit, commitStatus)
		sendMessageToUser(slackClient, commit.authorEmail, message)
	}

	// Notify job result to Slack channel
	if mustSendChannelMessage {
		fmt.Println("Sending message to channel", slackChannelName)
		message := buildFailedJobChannelMessage(slackClient, commit, commitStatus)
		sendMessageToChannel(slackClient, slackChannelName, message)
	}

	if mustSendDirectMessage && mustSendChannelMessage {
		fmt.Println("WARNING: Both direct message and channel message will be sent, but only the last one will be outputted to GitHub Actions")
	}

	return
}

func getSlackClient() (client *slack.Client) {
	accessToken := os.Getenv("SLACK_ACCESS_TOKEN")
	client = slack.New(accessToken)
	return client
}

func buildFailedJobChannelMessage(client *slack.Client, commit Commit, commitStatus CommitStatus) (message string) {
	slackUser, err := client.GetUserByEmail(commit.authorEmail)
	if err != nil {
		fmt.Println("got error getting slack user by email, defaulting to nil:", err)
		slackUser = nil
	}
	userMention := buildUserMention(slackUser, commit.authorUsername)

	message = fmt.Sprintf(":warning: The commit <%s|\"_%s_\"> by %s has failed the pipeline step <%s|%s>",
		commit.url,
		commit.getCommitMessageTitle(),
		userMention,
		commitStatus.Url,
		commitStatus.Name,
	)
	return
}

func buildSuccessPublishDirectMessage(commit Commit, commitStatus CommitStatus) (message string) {
	var statusEmoji string
	var statusDescription string
	if commitStatus.Succeeded() {
		statusEmoji = ":large_green_circle:"
		statusDescription = "was successful"
	} else if commitStatus.Failed() {
		statusEmoji = ":red_circle:"
		statusDescription = "failed"
	} else {
		fmt.Println("got unknown commit status:", commitStatus.Conclusion)
	}

	message = fmt.Sprintf("%s The CI job <%s|%s> for <%s|\"_%s_\"> %s",
		statusEmoji,
		commitStatus.Url,
		commitStatus.Name,
		commit.url,
		commit.getCommitMessageTitle(),
		statusDescription,
	)
	return
}

func buildUserMention(slackUser *slack.User, githubAuthorUsername string) (mention string) {
	githubAuthorUrl := "https://github.com/" + githubAuthorUsername
	if slackUser != nil {
		mention += fmt.Sprintf("<@%s> (<%s|%s>)", slackUser.ID, githubAuthorUrl, githubAuthorUsername)
	} else {
		mention += fmt.Sprintf("<%s|%s>", githubAuthorUrl, githubAuthorUsername)
	}
	return mention
}

func buildCommitStatus() (commitStatus CommitStatus) {
	commitStatus = CommitStatus{
		Name:        os.Getenv("STATUS_NAME"),
		Description: os.Getenv("STATUS_DESCRIPTION"),
		Conclusion:  os.Getenv("STATUS_CONCLUSION"),
		Url:         os.Getenv("STATUS_URL"),
	}
	return
}

func buildCommit() (commit Commit) {
	commit = Commit{
		url:            os.Getenv("COMMIT_URL"),
		authorUsername: os.Getenv("COMMIT_AUTHOR_USERNAME"),
		authorEmail:    os.Getenv("COMMIT_AUTHOR_EMAIL"),
		commitMessage:  os.Getenv("COMMIT_MESSAGE"),
	}

	authorEmail, err := getAuthorEmailFromGithubSSO(commit.authorUsername)
	if err != nil {
		// If we are unable to get email from GitHub SSO, we will use the one specified in the commit metadata
		fmt.Println("got error getting email from github SSO:", err)
		return
	}
	// Replace the email from the commit with the one from GitHub SSO
	commit.authorEmail = authorEmail

	return
}

func getAuthorEmailFromGithubSSO(authorUsername string) (authorEmail string, err error) {
	// Get email from organization SSO, using GitHub username as key
	queryBody := fmt.Sprintf("{\"query\": \"query {organization(login: \\\"%s\\\"){samlIdentityProvider{externalIdentities(first: 1, login: \\\"%s\\\") {edges {node {samlIdentity {nameId}}}}}}}\"}", GitHubOrganization, authorUsername)
	req, err := http.NewRequest("POST", "https://api.github.com/graphql", bytes.NewBuffer([]byte(queryBody)))
	accessToken := os.Getenv("GITHUB_ACCESS_TOKEN")
	req.Header.Add("Authorization", "Bearer "+accessToken)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("got error while doing request to github API:", err)
		return
	}
	defer func() {
		closeErr := resp.Body.Close()
		if closeErr != nil {
			fmt.Println("got error closing github API response body:", closeErr)
		}
	}()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Println("got error reading github API response body:", err)
		return
	}

	var githubAuthorSSO GithubUserSSO
	err = json.Unmarshal(body, &githubAuthorSSO)
	if err != nil {
		fmt.Println("got error unmarshalling github API response body:", err)
		return
	}

	if len(githubAuthorSSO.Data.Organization.SAMLIdentityProvider.ExternalIdentities.Edges) == 0 {
		err = errors.New("no external identity edges")
		fmt.Println("got zero external identity edges from github api response:", err)
		return
	}

	authorEmail = githubAuthorSSO.Data.Organization.SAMLIdentityProvider.ExternalIdentities.Edges[0].Node.SamlIdentity.NameId
	return
}

func sendMessageToChannel(client *slack.Client, slackChannel, message string) {
	respChannel, respTimestamp, err := client.PostMessage(slackChannel,
		slack.MsgOptionText(message, false),
		slack.MsgOptionAsUser(true),
		slack.MsgOptionDisableLinkUnfurl())
	if err != nil {
		fmt.Println("got error posting message to slack channel:", err)
		return
	}
	fmt.Println("message sent to channel", respChannel, "at", respTimestamp)

	// Output the Slack message timestamp and channel ID for GitHub Actions
	githubOutput := os.Getenv("GITHUB_OUTPUT")
	if githubOutput != "" {
		f, err := os.OpenFile(githubOutput, os.O_APPEND|os.O_WRONLY, 0600)
		if err == nil {
			defer f.Close()
			fmt.Fprintf(f, "slack_message_id=%s\n", respTimestamp)
			fmt.Fprintf(f, "slack_channel_id=%s\n", respChannel)
		} else {
			fmt.Printf("could not write outputs to $GITHUB_OUTPUT: %v\n", err)
		}
	} else {
		fmt.Println("no $GITHUB_OUTPUT environment variable set, skipping output writing")
	}

	return
}

func sendMessageToUser(client *slack.Client, userEmail string, message string) {
	slackUser, err := client.GetUserByEmail(userEmail)
	if err != nil {
		fmt.Println("got error getting slack user by email, aborting", err)
		return
	}

	fmt.Println("sending message:", message)

	respChannel, respTimestamp, err := client.PostMessage(slackUser.ID, slack.MsgOptionText(message, false), slack.MsgOptionAsUser(true))
	if err != nil {
		fmt.Println("got error posting message to slack user:", err)
		return
	}
	fmt.Println("message sent to user", respChannel, "at", respTimestamp)

	// Output the Slack message timestamp and channel ID for GitHub Actions
	githubOutput := os.Getenv("GITHUB_OUTPUT")
	if githubOutput != "" {
		f, err := os.OpenFile(githubOutput, os.O_APPEND|os.O_WRONLY, 0600)
		if err == nil {
			defer f.Close()
			fmt.Fprintf(f, "slack_message_id=%s\n", respTimestamp)
			fmt.Fprintf(f, "slack_channel_id=%s\n", respChannel)
		} else {
			fmt.Printf("could not write outputs to $GITHUB_OUTPUT: %v\n", err)
		}
	} else {
		fmt.Println("no $GITHUB_OUTPUT environment variable set, skipping output writing")
	}
	return
}
