#!/usr/bin/env node
import * as fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import {AwsClient} from "aws4fetch";
import util from "node:util";
import childProcess from "node:child_process";
import {setTimeout} from "node:timers/promises";

const execFile = util.promisify(childProcess.execFile);

console.log(process.argv);
const runInShell = process.env.RUN_IN_SHELL === "true";

if(process.argv[2] === "check") {
	console.log(AwsClient);
	const {stdout} = await execFile("restic", ["version"], {env: {}, shell: runInShell});
	console.log("Restic version", stdout);
	const packageJsonVersion = JSON.parse(await fs.readFile(new URL("./package.json", import.meta.url), "utf8")).version;
	console.log("Package version", packageJsonVersion);
	console.log("Node version", process.version)

	process.exit(0);
}

const constructURL = (base, pathname, searchParams) => {
	const url = new URL(base);
	url.pathname = pathname;
	url.search = new URLSearchParams(searchParams);
	return url;
};

const isJson = (str) => {
	try {
		JSON.parse(str);
		return true;
	}catch(e) {
		return false;
	}
}

const runId = crypto.randomUUID();

const callWithRetry = async (fn, depth = 0) => {
	try {
		return await fn();
	}catch(e) {
		if (depth > 7) {
			throw e;
		}
		await setTimeout(2 ** depth * 10);
	
		return callWithRetry(fn, depth + 1);
	}
}

const readCredential = async (credentialName, envVarName) => {
	if (process.env.CREDENTIALS_DIRECTORY) {
		return await fs.readFile(path.join(process.env.CREDENTIALS_DIRECTORY, credentialName));
	}else {
		return process.env[envVarName];
	}
}

const cacheDirectory = process.env.CACHE_DIRECTORY;
console.log("cacheDirectory", cacheDirectory);

const monitoringAwsSecretAccessKey = await readCredential("monitoring_aws_secret_access_key", "MONITORING_AWS_SECRET_ACCESS_KEY");
const aws = new AwsClient({accessKeyId: process.env.MONITORING_AWS_ACCESS_KEY_ID, secretAccessKey: monitoringAwsSecretAccessKey});
const sendMonitoring = async ({pathname, searchParams, method, body}) => {
	return callWithRetry(async () => {
		const res = await aws.fetch(constructURL(process.env.MONITORING_URL, pathname, searchParams), {
			method,
			body,
			aws: {
				service: "lambda",
				region: process.env.MONITORING_REGION,
			},
		});
		if (!res.ok) {
			const restext = await res.text();
			throw new Error(`Error sending monitoring event: ${restext}`);
		}
	});
}

const awsSecretAccessKey = await readCredential("aws_secret_access_key", "AWS_SECRET_ACCESS_KEY");

const runCommand = async ({label, command, args, env, processStdout}) => {
	try {
		// if run in shell quote the args
		// otherwise the empty argument after --group-by will be ignored
		const {stdout, stderr} = await execFile(command, args.map((arg) => runInShell ? `'${arg}'` : arg), {
			env: {
				...env,
				TMPDIR: process.env.TMPDIR,
			},
			// 5 MB, lambda invocation limit is 6 MB
			maxBuffer: 5 * 1024 * 1024,
			shell: runInShell,
		});
		console.log(label, JSON.stringify({stdout: (processStdout ?? ((val) => val))(stdout), stderr}));
		await sendMonitoring({pathname: "/log", searchParams: {runid: runId, label}, method: "POST", body: JSON.stringify({stdout: (processStdout ?? ((val) => val))(stdout), stderr})}).catch((e) => console.error(e));
	}catch(e) {
		if (e.stdout !== undefined && e.stderr !== undefined) {
			// error is thrown by the execFile
			console.log(label, e.stdout, e.stderr);
			await sendMonitoring({pathname: "/log", searchParams: {runid: runId, label: `${label}-error`}, method: "POST", body: JSON.stringify({stdout: e.stdout, stderr: e.stderr})}).catch((e) => console.error(e));
			throw e;
		}else {
			throw e;
		}
	}
}

await sendMonitoring({pathname: "/run", searchParams: {runid: runId, monitor: process.env.MONITORING_MONITOR_NAME}, method: "GET"});

try {
	const resticPassword = await readCredential("restic_password", "RESTIC_PASSWORD");
	const packageJsonVersion = JSON.parse(await fs.readFile(new URL("./package.json", import.meta.url), "utf8")).version;

	await runCommand({
		label: "version",
		command: "restic",
		args: ["version"],
		env: {
			RESTIC_CACHE_DIR: cacheDirectory,
		},
		processStdout: (stdout) => {
			return {
				resticVersion: stdout,
				packageVersion: packageJsonVersion,
				nodeVersion: process.version,
			};
		},
	});
	await runCommand({
		label: "unlock", 
		command: "restic",
		args: ["unlock"],
		env: {
			AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
			RESTIC_REPOSITORY: process.env.RESTIC_REPOSITORY,
			AWS_SECRET_ACCESS_KEY: awsSecretAccessKey,
			RESTIC_PASSWORD: resticPassword,
			RESTIC_CACHE_DIR: cacheDirectory,
		},
	});
	await runCommand({
		label: "backup",
		command: "restic",
		args: ["backup", "--group-by", "", "--json", ...process.env.BACKUP_DIRS.split(" "), ...process.env.EXCLUDES.split(" ")],
		env: {
			AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
			RESTIC_REPOSITORY: process.env.RESTIC_REPOSITORY,
			AWS_SECRET_ACCESS_KEY: awsSecretAccessKey,
			RESTIC_PASSWORD: resticPassword,
			RESTIC_PROGRESS_FPS: "0.01",
			RESTIC_CACHE_DIR: cacheDirectory,
		},
		processStdout: (stdout) => [stdout.split("\n").findLast((line) => isJson(line))].map((line) => JSON.parse(line))[0],
	});
	try {
		await runCommand({
			label: "forget",
			command: "restic",
			args: ["forget", "--json", ...process.env.PRUNE.split(" "), "--group-by", "", "--prune"],
			env: {
				AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
				RESTIC_REPOSITORY: process.env.RESTIC_REPOSITORY,
				AWS_SECRET_ACCESS_KEY: awsSecretAccessKey,
				RESTIC_PASSWORD: resticPassword,
				RESTIC_CACHE_DIR: cacheDirectory,
			},
			// prune does not support JSON yet
			// https://restic.readthedocs.io/en/stable/075_scripting.html
			// processStdout: (val) => JSON.parse(val),
			});
	}catch(e) {
		if (process.env.IGNORE_PRUNE_ERRORS !== "true") {
			throw e;
		}
	}
	await runCommand({
		label: "check",
		command: "restic",
		args: ["check"],
		env: {
			AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
			RESTIC_REPOSITORY: process.env.RESTIC_REPOSITORY,
			AWS_SECRET_ACCESS_KEY: awsSecretAccessKey,
			RESTIC_PASSWORD: resticPassword,
			RESTIC_CACHE_DIR: cacheDirectory,
		},
	});
	await runCommand({
		label: "snapshots",
		command: "restic",
		args: ["snapshots", "--json"],
		env: {
			AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
			RESTIC_REPOSITORY: process.env.RESTIC_REPOSITORY,
			AWS_SECRET_ACCESS_KEY: awsSecretAccessKey,
			RESTIC_PASSWORD: resticPassword,
			RESTIC_CACHE_DIR: cacheDirectory,
		},
		processStdout: (val) => JSON.parse(val),
	});
	await runCommand({
		label: "stats",
		command: "restic",
		args: ["stats", "latest", "--json"],
		env: {
			AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
			RESTIC_REPOSITORY: process.env.RESTIC_REPOSITORY,
			AWS_SECRET_ACCESS_KEY: awsSecretAccessKey,
			RESTIC_PASSWORD: resticPassword,
			RESTIC_CACHE_DIR: cacheDirectory,
		},
		processStdout: (val) => JSON.parse(val),
	});

	await sendMonitoring({pathname: "/success", searchParams: {runid: runId}, method: "GET"});
}catch(e) {
	await sendMonitoring({pathname: "/fail", searchParams: {runid: runId}, method: "GET"});
	throw e;
}
