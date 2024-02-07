#!/bin/sh -l

echo 'Running entrypoint'

ls -l /usr/local/go/bin

GITHUB_ACCESS_TOKEN=${1} \
SLACK_ACCESS_TOKEN=${2} \
SLACK_CHANNEL_NAME=${3} \
COMMIT_URL=${4} \
COMMIT_AUTHOR_USERNAME=${5} \
COMMIT_AUTHOR_EMAIL=${6} \
COMMIT_MESSAGE=${7} \
STATUS_CONCLUSION=${8} \
STATUS_URL=${9} \
STATUS_NAME=${10} \
STATUS_DESCRIPTION=${11} \
/usr/local/go/bin/go run /main.go

echo 'Running entrypoint done'
