FROM golang:alpine@sha256:0a03b591c358a0bb02e39b93c30e955358dadd18dc507087a3b7f3912c17fe13

COPY main.go /main.go
COPY go.mod /go.mod
COPY go.sum /go.sum
COPY entrypoint.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]