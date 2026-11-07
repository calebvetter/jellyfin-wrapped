#!/usr/bin/env node
/**
 * Persistent development server manager (Windows, macOS, Linux).
 *
 *   pnpm dev:start    start Vite (hot reload) in the background, reachable on your LAN
 *   pnpm dev:stop     stop it
 *   pnpm dev:restart  restart it
 *   pnpm dev:status   show PID, URLs and health
 *   pnpm dev:logs     print the last 80 log lines (add -- -f to follow)
 *
 * State lives in .dev/ (pid file + log). Port: DEV_PORT (default 5173).
 */
import { spawn, execSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = path.join(root, '.dev');
const pidFile = path.join(stateDir, 'dev.pid');
const logFile = path.join(stateDir, 'dev.log');
const port = Number(process.env.DEV_PORT ?? readEnvPort() ?? 5173);

function readEnvPort() {
	for (const f of ['.env.development.local', '.env.local', '.env']) {
		try {
			const m = fs.readFileSync(path.join(root, f), 'utf8').match(/^\s*DEV_PORT\s*=\s*(\d+)/m);
			if (m) return Number(m[1]);
		} catch {
			/* no file */
		}
	}
	return null;
}

function readPid() {
	try {
		const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
		return Number.isFinite(pid) && pid > 0 ? pid : null;
	} catch {
		return null;
	}
}

function alive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		return e.code === 'EPERM';
	}
}

function lanUrls() {
	const urls = [];
	for (const list of Object.values(os.networkInterfaces())) {
		for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${port}`);
	}
	return urls;
}

async function health() {
	try {
		const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
		return res.ok ? 'healthy' : `HTTP ${res.status}`;
	} catch {
		return 'not responding (yet)';
	}
}

async function start() {
	const pid = readPid();
	if (pid && alive(pid)) {
		console.log(`Dev server already running (PID ${pid}).`);
		return status();
	}
	fs.mkdirSync(stateDir, { recursive: true });
	if (!fs.existsSync(path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'))) {
		console.error('Vite is not installed. Run `pnpm install` first.');
		process.exit(1);
	}
	fs.rmSync(pidFile, { force: true });
	if (process.platform === 'win32') {
		// Windows: launch through Start-Process so the server inherits none of this
		// terminal's handles (otherwise piping this command's output would hang).
		const script = fileURLToPath(import.meta.url);
		execFileSync(
			'powershell.exe',
			['-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath '${process.execPath}' -ArgumentList '"${script}"','__child' -WorkingDirectory '${root}' -WindowStyle Hidden`],
			{ stdio: 'ignore', env: { ...process.env, DEV_PORT: String(port) } }
		);
		for (let i = 0; i < 40 && !readPid(); i++) await new Promise((r) => setTimeout(r, 250));
	} else {
		launchVite();
	}
	const child = { pid: readPid() };
	if (!child.pid) {
		console.error('Dev server failed to launch. Last log lines:\n');
		printLogs(30);
		process.exit(1);
	}
	console.log(`Started dev server (PID ${child.pid}). Waiting for it to come up...`);
	for (let i = 0; i < 40; i++) {
		await new Promise((r) => setTimeout(r, 500));
		if (!alive(child.pid)) {
			console.error('Dev server exited during startup. Last log lines:\n');
			printLogs(30);
			process.exit(1);
		}
		if ((await health()) === 'healthy') break;
	}
	await status();
}

/** Spawn Vite detached with output appended to the log file; records its PID. */
function launchVite() {
	fs.mkdirSync(stateDir, { recursive: true });
	const out = fs.openSync(logFile, 'a');
	fs.writeSync(out, `\n===== ${new Date().toISOString()} starting dev server on port ${port} =====\n`);
	const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
	const child = spawn(process.execPath, [viteBin, 'dev', '--host', '0.0.0.0', '--port', String(port), '--strictPort'], {
		cwd: root,
		detached: true,
		stdio: ['ignore', out, out],
		windowsHide: true,
		env: { ...process.env, FORCE_COLOR: '0', DEV_PORT: String(port) }
	});
	fs.writeFileSync(pidFile, String(child.pid));
	child.unref();
	return child.pid;
}

function killTree(pid) {
	if (process.platform === 'win32') {
		try {
			execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
		} catch {
			/* already gone */
		}
	} else {
		try {
			process.kill(-pid, 'SIGTERM');
		} catch {
			try {
				process.kill(pid, 'SIGTERM');
			} catch {
				/* already gone */
			}
		}
	}
}

async function stop() {
	const pid = readPid();
	if (!pid || !alive(pid)) {
		console.log('Dev server is not running.');
		fs.rmSync(pidFile, { force: true });
		return;
	}
	killTree(pid);
	for (let i = 0; i < 20 && alive(pid); i++) await new Promise((r) => setTimeout(r, 250));
	if (alive(pid) && process.platform !== 'win32') process.kill(-pid, 'SIGKILL');
	fs.rmSync(pidFile, { force: true });
	console.log(`Stopped dev server (PID ${pid}).`);
}

async function status() {
	const pid = readPid();
	if (!pid || !alive(pid)) {
		console.log('Dev server: stopped');
		return;
	}
	console.log(`Dev server: running (PID ${pid}) — ${await health()}`);
	console.log(`  Local:   http://localhost:${port}`);
	for (const u of lanUrls()) console.log(`  Network: ${u}   (use this on your phone)`);
	console.log(`  Mock preview: http://localhost:${port}/preview`);
	console.log(`  Logs: ${path.relative(root, logFile)}  (pnpm dev:logs)`);
}

function printLogs(lines = 80) {
	try {
		const text = fs.readFileSync(logFile, 'utf8').split('\n');
		console.log(text.slice(-lines).join('\n'));
	} catch {
		console.log('No log file yet.');
	}
}

function follow() {
	printLogs(40);
	let size = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
	fs.watchFile(logFile, { interval: 500 }, (cur) => {
		if (cur.size > size) {
			const fd = fs.openSync(logFile, 'r');
			const buf = Buffer.alloc(cur.size - size);
			fs.readSync(fd, buf, 0, buf.length, size);
			fs.closeSync(fd);
			process.stdout.write(buf.toString('utf8'));
		}
		size = cur.size;
	});
}

const cmd = process.argv[2];
switch (cmd) {
	case 'start':
		await start();
		break;
	case 'stop':
		await stop();
		break;
	case 'restart':
		await stop();
		await start();
		break;
	case 'status':
		await status();
		break;
	case '__child': // internal: Windows launcher target
		launchVite();
		break;
	case 'logs':
		if (process.argv.includes('-f')) follow();
		else printLogs();
		break;
	default:
		console.log('Usage: node scripts/devserver.mjs <start|stop|restart|status|logs [-f]>');
		process.exit(1);
}
