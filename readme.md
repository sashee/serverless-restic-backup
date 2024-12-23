## Systemd

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

config: example path: /etc/restic_configs/restic-testing

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

```
serverless-restic-backup-client schedule
```

Uses job id 619396956.

## Configs

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
