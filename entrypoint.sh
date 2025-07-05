#!/bin/sh -l

echo 'Running entrypoint'

ls -l /usr/local/go/bin

GITHUB_ACCESS_TOKEN=${1} \
SLACK_ACCESS_TOKEN=${2} \
SEND_MESSAGE_TO_CHANNEL=${3} \
SEND_MESSAGE_TO_USER=${4} \
COMMIT_URL=${5} \
COMMIT_AUTHOR_USERNAME=${6} \
COMMIT_AUTHOR_EMAIL=${7} \
COMMIT_MESSAGE=${8} \
STATUS_CONCLUSION=${9} \
STATUS_URL=${10} \
STATUS_NAME=${11} \
STATUS_DESCRIPTION=${12} \
/usr/local/go/bin/go run /main.go

echo 'Running entrypoint done'
