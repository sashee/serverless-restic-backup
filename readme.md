# AWS

## Prerequisities

* SNS topic that will be notified when the user is disabled.

## Deploy

Deploy the stack to an AWS account.

Parameters:

* NotificationSNSTopicArn
* Monitors
* AlertIfMissedEventsForDays
* ReportInterval
* LambdaConcurrency

## User disabler

To automatically disable the IAM users when they do something suspicious CloudTrail events have to be forwarded to the event bus created by this stack. This can
be done in any ways, but it works well with the [aws-management-account-starter](https://github.com/sashee/aws-management-account-starter) stack.

Prerequisities:

* Have the starter stack deployed to the management account
* Have the member stack deployed to this account
* Have the per-member stack deployed to the management account configured with the event bus created by the member stack

After deploying the restic stack:

* Deploy the member-suspicious-events-forwarder stack, defining the event bus output

# Clients

## Systemd

### Unit hardening

Harden the unit so that it can access only the directories to be backed up:

```
sudo mkdir -p /etc/systemd/system/serverless-restic-backup-client@.service.d
```

/etc/systemd/system/serverless-restic-backup-client@.service.d/override.conf

```
[Service]
# replace with the username
User=sashee
ProtectHome=tmpfs

BindReadOnlyPaths=/home/sashee/laptop-backup
# ... add multiple paths like this
```

### Configuration

example path: /etc/restic_configs/restic-testing

```
mkdir -p /etc/restic_configs/restic-testing
```

```
cd /etc/restic_configs/restic-testing

systemd-ask-password -n | systemd-creds encrypt --tpm2-pcrs="" - aws_secret_access_key
systemd-ask-password -n | systemd-creds encrypt --tpm2-pcrs="" - monitoring_aws_secret_access_key
systemd-ask-password -n | systemd-creds encrypt --tpm2-pcrs="" - restic_password
```

config:

```
AWS_ACCESS_KEY_ID="..."
RESTIC_REPOSITORY="..."
MONITORING_URL="..."
MONITORING_REGION="..."
MONITORING_MONITOR_NAME="..."
MONITORING_AWS_ACCESS_KEY_ID="..."
PRUNE="--keep-last 10 --keep-within-daily 30d --keep-within-weekly 6m"
BACKUP_DIRS="..."
EXCLUDES="--exclude=.stversions"
```

```
systemctl daemon-reload
# change /etc/... path to the correct config
sudo systemctl enable --now $(systemd-escape --path --template=serverless-restic-backup-client@.timer "/etc/restic_configs/restic-testing")
```

## Android

```
serverless-restic-backup-client check
mkdir -p $PREFIX/etc/serverless-restic-backup-client/configs/<name>/config
```

config: $TERMUX_PREFIX/etc/serverless-restic-backup-client/configs/<name>/config

Termux does not support systemd-style credentials passing so the `AWS_SECRET_ACCESS_KEY`, `MONITORING_AWS_SECRET_ACCESS_KEY`, and the `RESTIC_PASSWORD` have to
be passed as environment variables.

Also, for some reason the Node app needs to run the `restic` command in a shell (which is less secure). To configure this, pass `RUN_IN_SHELL="true"`.

```
AWS_ACCESS_KEY_ID="..."
RESTIC_REPOSITORY="..."
MONITORING_URL="..."
MONITORING_REGION="..."
MONITORING_MONITOR_NAME="..."
MONITORING_AWS_ACCESS_KEY_ID="..."
PRUNE="--keep-last 10 --keep-within-daily 30d --keep-within-weekly 6m"
BACKUP_DIRS="..."
EXCLUDES="--exclude=.stversions"
AWS_SECRET_ACCESS_KEY="..."
MONITORING_AWS_SECRET_ACCESS_KEY="..."
RESTIC_PASSWORD="..."
RUN_IN_SHELL="true"
```

After configuration, schedule the task:

```
serverless-restic-backup-client schedule
```

Uses job id `619396956`.

## Configs

Environment variables:

* RUN_IN_SHELL: the command is run in a shell. Needed for termux, should not be set otherwise
* MONITORING_AWS_ACCESS_KEY_ID: Access key ID for the monitoring. Comes from the CloudFormation output
* MONITORING_URL: URL for the monitoring. Comes from the CloudFormation output
* MONITORING_REGION: Region for the monitoring endpoint. Comes from the CloudFormation output
* MONITORING_MONITOR_NAME: the name for the run
* AWS_ACCESS_KEY_ID
* RESTIC_REPOSITORY
* PRUNE: prune config
* IGNORE_PRUNE_ERRORS: if true then an error during prune is not considered fatal. Useful for append-only repositories
* EXCLUDES: excludes config
* BACKUP_DIRS: backup config

Systemd credentials, they have to be placed in the same directory as the config file:

* aws_secret_access_key
* monitoring_aws_secret_access_key
* restic_password

If the target of the backup is not the S3 bucket then leave the `AWS_ACCESS_KEY_ID` and the `AWS_SECRET_ACCESS_KEY` empty.
