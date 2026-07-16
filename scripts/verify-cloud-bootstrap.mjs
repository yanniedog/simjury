import assert from "node:assert/strict";
import {
  commandFor,
  isSupportedNode,
  parseOptions,
} from "./cloud-bootstrap.mjs";

assert.deepEqual(parseOptions([]), { help: false, install: false });
assert.deepEqual(parseOptions(["--check"]), { help: false, install: false });
assert.deepEqual(parseOptions(["--install"]), { help: false, install: true });
assert.deepEqual(parseOptions(["--help"]), { help: true, install: false });
assert.throws(() => parseOptions(["--check", "--install"]), /either/);
assert.throws(() => parseOptions(["--unknown"]), /Unknown option/);

assert.equal(isSupportedNode("v24.0.0"), true);
assert.equal(isSupportedNode("24.12.0"), true);
assert.equal(isSupportedNode("v23.11.0"), false);
assert.equal(isSupportedNode("v25.0.0"), false);

assert.deepEqual(commandFor("git", ["status"]), {
  command: "git",
  args: ["status"],
});
assert.deepEqual(
  commandFor("npm", ["ci"], {
    platform: "win32",
    env: { ComSpec: "cmd.exe" },
  }),
  { command: "cmd.exe", args: ["/d", "/s", "/c", "npm", "ci"] },
);
assert.deepEqual(
  commandFor("npm", ["ci"], {
    platform: "linux",
    env: { npm_execpath: "/npm/npm-cli.js" },
    node: "/usr/bin/node",
  }),
  { command: "/usr/bin/node", args: ["/npm/npm-cli.js", "ci"] },
);

console.log("cloud bootstrap verifier passed");
