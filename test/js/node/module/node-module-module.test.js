import { expect, test } from "bun:test";
import { bunEnv, bunExe, ospath } from "harness";
import Module, { _nodeModulePaths, builtinModules, isBuiltin, wrap, createRequire } from "module";
import path from "path";

test("builtinModules exists", () => {
  expect(Array.isArray(builtinModules)).toBe(true);
  expect(builtinModules).toHaveLength(76);
});

test("isBuiltin() works", () => {
  expect(isBuiltin("fs")).toBe(true);
  expect(isBuiltin("path")).toBe(true);
  expect(isBuiltin("crypto")).toBe(true);
  expect(isBuiltin("assert")).toBe(true);
  expect(isBuiltin("util")).toBe(true);
  expect(isBuiltin("events")).toBe(true);
  expect(isBuiltin("node:events")).toBe(true);
  expect(isBuiltin("node:bacon")).toBe(false);
  expect(isBuiltin("node:test")).toBe(true);
  expect(isBuiltin("test")).toBe(false); // "test" does not alias to "node:test"
});

test("module.globalPaths exists", () => {
  expect(Array.isArray(require("module").globalPaths)).toBe(true);
});

test("createRequire trailing slash", () => {
  const req = createRequire(import.meta.dir + "/");
  expect(req.resolve("./node-module-module.test.js")).toBe(
    ospath(path.resolve(import.meta.dir, "./node-module-module.test.js")),
  );
});

test("createRequire trailing slash file url", () => {
  const req = createRequire(Bun.pathToFileURL(import.meta.dir + "/"));
  expect(req.resolve("./node-module-module.test.js")).toBe(
    ospath(path.resolve(import.meta.dir, "./node-module-module.test.js")),
  );
});

test("Module exists", () => {
  expect(Module).toBeDefined();
});

test("module.Module works", () => {
  expect(Module.Module === Module).toBeTrue();

  const m = new Module("asdf");
  expect(m.exports).toEqual({});
});

test("_nodeModulePaths() works", () => {
  const root = path.resolve("/");
  expect(() => {
    _nodeModulePaths();
  }).toThrow();
  expect(_nodeModulePaths(".").length).toBeGreaterThan(0);
  expect(_nodeModulePaths(".").pop()).toBe(root + "node_modules");
  expect(_nodeModulePaths("")).toEqual(_nodeModulePaths("."));
  expect(_nodeModulePaths("/")).toEqual([root + "node_modules"]);
  expect(_nodeModulePaths("/a/b/c/d")).toEqual([
    ospath(root + "a/b/c/d/node_modules"),
    ospath(root + "a/b/c/node_modules"),
    ospath(root + "a/b/node_modules"),
    ospath(root + "a/node_modules"),
    ospath(root + "node_modules"),
  ]);
  expect(_nodeModulePaths("/a/b/../d")).toEqual([
    ospath(root + "a/d/node_modules"),
    ospath(root + "a/node_modules"),
    ospath(root + "node_modules"),
  ]);
});

test("Module.wrap", () => {
  var mod = { exports: {} };
  expect(eval(wrap("exports.foo = 1; return 42"))(mod.exports, mod)).toBe(42);
  expect(mod.exports.foo).toBe(1);
  expect(wrap()).toBe("(function (exports, require, module, __filename, __dirname) { undefined\n});");
});

test("Overwriting _resolveFilename", () => {
  const { stdout, exitCode } = Bun.spawnSync({
    cmd: [bunExe(), "run", path.join(import.meta.dir, "resolveFilenameOverwrite.cjs")],
    env: bunEnv,
    stderr: "inherit",
  });

  expect(stdout.toString().trim().endsWith("--pass--")).toBe(true);
  expect(exitCode).toBe(0);
});

test("Overwriting Module.prototype.require", () => {
  const { stdout, exitCode } = Bun.spawnSync({
    cmd: [bunExe(), "run", path.join(import.meta.dir, "modulePrototypeOverwrite.cjs")],
    env: bunEnv,
    stderr: "inherit",
  });

  expect(stdout.toString().trim().endsWith("--pass--")).toBe(true);
  expect(exitCode).toBe(0);
});

test.each([
  "/file/name/goes/here.js",
  "file/here.js",
  "file\\here.js",
  "/file\\here.js",
  "\\file\\here.js",
  "\\file/here.js",
])("Module.prototype._compile", filename => {
  const module = new Module("module id goes here");
  const starting_exports = module.exports;
  const r = module._compile("module.exports = { module, exports, require, __filename, __dirname }", filename);
  expect(r).toBe(undefined);
  expect(module.exports).not.toBe(starting_exports);
  const { module: m, exports: e, require: req, __filename: fn, __dirname: dn } = module.exports;
  expect(m).toBe(module);
  expect(e).toBe(starting_exports);
  expect(req).toBe(module.require);
  expect(fn).toBe(filename);
  expect(dn).toBe(path.dirname(filename));
});

test("Module._extensions", () => {
  expect(".js" in Module._extensions).toBeTrue();
  expect(".json" in Module._extensions).toBeTrue();
  expect(".node" in Module._extensions).toBeTrue();
  expect(require.extensions).toBe(Module._extensions);
});

test("Module._resolveLookupPaths", () => {
  expect(Module._resolveLookupPaths("foo")).toEqual([]);
  expect(Module._resolveLookupPaths("./bar", { id: "1", filename: "/baz/abc" })).toEqual(["/baz"]);
  expect(Module._resolveLookupPaths("./bar", {})).toEqual(["."]);
  expect(Module._resolveLookupPaths("./bar", { paths: ["a"] })).toEqual(["."]);
  expect(Module._resolveLookupPaths("bar", { paths: ["a"] })).toEqual(["a"]);
});

test("Module.findSourceMap doesn't throw", () => {
  expect(Module.findSourceMap("foo")).toEqual(undefined);
});

test("require cache relative specifier", () => {
  require.cache['./bar.cjs'] = { exports: { default: 'bar' } };
  expect(() => require('./bar.cjs')).toThrow("Cannot find module");
});
test("builtin resolution", () => {
  expect(require.resolve("fs")).toBe("fs");
  expect(require.resolve("node:fs")).toBe("node:fs");
});
test("require cache node builtins specifier", () => {
  // as js builtin
  try {
    const fake = { default: 'bar' };
    const real = require('fs');
    expect(require.cache['fs']).toBe(undefined);
    require.cache['fs'] = { exports: fake };
    expect(require('fs')).toBe(fake);
    expect(require("node:fs")).toBe(real);
  } finally {
    delete require.cache['fs'];
  }

  // as native module
  try {
    const fake = { default: 'bar' };
    const real = require('util/types');
    expect(require.cache['util/types']).toBe(undefined);
    require.cache['util/types'] = { exports: fake };
    expect(require('util/types')).toBe(fake);
    expect(require("node:util/types")).toBe(real);
  } finally {
    delete require.cache['util/types'];
  }
});
test("require a cjs file uses the 'module.exports' export", () => {
  expect(require("./esm_to_cjs_interop.mjs")).toEqual(Symbol.for("meow"));
});

test("Module.runMain", () => {
  const { stdout, exitCode } = Bun.spawnSync({
    cmd: [bunExe(), "--require", path.join(import.meta.dir, "overwrite-module-run-main-1.cjs"), path.join(import.meta.dir, "overwrite-module-run-main-2.cjs")],
    env: bunEnv,
    stderr: "inherit",
  });

  expect(stdout.toString().trim()).toBe("pass");
  expect(exitCode).toBe(0);
});
test("Module.runMain 2", () => {
  const { stdout, exitCode } = Bun.spawnSync({
    cmd: [bunExe(), "--require", path.join(import.meta.dir, "overwrite-module-run-main-3.cjs"), path.join(import.meta.dir, "overwrite-module-run-main-2.cjs")],
    env: bunEnv,
    stderr: "inherit",
  });

  expect(stdout.toString().trim()).toBe("pass");
  expect(exitCode).toBe(0);
});
test.each([
  "no args",
  "--access-early",
])("children, %s", arg => {
  const { stdout, exitCode } = Bun.spawnSync({
    cmd: [bunExe(), path.join(import.meta.dir, "children-fixture/a.cjs"), arg],
    env: bunEnv,
    stderr: "inherit",
  });
  expect(stdout.toString().trim()).toBe(`. (./a.cjs)
 ./b.cjs
  . (./a.cjs) (seen)
  ./b.cjs (seen)
  ./c.cjs
   ./d.cjs
    ./d.cjs (seen)
 ./d.cjs (seen)
 ./f.cjs
  ./d.cjs (seen)
 ./g.cjs
  ./b.cjs (seen)
  . (./a.cjs) (seen)
  ./h.cjs
   ./i.cjs
    ./j.cjs
     ./i.cjs (seen)
     ./j.cjs (seen)
     ./k.cjs
      ./j.cjs (seen)
   ./j.cjs (seen)
   ./k.cjs (seen)`);
});