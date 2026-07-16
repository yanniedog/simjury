import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), "..");
const REQUIRED_NODE_MAJOR = 24;
const SECRET_PATTERN = /\b(?:gh[oprsu]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g;

export function commandFor(
  name,
  args,
  { platform = process.platform, env = process.env, node = process.execPath } = {},
) {
  if (name !== "npm") return { command: name, args };
  if (env.npm_execpath) {
    return { command: node, args: [env.npm_execpath, ...args] };
  }
  if (platform === "win32") {
    return {
      command: env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npm", ...args],
    };
  }
  return { command: "npm", args };
}

export function isSupportedNode(version) {
  const major = Number.parseInt(String(version).replace(/^v/, "").split(".")[0], 10);
  return major === REQUIRED_NODE_MAJOR;
}

export function redactSensitive(value, env = process.env) {
  let redacted = String(value ?? "").replace(SECRET_PATTERN, "[redacted]");
  for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "NPM_TOKEN", "NODE_AUTH_TOKEN"]) {
    const secret = env[name];
    if (secret) redacted = redacted.replaceAll(secret, "[redacted]");
  }
  return redacted
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
    .replace(/(authorization:\s*(?:bearer|token)\s+)\S+/gi, "$1[redacted]")
    .replace(/(_authToken=)[^\s]+/gi, "$1[redacted]")
    .trim()
    .slice(0, 1200);
}

export function dependencyFailureRemedy({ install, installFailed }) {
  if (installFailed) return "npm ci was attempted but failed; fix the install error above";
  if (install) return "npm ci completed but the installed dependency tree is invalid";
  return "dependencies are missing or invalid; run npm run cloud:bootstrap -- --install";
}

export function parseOptions(args) {
  const allowed = new Set(["--check", "--install", "--help"]);
  const unknown = args.filter((arg) => !allowed.has(arg));
  if (unknown.length > 0) {
    throw new Error(`Unknown option: ${unknown.join(", ")}`);
  }
  if (args.includes("--check") && args.includes("--install")) {
    throw new Error("Choose either --check or --install, not both.");
  }
  const help = args.includes("--help");
  const install = args.includes("--install");
  return {
    help,
    check: !help && !install,
    install,
  };
}

function run(name, args, { timeout = 30_000 } = {}) {
  const invocation = commandFor(name, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout,
    windowsHide: true,
    maxBuffer: 5 * 1024 * 1024,
  });
  return {
    ok: result.status === 0 && !result.error,
    output: String(result.stdout ?? "").trim(),
    error: redactSensitive(result.stderr || result.error?.message),
  };
}

function usage() {
  console.log(`Usage: npm run cloud:bootstrap -- [--check|--install]

  --check    Run read-only readiness checks (default).
  --install  Install locked site dependencies, then run all checks.

Credentials must come from gh auth login or an injected GH_TOKEN. This script
never writes credentials to repository files or Git configuration.`);
}

export function main(args = process.argv.slice(2)) {
  let options;
  try {
    options = parseOptions(args);
  } catch (error) {
    console.error(`[fail] arguments: ${error.message}`);
    usage();
    return 2;
  }

  if (options.help) {
    usage();
    return 0;
  }

  let failures = 0;
  const pass = (label, detail = "") => {
    console.log(`[pass] ${label}${detail ? `: ${detail}` : ""}`);
  };
  const fail = (label, remedy, detail = "") => {
    failures += 1;
    console.error(`[fail] ${label}: ${remedy}`);
    if (detail) console.error(`       ${detail}`);
  };

  if (isSupportedNode(process.version)) {
    pass("Node.js", process.version);
  } else {
    fail("Node.js", `use Node ${REQUIRED_NODE_MAJOR} (found ${process.version})`);
  }

  const checkout = run("git", ["rev-parse", "--is-inside-work-tree"]);
  if (checkout.ok && checkout.output === "true") {
    pass("Git checkout");
  } else {
    fail("Git checkout", "run this command from a Git worktree", checkout.error);
  }

  const branch = run("git", ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (!branch.ok) {
    fail("Topic branch", "check out a named branch before making cloud changes", branch.error);
  } else if (branch.output === "main") {
    fail("Topic branch", "create a feature branch; do not work directly on main");
  } else {
    pass("Topic branch", branch.output);
  }

  const conflicts = run("git", ["diff", "--name-only", "--diff-filter=U"]);
  const unfinishedMerge = run("git", [
    "rev-parse",
    "--quiet",
    "--verify",
    "MERGE_HEAD",
  ]);
  if (conflicts.ok && conflicts.output === "" && !unfinishedMerge.ok) {
    pass("Merge state", "no unresolved files");
  } else {
    fail("Merge state", "finish or abort the current merge before continuing", conflicts.error);
  }

  const origin = run("git", ["remote", "get-url", "origin"]);
  if (origin.ok && origin.output !== "") {
    pass("Origin remote", "configured");
  } else {
    fail("Origin remote", "configure the repository's origin remote", origin.error);
  }

  if (origin.ok) {
    const remote = run("git", ["ls-remote", "--exit-code", "origin", "HEAD"], {
      timeout: 45_000,
    });
    if (remote.ok) {
      pass("Origin reachability");
    } else {
      fail("Origin reachability", "check network access and Git credentials", remote.error);
    }
  }

  if (origin.ok && branch.ok && branch.output !== "main") {
    const push = run(
      "git",
      [
        "push",
        "--dry-run",
        "--porcelain",
        "origin",
        `HEAD:refs/heads/${branch.output}`,
      ],
      { timeout: 45_000 },
    );
    if (push.ok) {
      pass("Origin push readiness", "dry-run accepted");
    } else {
      fail(
        "Origin push readiness",
        "confirm push permission and that the topic branch is fast-forwardable",
        push.error,
      );
    }
  }

  const gh = run("gh", ["--version"]);
  if (gh.ok) {
    pass("GitHub CLI", "installed");
    const auth = run("gh", ["auth", "status", "--hostname", "github.com"]);
    if (auth.ok) {
      pass("GitHub authentication");
    } else {
      fail(
        "GitHub authentication",
        "run gh auth login or inject GH_TOKEN securely",
        auth.error,
      );
    }
  } else {
    fail("GitHub CLI", "install gh and make it available on PATH", gh.error);
  }

  const packages = [
    { label: "site", prefix: "site" },
    { label: "site/app", prefix: "site/app" },
  ];
  for (const item of packages) {
    const lockfile = resolve(ROOT, item.prefix, "package-lock.json");
    if (existsSync(lockfile)) {
      pass(`${item.label} lockfile`);
    } else {
      fail(`${item.label} lockfile`, `restore ${item.prefix}/package-lock.json`);
    }
  }

  if (failures > 0) {
    console.error(`\nCloud bootstrap stopped with ${failures} preflight failure(s).`);
    return 1;
  }

  const installFailures = new Set();
  if (options.install) {
    for (const item of packages) {
      console.log(`[run] npm --prefix ${item.prefix} ci`);
      const install = run("npm", ["--prefix", item.prefix, "ci"], {
        timeout: 240_000,
      });
      if (!install.ok) {
        installFailures.add(item.prefix);
        fail(`${item.label} install`, "npm ci failed", install.error);
      } else {
        pass(`${item.label} install`);
      }
    }
  }

  for (const item of packages) {
    const dependencies = run(
      "npm",
      ["--prefix", item.prefix, "ls", "--all", "--silent"],
      { timeout: 60_000 },
    );
    if (dependencies.ok) {
      pass(`${item.label} dependencies`);
    } else {
      fail(
        `${item.label} dependencies`,
        dependencyFailureRemedy({
          install: options.install,
          installFailed: installFailures?.has(item.prefix) ?? false,
        }),
        dependencies.error,
      );
    }
  }

  if (failures > 0) {
    console.error(`\nCloud bootstrap failed with ${failures} readiness failure(s).`);
    return 1;
  }

  console.log("\nCloud checkout is ready for SimJury development and PR delivery.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  process.exitCode = main();
}
