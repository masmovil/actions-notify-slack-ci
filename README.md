# Slack Notify GitHub action

This action is used to notify results in Jenkins jobs running on GitHub commits, via Slack.

## Inputs

Check `action.yml` for the full list of inputs.

## Example usage

```yaml
uses: actions/actions-notify-slack@v1
with:
  github-access-token: ${{ secrets.GH_ACCESS_TOKEN }}
  slack-access-token: ${{ secrets.SLACK_ACCESS_TOKEN }}
  slack-channel-name: yourchannelname
  commit-url: ${{ github.event.commit.html_url }}
  commit-author-username: ${{ github.event.commit.author.login }}
  commit-author-email: ${{ github.event.commit.commit.author.email }}
  commit-message: ${{ github.event.commit.commit.message }}
  status-conclusion: ${{ github.event.state }}
  status-url: ${{ github.event.target_url }}
  status-name: ${{ github.event.context }}
  status-description: ${{ github.event.description }}
```