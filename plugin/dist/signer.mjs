import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod2) => function __require2() {
  try {
    return mod2 || (0, cb[__getOwnPropNames(cb)[0]])((mod2 = { exports: {} }).exports, mod2), mod2.exports;
  } catch (e) {
    throw mod2 = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod2, isNodeMode, target) => (target = mod2 != null ? __create(__getProtoOf(mod2)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod2 || !mod2.__esModule ? __defProp(target, "default", { value: mod2, enumerable: true }) : target,
  mod2
));

// node_modules/dotenv/dist/index.cjs
var require_dist = __commonJS({
  "node_modules/dotenv/dist/index.cjs"(exports, module) {
    var I = (e, o) => () => {
      try {
        return o || e((o = { exports: {} }).exports, o), o.exports;
      } catch (t) {
        throw o = 0, t;
      }
    };
    var S = I((xe, U) => {
      function G(e) {
        return typeof e == "string" ? !["false", "0", "no", "off", ""].includes(e.toLowerCase()) : !!e;
      }
      function X(e = process.env) {
        let o = {};
        for (let t of ["ENCODING", "PATH", "QUIET", "DEBUG", "OVERRIDE", "FAST"]) {
          let n3 = e[`DOTENV_${t}`] != null ? e[`DOTENV_${t}`] : e[`DOTENV_CONFIG_${t}`];
          n3 != null && (o[t.toLowerCase()] = t === "ENCODING" || t === "PATH" ? n3 : G(n3));
        }
        return o;
      }
      U.exports = { parseBoolean: G, optionsFromEnv: X };
    });
    var N = I((ye, x) => {
      var Y = __require("fs"), j = __require("path"), z = __require("os"), { URL: Z, fileURLToPath: ee } = __require("url"), { parseBoolean: k, optionsFromEnv: B2 } = S(), te = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg, b = new Uint8Array(256);
      for (let e = 48; e <= 57; e++) b[e] = 1;
      for (let e = 65; e <= 90; e++) b[e] = 1;
      for (let e = 97; e <= 122; e++) b[e] = 1;
      b[45] = 1;
      b[46] = 1;
      b[95] = 1;
      function re(e) {
        let o = {}, t = e.toString();
        t = t.replace(/\r\n?/mg, `
`);
        let n3;
        for (; (n3 = te.exec(t)) != null; ) {
          let r = n3[1], s = n3[2] || "";
          s = s.trim();
          let i = s[0];
          s = s.replace(/^(['"`])([\s\S]*)\1$/mg, "$2"), i === '"' && (s = s.replace(/\\n/g, `
`), s = s.replace(/\\r/g, "\r")), o[r] = s;
        }
        return o;
      }
      function w(e) {
        return e <= 32 ? e === 32 || e >= 9 && e <= 13 : e >= 160 && (e === 160 || e === 5760 || e >= 8192 && e <= 8202 || e === 8232 || e === 8233 || e === 8239 || e === 8287 || e === 12288 || e === 65279);
      }
      function O(e) {
        return e === 10 || e === 8232 || e === 8233;
      }
      function oe(e) {
        let o = {}, t = typeof e == "string" ? e : e.toString();
        t.indexOf("\r") !== -1 && (t = t.replace(/\r\n?/g, `
`));
        let n3 = t.length, r = 0;
        for (; r < n3; ) {
          let s = t.charCodeAt(r);
          for (; r < n3 && w(s); ) r++, s = t.charCodeAt(r);
          if (r >= n3) break;
          if (s === 35) {
            for (; r < n3 && !O(t.charCodeAt(r)); ) r++;
            continue;
          }
          let i = -1;
          if (s === 101 && r + 6 < n3 && t.charCodeAt(r + 1) === 120 && t.charCodeAt(r + 2) === 112 && t.charCodeAt(r + 3) === 111 && t.charCodeAt(r + 4) === 114 && t.charCodeAt(r + 5) === 116) {
            let C = t.charCodeAt(r + 6);
            if (w(C)) {
              let d = r + 7;
              for (; d < n3 && w(t.charCodeAt(d)); ) d++;
              b[t.charCodeAt(d)] && (i = r + 6, r = d);
            } else s = t.charCodeAt(r);
          }
          let l = r, u = 0;
          for (; r < n3 && (u = t.charCodeAt(r), b[u]); ) r++;
          if (r === l) {
            for (; r < n3 && !O(t.charCodeAt(r)); ) r++;
            continue;
          }
          let p = t.slice(l, r), f = r;
          if (r >= n3 && (u = 0), w(u)) do
            r++, u = r < n3 ? t.charCodeAt(r) : 0;
          while (w(u));
          if (u === 61) r++;
          else if (u === 58 && r === f && r + 1 < n3 && w(t.charCodeAt(r + 1))) r += 2;
          else {
            for (r = i === -1 ? f : i; r < n3 && !O(t.charCodeAt(r)); ) r++;
            continue;
          }
          let c = r, a = r;
          for (; a < n3 && w(t.charCodeAt(a)); ) a++;
          let g = t.charCodeAt(a), h, y = false;
          if (g === 39 || g === 34 || g === 96) {
            let C = t[a], d = t.indexOf(C, a + 1), m = -1, v = -1;
            for (; d !== -1; ) {
              let q = t.charCodeAt(d - 1) === 92, A = d + 1;
              for (; A < n3 && !O(t.charCodeAt(A)) && w(t.charCodeAt(A)); ) A++;
              if ((A === n3 || O(t.charCodeAt(A)) || t.charCodeAt(A) === 35) && (m = d, v = A), !q) break;
              d = t.indexOf(C, d + 1);
            }
            if (m !== -1) {
              if (h = t.slice(a + 1, m), r = v, t.charCodeAt(r) === 35) for (; r < n3 && !O(t.charCodeAt(r)); ) r++;
              y = true;
            }
          }
          if (!y) {
            let C = t.indexOf(`
`, c);
            C === -1 && (C = n3);
            let d = t.indexOf("#", c);
            (d === -1 || d > C) && (d = C);
            let m = c, v = d;
            for (; m < v && w(t.charCodeAt(m)); ) m++;
            for (; v > m && w(t.charCodeAt(v - 1)); ) v--;
            let q = t.charCodeAt(m);
            if (v - m >= 2 && (q === 39 || q === 34 || q === 96) && t.charCodeAt(v - 1) === q ? h = t.slice(m + 1, v - 1) : h = t.slice(m, v), r = d, d < C) for (; r < n3 && !O(t.charCodeAt(r)); ) r++;
          }
          g === 34 && (y || a < r) && h.indexOf("\\") !== -1 && (h = h.replace(/\\n/g, `
`).replace(/\\r/g, "\r")), o[p] = h;
        }
        return o;
      }
      function ne(e, o) {
        return o && k(o.fast) ? oe(e) : re(e);
      }
      function T(e) {
        console.log(`\u2506 ${e}`);
      }
      function se(e) {
        console.error(`\u25C7 ${e}`);
      }
      function V(e) {
        return e[0] === "~" ? j.join(z.homedir(), e.slice(1)) : e;
      }
      function ie(e = {}) {
        return { ...B2(), ...e };
      }
      function ce(e) {
        e = ie(e);
        let o = j.resolve(process.cwd(), ".env"), t = "utf8", n3 = process.env;
        e && e.processEnv != null && (n3 = e.processEnv);
        let r = k(e && e.debug);
        e && e.encoding ? t = e.encoding : r && T("no encoding is specified (UTF-8 is used by default)");
        let s = [o];
        if (e && e.path) if (!Array.isArray(e.path)) s = [V(e.path)];
        else {
          s = [];
          for (let c of e.path) s.push(V(c));
        }
        let i, l = {}, u = { fast: e.fast };
        for (let c of s) try {
          let a = E.parse(Y.readFileSync(c, { encoding: t }), u);
          E.populate(l, a, e);
        } catch (a) {
          r && T(`failed to load ${c} ${a.message}`), i = a;
        }
        let p = E.populate(n3, l, e), f = k(Object.prototype.hasOwnProperty.call(e, "quiet") ? e.quiet : B2(n3).quiet);
        if (r || !f) {
          let c = Object.keys(p).length, a = [];
          for (let g of s) try {
            let h = j.relative(process.cwd(), g instanceof Z ? ee(g) : g);
            a.push(h);
          } catch (h) {
            r && T(`failed to load ${g} ${h.message}`), i = h;
          }
          se(`injected env (${c}) from ${a.join(",")}`);
        }
        return i ? { parsed: l, error: i } : { parsed: l };
      }
      function ae(e) {
        return E.configDotenv(e);
      }
      function le(e, o, t = {}) {
        let n3 = !!(t && t.debug), r = !!(t && t.override), s = {};
        if (e === null || typeof e != "object" || o === null || typeof o != "object") {
          let i = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
          throw i.code = "OBJECT_REQUIRED", i;
        }
        for (let i of Object.keys(o)) Object.prototype.hasOwnProperty.call(e, i) ? (r === true && (e[i] = o[i], s[i] = o[i]), n3 && T(r === true ? `"${i}" is already defined and WAS overwritten` : `"${i}" is already defined and was NOT overwritten`)) : (e[i] = o[i], s[i] = o[i]);
        return s;
      }
      var E = { configDotenv: ce, config: ae, parse: ne, populate: le };
      x.exports.configDotenv = E.configDotenv;
      x.exports.config = E.config;
      x.exports.parse = E.parse;
      x.exports.populate = E.populate;
      x.exports = E;
    });
    var M = I((Te, W) => {
      var _ = __require("child_process"), fe = __require("fs"), L = __require("path");
      function ue(e) {
        let o = ['"'], t = 0;
        for (let n3 of e) {
          if (n3 === "\\") {
            t++;
            continue;
          }
          n3 === '"' ? o.push("\\".repeat(t * 2 + 1), '"') : o.push("\\".repeat(t), n3), t = 0;
        }
        return o.push("\\".repeat(t * 2), '"'), o.join("");
      }
      function H(e, o = 1) {
        for (let t = 0; t < o; t++) {
          let n3 = [];
          for (let r of e) {
            let s = r.charCodeAt(0), i = s >= 48 && s <= 57 || s >= 65 && s <= 90 || s >= 97 && s <= 122, l = "\\/:._-".includes(r);
            !i && !l && s < 128 && n3.push("^"), n3.push(r);
          }
          e = n3.join("");
        }
        return e;
      }
      function P(e, o) {
        let t = Object.keys(e).reverse().find((n3) => n3.toUpperCase() === o);
        return t === void 0 ? void 0 : e[t];
      }
      function de(e, o, t) {
        let n3 = (P(o, "PATHEXT") || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean), s = n3.some((l) => e.toLowerCase().endsWith(l.toLowerCase())) ? ["", ...n3] : [...n3, ""], i = /[\\/]/.test(e) ? [t] : [t, ...(P(o, "PATH") || "").split(";")];
        for (let l of i) for (let u of s) {
          let p = L.resolve(t, l.replace(/^"|"$/g, ""), e + u);
          try {
            if (fe.statSync(p).isFile()) return p;
          } catch {
          }
        }
      }
      function pe(e, o, t) {
        if (process.platform !== "win32") return _.spawn(e, o, t);
        let n3 = t.env || process.env, r = de(e, n3, t.cwd || process.cwd());
        if (r && /\.(?:exe|com)$/i.test(r)) return _.spawn(r, o, t);
        let s = /\.(?:bat|cmd)$/i.test(r || e), i = [H(L.normalize(r || e))];
        for (let u of o) i.push(H(ue(u), s ? 2 : 1));
        let l = i.join(" ");
        return _.spawn(P(n3, "COMSPEC") || "cmd.exe", ["/d", "/v:off", "/s", "/c", `"${l}"`], { ...t, windowsVerbatimArguments: true });
      }
      W.exports = pe;
    });
    var K = I(($e, F) => {
      var he = __require("fs"), ge = __require("os"), Q = __require("path"), me = __require("child_process"), ve = M(), R = N(), { optionsFromEnv: Ce } = S();
      function $() {
        console.log(["Usage: dotenv run [--help] [-q|--quiet] [--debug] [--override] [--fast] [-f|--file <paths>] [--] <command> [args...]", "", "Run a command with environment variables from a .env file.", "Place dotenv options before the command; all following arguments go to the command.", "", "Options:", "  -f, --file <paths>  .env paths, comma-separated or repeated (default: .env)", "  -q, --quiet suppress the injected env message", "  --debug     enable debug logging", "  --override  override existing environment variables", "  --fast      use the faster character-scanner parser", "", "Environment variables (DOTENV_CONFIG_* names remain as fallbacks):", "  DOTENV_PATH, DOTENV_ENCODING, DOTENV_QUIET,", "  DOTENV_DEBUG, DOTENV_OVERRIDE,", "  DOTENV_FAST"].join(`
`));
      }
      function we(e) {
        let o = [], t = false, n3, r, s, i, l = -1;
        for (let p = 0; p < e.length; p++) {
          let f = e[p];
          if (f === "--") {
            l = p + 1;
            break;
          }
          if (f === "--help" || f === "-h") return { help: true };
          if (f === "--quiet" || f === "-q") {
            n3 = true;
            continue;
          }
          if (f === "--debug") {
            r = true;
            continue;
          }
          if (f === "--override") {
            s = true;
            continue;
          }
          if (f === "--fast") {
            i = true;
            continue;
          }
          if (f === "-f" || f === "--file" || f.startsWith("-f=") || f.startsWith("--file=")) {
            let c = f.indexOf("="), a = c === -1 ? f : f.slice(0, c), g = c === -1 ? e[++p] : f.slice(c + 1);
            if (!g || g === "--") return { error: `${a} requires a path` };
            let h = g.split(",").map((y) => y.trim()).filter(Boolean);
            if (h.length === 0) return { error: `${a} requires a path` };
            o.push(...h), t = true;
            continue;
          }
          if (f.startsWith("-")) return { error: `unknown option: ${f}` };
          l = p;
          break;
        }
        let u = l === -1 ? [] : e.slice(l);
        return { paths: o, pathSet: t, quiet: n3, debug: r, override: s, fast: i, command: u };
      }
      function Ee(e) {
        return e[0] === "~" ? Q.join(ge.homedir(), e.slice(1)) : e;
      }
      function Ae(e) {
        let o = Ce(), t = { encoding: o.encoding || "utf8", quiet: o.quiet === true, debug: o.debug === true, override: o.override === true, fast: o.fast === true, paths: [".env"], defaultPath: true };
        return o.path != null && (t.paths = [o.path], t.defaultPath = false), e.pathSet && (t.paths = e.paths, t.defaultPath = false), e.quiet != null && (t.quiet = e.quiet), e.debug != null && (t.debug = e.debug), e.override != null && (t.override = e.override), e.fast != null && (t.fast = e.fast), t;
      }
      function be(e) {
        let o = {}, t = [], n3 = { override: e.override, debug: e.debug };
        for (let s of e.paths) {
          let i = Q.resolve(process.cwd(), Ee(s));
          try {
            let l = R.parse(he.readFileSync(i, { encoding: e.encoding }), { fast: e.fast });
            R.populate(o, l, n3), t.push(s);
          } catch (l) {
            if (e.debug && console.log(`\u2506 failed to load ${s} ${l.message}`), !(e.defaultPath && l.code === "ENOENT")) throw l;
          }
        }
        return { injected: R.populate(process.env, o, n3), loadedPaths: t };
      }
      function J(e) {
        let o = e[0];
        if (o === "--help" || o === "-h") {
          $();
          return;
        }
        if (o !== "run") {
          $(), process.exitCode = 1;
          return;
        }
        let t = we(e.slice(1));
        if (t.help) {
          $();
          return;
        }
        if (t.error) {
          console.error(`dotenv: ${t.error}`), $(), process.exitCode = 1;
          return;
        }
        if (t.command.length === 0) {
          $(), process.exitCode = 1;
          return;
        }
        let n3 = Ae(t);
        try {
          let c = be(n3);
          if (!n3.quiet) {
            let a = `\u25C7 injected env (${Object.keys(c.injected).length})`;
            c.loadedPaths.length > 0 && (a += ` from ${c.loadedPaths.join(", ")}`), console.error(a);
          }
        } catch (c) {
          console.error(`dotenv: ${c.message}`), process.exitCode = 1;
          return;
        }
        let r = !!process.stdin.isTTY, s = process.platform !== "win32" && !r, i = ve(t.command[0], t.command.slice(1), { stdio: "inherit", detached: s }), l = /* @__PURE__ */ new Map(), u = 0;
        function p(c) {
          if (!(!i.pid || i.exitCode !== null || i.signalCode !== null)) {
            if (process.platform === "win32") {
              me.spawnSync("taskkill", ["/pid", String(i.pid), "/T", "/F"], { stdio: "ignore" });
              return;
            }
            try {
              process.kill(s ? -i.pid : i.pid, c);
            } catch (a) {
              if (a.code !== "ESRCH") throw a;
            }
          }
        }
        function f() {
          for (let [c, a] of l) process.removeListener(c, a);
        }
        for (let c of ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"]) {
          let a = () => {
            if (c === "SIGINT") {
              if (u++, r && process.platform !== "win32" && u === 1) return;
              if (u > 1) {
                p(u === 2 ? "SIGTERM" : "SIGKILL");
                return;
              }
            }
            p(c);
          };
          l.set(c, a), process.on(c, a);
        }
        i.on("error", function(c) {
          f(), console.error(`dotenv: ${c.message}`), process.exitCode = 1;
        }), i.on("exit", function(c, a) {
          f(), typeof c == "number" ? process.exit(c) : (setInterval(() => {
          }, 1e3), process.kill(process.pid, a));
        });
      }
      F.exports = J;
      __require.main === F && J(process.argv.slice(2));
    });
    var D = N();
    var Oe = K();
    module.exports = D;
    module.exports.config = D.config;
    module.exports.configDotenv = D.configDotenv;
    module.exports.parse = D.parse;
    module.exports.populate = D.populate;
    __require.main === module && Oe(process.argv.slice(2));
  }
});

// src/live/signer/server.ts
import { randomBytes as randomBytes4, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync as mkdirSync4, rmSync as rmSync2, writeFileSync as writeFileSync2 } from "node:fs";

// src/live/keystore.ts
import { createCipheriv, createDecipheriv, randomBytes as randomBytes3, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// node_modules/@scure/base/index.js
var freeze = (fn) => Object.freeze(fn());
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
function abytes(b) {
  if (!isBytes(b))
    throw new TypeError("Uint8Array expected");
}
function afn(input) {
  if (typeof input !== "function")
    throw new TypeError("function expected");
  return true;
}
function astr(label, input) {
  if (typeof input !== "string")
    throw new TypeError(`${label}: string expected`);
  return true;
}
function anumber(n3, title = "number") {
  if (typeof n3 !== "number")
    throw new TypeError(`${title}: expected number, got ${typeof n3}`);
  if (!Number.isSafeInteger(n3))
    throw new RangeError(`${title}: expected safe integer, got ${n3}`);
}
function chain(...args) {
  const id = (a) => a;
  const wrap = (a, b) => (c) => a(b(c));
  const encode = args.map((x) => x.encode).reduceRight(wrap, id);
  const decode = args.map((x) => x.decode).reduce(wrap, id);
  return { encode, decode };
}
var asciiDecoder = /* @__PURE__ */ (() => {
  try {
    const decoder = new TextDecoder();
    return decoder.decode(Uint8Array.of(65, 48, 43, 127)) === "A0+\x7F" ? decoder : void 0;
  } catch (e) {
    return void 0;
  }
})();
var B2S_CHUNK = 8192;
function charcodesToString(codes) {
  const len = codes.length;
  if (asciiDecoder !== void 0 && len >= 12)
    return asciiDecoder.decode(codes);
  if (len <= B2S_CHUNK)
    return String.fromCharCode.apply(null, codes);
  let res = "";
  for (let i = 0; i < len; i += B2S_CHUNK)
    res += String.fromCharCode.apply(null, codes.subarray(i, i + B2S_CHUNK));
  return res;
}
function alphabet(letters, aliases) {
  const len = letters.length;
  if (len > 128)
    throw new Error("alphabet: max 128 letters");
  const encTable = new Uint8Array(len);
  const decTable = new Int8Array(128).fill(-1);
  for (let i = 0; i < len; i++) {
    const code = letters.charCodeAt(i);
    if (letters.codePointAt(i) !== code || code > 127)
      throw new Error("alphabet: single-char ASCII letters only");
    encTable[i] = code;
    decTable[code] = i;
  }
  if (aliases !== void 0) {
    for (const alias of Object.keys(aliases)) {
      const code = alias.charCodeAt(0);
      const target = decTable[aliases[alias].charCodeAt(0)];
      if (alias.length !== 1 || code > 127 || target === void 0 || target === -1)
        throw new Error(`alphabet: invalid alias ${alias}`);
      decTable[code] = target;
    }
  }
  return {
    encode: (digits) => {
      const codes = new Uint8Array(digits.length);
      for (let i = 0; i < digits.length; i++) {
        const d = digits[i];
        const code = encTable[d];
        if (code === void 0)
          throw new Error(`alphabet.encode: invalid digit ${d}`);
        codes[i] = code;
      }
      return charcodesToString(codes);
    },
    decode: (input) => {
      astr("decode", input);
      const slen = input.length;
      const digits = new Uint8Array(slen);
      for (let i = 0; i < slen; i++) {
        const code = input.charCodeAt(i);
        const digit = code < 128 ? decTable[code] : -1;
        if (digit === -1)
          throw new Error(`Unknown letter "${input[i]}". Allowed: ${letters}`);
        digits[i] = digit;
      }
      return digits;
    }
  };
}
function checksum(len, fn) {
  anumber(len);
  if (len <= 0)
    throw new RangeError(`checksum length must be positive: ${len}`);
  afn(fn);
  const _fn = fn;
  return {
    encode(data) {
      abytes(data);
      const sum = _fn(data).slice(0, len);
      const res = new Uint8Array(data.length + len);
      res.set(data);
      res.set(sum, data.length);
      return res;
    },
    decode(data) {
      abytes(data);
      const payload = data.slice(0, -len);
      const oldChecksum = data.slice(-len);
      const newChecksum = _fn(payload).slice(0, len);
      for (let i = 0; i < len; i++)
        if (newChecksum[i] !== oldChecksum[i])
          throw new Error("Invalid checksum");
      return payload;
    }
  };
}
var B58_GROUP = 656356768;
var RADIX_BASE_N_MAX_LENGTH = 65536;
var BASE_N_MAX_BYTES = 2048;
var BASE_N_MAX_CHARS = 4096;
var radixBaseN = (BASE3, GROUP) => ({
  encode: (bytes) => {
    abytes(bytes);
    const blen = bytes.length;
    if (blen === 0)
      return new Uint8Array(0);
    if (blen >= RADIX_BASE_N_MAX_LENGTH)
      throw new Error("invalid length");
    let zeros = 0;
    while (zeros < blen - 1 && bytes[zeros] === 0)
      zeros++;
    const nlimbs = Math.ceil(blen / 2);
    const limbs = new Uint16Array(nlimbs);
    const odd = blen & 1;
    if (odd)
      limbs[0] = bytes[0];
    for (let i = odd, j2 = odd; i < blen; i += 2, j2++)
      limbs[j2] = bytes[i] << 8 | bytes[i + 1];
    const groups = [];
    let pos = 0;
    while (pos < nlimbs) {
      let carry = 0;
      for (let i = pos; i < nlimbs; i++) {
        const cur = carry * 65536 + limbs[i];
        const q = Math.floor(cur / GROUP);
        carry = cur - q * GROUP;
        limbs[i] = q;
        if (q === 0 && i === pos)
          pos++;
      }
      groups.push(carry);
    }
    const top = groups.length - 1;
    let sig = top * 5;
    for (let v = groups[top]; ; v = Math.floor(v / BASE3)) {
      sig++;
      if (v < BASE3)
        break;
    }
    const res = new Uint8Array(zeros + sig);
    let j = res.length - 1;
    for (let g = 0; g < top; g++) {
      let v = groups[g];
      for (let k = 0; k < 5; k++) {
        res[j--] = v % BASE3;
        v = Math.floor(v / BASE3);
      }
    }
    for (let v = groups[top]; j >= zeros; v = Math.floor(v / BASE3))
      res[j--] = v % BASE3;
    return res;
  },
  decode: (digits) => {
    abytes(digits);
    const dlen = digits.length;
    if (dlen === 0)
      return new Uint8Array(0);
    if (dlen >= RADIX_BASE_N_MAX_LENGTH)
      throw new Error("invalid length");
    let zeros = 0;
    while (zeros < dlen - 1 && digits[zeros] === 0)
      zeros++;
    const limbs = new Uint16Array(Math.ceil(dlen * 6 / 16) + 1);
    let used = 0;
    let i = 0;
    let group = dlen % 5 || 5;
    while (i < dlen) {
      let gval = 0;
      let factor = 1;
      for (const end = i + group; i < end; i++) {
        const d = digits[i];
        if (d >= BASE3)
          throw new Error(`invalid integer: ${d}`);
        gval = gval * BASE3 + d;
        factor *= BASE3;
      }
      group = 5;
      let carry = gval;
      for (let k = 0; k < used; k++) {
        const cur = limbs[k] * factor + carry;
        carry = Math.floor(cur / 65536);
        limbs[k] = cur - carry * 65536;
      }
      for (; carry > 0; carry = Math.floor(carry / 65536))
        limbs[used++] = carry % 65536;
    }
    const valueBytes = used === 0 ? 1 : used * 2 - (limbs[used - 1] < 256 ? 1 : 0);
    const res = new Uint8Array(zeros + valueBytes);
    let j = res.length - 1;
    for (let k = 0; k < used; k++) {
      const limb = limbs[k];
      res[j--] = limb & 255;
      if (j >= zeros)
        res[j--] = limb >> 8;
    }
    return res;
  }
});
var genBaseN = (radix, abc) => {
  const letters = alphabet(abc);
  return {
    encode(bytes) {
      abytes(bytes);
      if (bytes.length > BASE_N_MAX_BYTES)
        throw new Error("invalid length");
      return letters.encode(radix.encode(bytes));
    },
    decode(str) {
      astr("baseN.decode", str);
      if (str.length > BASE_N_MAX_CHARS)
        throw new Error("invalid length");
      return radix.decode(letters.decode(str));
    }
  };
};
var radix58 = /* @__PURE__ */ radixBaseN(58, B58_GROUP);
var genBase58 = (abc) => genBaseN(radix58, abc);
var base58 = /* @__PURE__ */ freeze(() => genBase58("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"));
var createBase58check = (sha2562) => {
  afn(sha2562);
  const _sha256 = sha2562;
  return chain(checksum(4, (data) => _sha256(_sha256(data))), base58);
};

// node_modules/@noble/hashes/utils.js
function isBytes2(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
var atitle = (title) => title ? `"${title}" ` : "";
function anumber2(n3, title = "") {
  if (typeof n3 !== "number")
    throw new TypeError(atitle(title) + "expected number, got " + typeof n3);
  if (!Number.isSafeInteger(n3) || n3 < 0)
    throw new RangeError(atitle(title) + "expected integer >= 0, got " + n3);
  return n3;
}
function abool(value, title = "") {
  if (typeof value !== "boolean")
    throw new TypeError(atitle(title) + "expected boolean, got type=" + typeof value);
  return value;
}
function abytes2(value, length, title = "") {
  if (isBytes2(value) && (length === void 0 || value.length === length))
    return value;
  if (length !== void 0)
    anumber2(length, "length");
  const bytes = isBytes2(value);
  const ofLen = length !== void 0 ? ` of length ${length}` : "";
  const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
  const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
  if (!bytes)
    throw new TypeError(message);
  throw new RangeError(message);
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new TypeError("expected hash wrapped by utils.createHasher");
  anumber2(h.outputLen);
  anumber2(h.blockLen);
  if (h.outputLen < 1 || h.blockLen < 1)
    throw new Error("hash blockLen / outputLen must be >= 1");
}
var aobject = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
};
var aopts = (value, label) => {
  aobject(value, label);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    throw new TypeError(`"${label}" expected plain object`);
  if (Object.hasOwn(value, "__proto__"))
    throw new TypeError(`"${label}.__proto__" is not allowed`);
};
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("hash was destroyed");
  if (checkFinished && instance.finished)
    throw new Error("digest() was already called");
}
function aoutput(out, instance) {
  abytes2(out, void 0, "output");
  const min = instance.outputLen;
  if (!(out.length >= min)) {
    throw new RangeError('"output" expected length >= ' + min);
  }
}
function u32(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
function rotl(word, shift) {
  return word << shift | word >>> 32 - shift >>> 0;
}
var isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
function byteSwap(word) {
  return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
}
function byteSwap32(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = byteSwap(arr[i]);
  }
  return arr;
}
var swap32IfBE = isLE ? (u) => u : byteSwap32;
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes2(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function asciiToBase16(ch) {
  return ch >= 48 && ch <= 57 ? ch - 48 : ch >= 65 && ch <= 70 ? ch - (65 - 10) : ch >= 97 && ch <= 102 ? ch - (97 - 10) : void 0;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new TypeError("hex string expected, got " + typeof hex);
  if (hasHexBuiltin) {
    try {
      return Uint8Array.fromHex(hex);
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new RangeError(error.message);
      throw error;
    }
  }
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new RangeError("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n22 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n22 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new RangeError('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n22;
  }
  return array;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new TypeError("string expected");
  const encoded = new TextEncoder().encode(str);
  try {
    return new Uint8Array(encoded);
  } finally {
    clean(encoded);
  }
}
function kdfInputToBytes(data, errorTitle = "") {
  if (typeof data === "string")
    return utf8ToBytes(data);
  return abytes2(data, void 0, errorTitle);
}
function concatBytes(...arrays) {
  let sum = 0;
  for (let i = 0; i < arrays.length; i++) {
    const a = arrays[i];
    abytes2(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad = 0; i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad);
    pad += a.length;
  }
  return res;
}
function checkOpts(defaults, opts, title = "opts") {
  aopts(defaults, "defaults");
  if (opts !== void 0)
    aopts(opts, title);
  const merged = Object.assign(/* @__PURE__ */ Object.create(null), defaults, opts);
  return merged;
}
function createHasher(hashCons, info = {}) {
  if (typeof hashCons !== "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
  info = checkOpts({}, info, "info");
  const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
  const tmp = hashCons(void 0);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.canXOF = tmp.canXOF;
  hashC.create = (opts) => hashCons(opts);
  Object.assign(hashC, info);
  return Object.freeze(hashC);
}
function randomBytes(bytesLength = 32) {
  anumber2(bytesLength, "bytesLength");
  const cr = typeof globalThis === "object" ? globalThis.crypto : null;
  if (typeof cr?.getRandomValues !== "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (bytesLength > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${bytesLength}`);
  return cr.getRandomValues(new Uint8Array(bytesLength));
}
var oidNist = (suffix) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
});

// node_modules/@noble/hashes/hmac.js
var _HMAC = class {
  oHash;
  iHash;
  blockLen;
  outputLen;
  canXOF = false;
  finished = false;
  destroyed = false;
  constructor(hash, key) {
    ahash(hash);
    abytes2(key, void 0, "key");
    this.iHash = hash.create();
    if (typeof this.iHash.update !== "function")
      throw new Error("expected Hash instance");
    this.blockLen = this.iHash.blockLen;
    this.outputLen = this.iHash.outputLen;
    const blockLen = this.blockLen;
    const pad = new Uint8Array(blockLen);
    pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54;
    this.iHash.update(pad);
    this.oHash = hash.create();
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54 ^ 92;
    this.oHash.update(pad);
    clean(pad);
  }
  update(buf) {
    aexists(this);
    this.iHash.update(buf);
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const buf = out.subarray(0, this.outputLen);
    this.iHash.digestInto(buf);
    this.oHash.update(buf);
    this.oHash.digestInto(buf);
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.oHash.outputLen);
    this.digestInto(out);
    return out;
  }
  _cloneInto(to) {
    to ||= Object.create(Object.getPrototypeOf(this), {});
    const { oHash, iHash, finished, destroyed, blockLen, outputLen, canXOF } = this;
    to = to;
    to.finished = finished;
    to.destroyed = destroyed;
    to.blockLen = blockLen;
    to.outputLen = outputLen;
    to.canXOF = canXOF;
    to.oHash = oHash._cloneInto(to.oHash);
    to.iHash = iHash._cloneInto(to.iHash);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = true;
    this.oHash.destroy();
    this.iHash.destroy();
  }
};
var hmac = /* @__PURE__ */ (() => {
  const hmac_ = ((hash, key, message) => new _HMAC(hash, key).update(message).digest());
  hmac_.create = (hash, key) => new _HMAC(hash, key);
  return hmac_;
})();

// node_modules/@noble/hashes/pbkdf2.js
function pbkdf2Init(hash, _password, _salt, _opts) {
  ahash(hash);
  const opts = checkOpts({ dkLen: 32, asyncTick: 10 }, _opts);
  const { c, dkLen, asyncTick } = opts;
  anumber2(c, "c");
  anumber2(dkLen, "dkLen");
  anumber2(asyncTick, "asyncTick");
  if (c < 1)
    throw new Error('"c" (iterations) must be >= 1');
  if (dkLen < 1)
    throw new Error('"dkLen" must be >= 1');
  if (dkLen > (2 ** 32 - 1) * hash.outputLen)
    throw new Error("derived key too long");
  const p = kdfInputToBytes(_password, "password");
  try {
    const s = kdfInputToBytes(_salt, "salt");
    try {
      const DK = new Uint8Array(dkLen);
      const { iHash, oHash, outputLen } = hmac.create(hash, p);
      const u = new Uint8Array(outputLen);
      const eng = pbkdf2Engine(iHash, oHash, s, u);
      return { c, dkLen, asyncTick, DK, outputLen, eng };
    } finally {
      if (typeof _salt === "string")
        clean(s);
    }
  } finally {
    if (typeof _password === "string")
      clean(p);
  }
}
function pbkdf2Engine(iHash, oHash, salt, u) {
  const counter = new Uint8Array(4);
  const view = createView(counter);
  const salted = iHash._cloneInto().update(salt);
  const work = oHash._cloneInto();
  const iClone = iHash._cloneInto;
  const oClone = oHash._cloneInto;
  return {
    u1: (ti, Ti) => {
      view.setInt32(0, ti, false);
      salted._cloneInto(work).update(counter).digestInto(u);
      oHash._cloneInto(work).update(u).digestInto(u);
      Ti.set(u.subarray(0, Ti.length));
    },
    // Whole `F` inner loop for the sync variant: one optimized function owns the hot loop.
    rounds: (c, Ti) => {
      for (let ui = 1; ui < c; ui++) {
        iClone.call(iHash, work).update(u).digestInto(u);
        oClone.call(oHash, work).update(u).digestInto(u);
        for (let i = 0; i < Ti.length; i++)
          Ti[i] ^= u[i];
      }
    },
    output: (DK) => {
      iHash.destroy();
      oHash.destroy();
      salted.destroy();
      work.destroy();
      clean(u);
      return DK;
    }
  };
}
function pbkdf2(hash, password, salt, opts) {
  const { c, dkLen, DK, outputLen, eng } = pbkdf2Init(hash, password, salt, opts);
  for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += outputLen) {
    const Ti = DK.subarray(pos, pos + outputLen);
    eng.u1(ti, Ti);
    eng.rounds(c, Ti);
  }
  return eng.output(DK);
}

// node_modules/@noble/hashes/_u64.js
var U32_MASK64 = /* @__PURE__ */ (() => BigInt(2 ** 32 - 1))();
var _32n = /* @__PURE__ */ BigInt(32);
function fromBig(n3, le = false) {
  if (le)
    return { h: Number(n3 & U32_MASK64), l: Number(n3 >> _32n & U32_MASK64) };
  return { h: Number(n3 >> _32n & U32_MASK64) | 0, l: Number(n3 & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
var fromNumH = (n3) => n3 / 2 ** 32 | 0;
var fromNumL = (n3) => n3 >>> 0;
function setU64FromNum(view, byteOffset, n3, isLE2) {
  const h = fromNumH(n3);
  const l = fromNumL(n3);
  view.setUint32(byteOffset, isLE2 ? l : h, isLE2);
  view.setUint32(byteOffset + 4, isLE2 ? h : l, isLE2);
}
var shrSH = (h, _l, s) => h >>> s;
var shrSL = (h, l, s) => h << 32 - s | l >>> s;
var rotrSH = (h, l, s) => h >>> s | l << 32 - s;
var rotrSL = (h, l, s) => h << 32 - s | l >>> s;
var rotrBH = (h, l, s) => h << 64 - s | l >>> s - 32;
var rotrBL = (h, l, s) => h >>> s - 32 | l << 64 - s;
function add(Ah, Al, Bh, Bl) {
  const l = (Al >>> 0) + (Bl >>> 0);
  return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
}
var add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
var add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
var add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
var add4H = (low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0;
var add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
var add5H = (low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0;

// node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class {
  blockLen;
  outputLen;
  canXOF = false;
  padOffset;
  isLE;
  // For partial updates less than block size
  buffer;
  view;
  finished = false;
  length = 0;
  pos = 0;
  destroyed = false;
  constructor(blockLen, outputLen, padOffset, isLE2) {
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE2;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    abytes2(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    let processed = false;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        processed = true;
        continue;
      }
      buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
        processed = true;
      }
    }
    this.length += data.length;
    if (processed)
      this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE: isLE2 } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    buffer.fill(0, pos);
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      buffer.fill(0);
    }
    setU64FromNum(view, blockLen - 8, this.length * 8, isLE2);
    this.process(view, 0);
    this.roundClean();
    const oview = out === buffer ? view : createView(out);
    const len = this.outputLen;
    const outLen = len / 4;
    const state = this.get();
    if (len % 4 || outLen > state.length)
      throw new Error("invalid outputLen");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE2);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneIntoMeta(to) {
    const { buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (pos)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);
var SHA512_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  4089235720,
  3144134277,
  2227873595,
  1013904242,
  4271175723,
  2773480762,
  1595750129,
  1359893119,
  2917565137,
  2600822924,
  725511199,
  528734635,
  4215389547,
  1541459225,
  327033209
]);

// node_modules/@noble/hashes/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA2_32B = class extends HashMD {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  // Numeric initializers matter: starting the fields as `undefined` changes
  // V8's field representation and makes sha256 3x slower (measured).
  A = 0;
  B = 0;
  C = 0;
  D = 0;
  E = 0;
  F = 0;
  G = 0;
  H = 0;
  constructor(outputLen, IV) {
    super(64, outputLen, 8, false);
    this.A = IV[0] | 0;
    this.B = IV[1] | 0;
    this.C = IV[2] | 0;
    this.D = IV[3] | 0;
    this.E = IV[4] | 0;
    this.F = IV[5] | 0;
    this.G = IV[6] | 0;
    this.H = IV[7] | 0;
  }
  get() {
    const { A, B: B2, C, D, E, F, G, H } = this;
    return [A, B2, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B2, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B2 | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  _cloneInto(to) {
    (to ||= new this.constructor()).set(...this.get());
    return this._cloneIntoMeta(to);
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B: B2, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B2, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B2;
      B2 = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B2 = B2 + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B2, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.destroyed = true;
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var _SHA256 = class extends SHA2_32B {
  constructor() {
    super(32, SHA256_IV);
  }
};
var K512 = /* @__PURE__ */ (() => split([
  "0x428a2f98d728ae22",
  "0x7137449123ef65cd",
  "0xb5c0fbcfec4d3b2f",
  "0xe9b5dba58189dbbc",
  "0x3956c25bf348b538",
  "0x59f111f1b605d019",
  "0x923f82a4af194f9b",
  "0xab1c5ed5da6d8118",
  "0xd807aa98a3030242",
  "0x12835b0145706fbe",
  "0x243185be4ee4b28c",
  "0x550c7dc3d5ffb4e2",
  "0x72be5d74f27b896f",
  "0x80deb1fe3b1696b1",
  "0x9bdc06a725c71235",
  "0xc19bf174cf692694",
  "0xe49b69c19ef14ad2",
  "0xefbe4786384f25e3",
  "0x0fc19dc68b8cd5b5",
  "0x240ca1cc77ac9c65",
  "0x2de92c6f592b0275",
  "0x4a7484aa6ea6e483",
  "0x5cb0a9dcbd41fbd4",
  "0x76f988da831153b5",
  "0x983e5152ee66dfab",
  "0xa831c66d2db43210",
  "0xb00327c898fb213f",
  "0xbf597fc7beef0ee4",
  "0xc6e00bf33da88fc2",
  "0xd5a79147930aa725",
  "0x06ca6351e003826f",
  "0x142929670a0e6e70",
  "0x27b70a8546d22ffc",
  "0x2e1b21385c26c926",
  "0x4d2c6dfc5ac42aed",
  "0x53380d139d95b3df",
  "0x650a73548baf63de",
  "0x766a0abb3c77b2a8",
  "0x81c2c92e47edaee6",
  "0x92722c851482353b",
  "0xa2bfe8a14cf10364",
  "0xa81a664bbc423001",
  "0xc24b8b70d0f89791",
  "0xc76c51a30654be30",
  "0xd192e819d6ef5218",
  "0xd69906245565a910",
  "0xf40e35855771202a",
  "0x106aa07032bbd1b8",
  "0x19a4c116b8d2d0c8",
  "0x1e376c085141ab53",
  "0x2748774cdf8eeb99",
  "0x34b0bcb5e19b48a8",
  "0x391c0cb3c5c95a63",
  "0x4ed8aa4ae3418acb",
  "0x5b9cca4f7763e373",
  "0x682e6ff3d6b2b8a3",
  "0x748f82ee5defb2fc",
  "0x78a5636f43172f60",
  "0x84c87814a1f0ab72",
  "0x8cc702081a6439ec",
  "0x90befffa23631e28",
  "0xa4506cebde82bde9",
  "0xbef9a3f7b2c67915",
  "0xc67178f2e372532b",
  "0xca273eceea26619c",
  "0xd186b8c721c0c207",
  "0xeada7dd6cde0eb1e",
  "0xf57d4f7fee6ed178",
  "0x06f067aa72176fba",
  "0x0a637dc5a2c898a6",
  "0x113f9804bef90dae",
  "0x1b710b35131c471b",
  "0x28db77f523047d84",
  "0x32caab7b40c72493",
  "0x3c9ebe0a15c9bebc",
  "0x431d67c49c100d4c",
  "0x4cc5d4becb3e42b6",
  "0x597f299cfc657e2a",
  "0x5fcb6fab3ad6faec",
  "0x6c44198c4a475817"
].map((n3) => BigInt(n3))))();
var SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
var SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
var SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
var SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
var SHA2_64B = class extends HashMD {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  // h -- high 32 bits, l -- low 32 bits
  // Numeric initializers matter: starting the fields as `undefined` changes
  // V8's field representation and slows hashing down (measured on sha256).
  Ah = 0;
  Al = 0;
  Bh = 0;
  Bl = 0;
  Ch = 0;
  Cl = 0;
  Dh = 0;
  Dl = 0;
  Eh = 0;
  El = 0;
  Fh = 0;
  Fl = 0;
  Gh = 0;
  Gl = 0;
  Hh = 0;
  Hl = 0;
  constructor(outputLen, IV) {
    super(128, outputLen, 16, false);
    this.Ah = IV[0] | 0;
    this.Al = IV[1] | 0;
    this.Bh = IV[2] | 0;
    this.Bl = IV[3] | 0;
    this.Ch = IV[4] | 0;
    this.Cl = IV[5] | 0;
    this.Dh = IV[6] | 0;
    this.Dl = IV[7] | 0;
    this.Eh = IV[8] | 0;
    this.El = IV[9] | 0;
    this.Fh = IV[10] | 0;
    this.Fl = IV[11] | 0;
    this.Gh = IV[12] | 0;
    this.Gl = IV[13] | 0;
    this.Hh = IV[14] | 0;
    this.Hl = IV[15] | 0;
  }
  // prettier-ignore
  get() {
    const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
    return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
  }
  // prettier-ignore
  set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
    this.Ah = Ah | 0;
    this.Al = Al | 0;
    this.Bh = Bh | 0;
    this.Bl = Bl | 0;
    this.Ch = Ch | 0;
    this.Cl = Cl | 0;
    this.Dh = Dh | 0;
    this.Dl = Dl | 0;
    this.Eh = Eh | 0;
    this.El = El | 0;
    this.Fh = Fh | 0;
    this.Fl = Fl | 0;
    this.Gh = Gh | 0;
    this.Gl = Gl | 0;
    this.Hh = Hh | 0;
    this.Hl = Hl | 0;
  }
  _cloneInto(to) {
    (to ||= new this.constructor()).set(...this.get());
    return this._cloneIntoMeta(to);
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4) {
      SHA512_W_H[i] = view.getUint32(offset);
      SHA512_W_L[i] = view.getUint32(offset += 4);
    }
    for (let i = 16; i < 80; i++) {
      const W15h = SHA512_W_H[i - 15] | 0;
      const W15l = SHA512_W_L[i - 15] | 0;
      const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
      const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
      const W2h = SHA512_W_H[i - 2] | 0;
      const W2l = SHA512_W_L[i - 2] | 0;
      const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
      const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
      const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
      const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
      SHA512_W_H[i] = SUMh | 0;
      SHA512_W_L[i] = SUMl | 0;
    }
    let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
    for (let i = 0; i < 80; i++) {
      const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
      const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
      const CHIh = Eh & Fh ^ ~Eh & Gh;
      const CHIl = El & Fl ^ ~El & Gl;
      const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
      const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
      const T1l = T1ll | 0;
      const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
      const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
      const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
      const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
      Hh = Gh | 0;
      Hl = Gl | 0;
      Gh = Fh | 0;
      Gl = Fl | 0;
      Fh = Eh | 0;
      Fl = El | 0;
      ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
      Dh = Ch | 0;
      Dl = Cl | 0;
      Ch = Bh | 0;
      Cl = Bl | 0;
      Bh = Ah | 0;
      Bl = Al | 0;
      const All = add3L(T1l, sigma0l, MAJl);
      Ah = add3H(All, T1h, sigma0h, MAJh);
      Al = All | 0;
    }
    ({ h: Ah, l: Al } = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
    ({ h: Bh, l: Bl } = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
    ({ h: Ch, l: Cl } = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
    ({ h: Dh, l: Dl } = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
    ({ h: Eh, l: El } = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
    ({ h: Fh, l: Fl } = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
    ({ h: Gh, l: Gl } = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
    ({ h: Hh, l: Hl } = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
    this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
  }
  roundClean() {
    clean(SHA512_W_H, SHA512_W_L);
  }
  destroy() {
    this.destroyed = true;
    clean(this.buffer);
    this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
};
var _SHA512 = class extends SHA2_64B {
  constructor() {
    super(64, SHA512_IV);
  }
};
var sha256 = /* @__PURE__ */ createHasher(
  () => new _SHA256(),
  /* @__PURE__ */ oidNist(1)
);
var sha512 = /* @__PURE__ */ createHasher(
  () => new _SHA512(),
  /* @__PURE__ */ oidNist(3)
);

// node_modules/@scure/bip39/index.js
var isJapanese = (wordlist2) => wordlist2[0] === "\u3042\u3044\u3053\u304F\u3057\u3093";
function isWellFormedUnicode(value) {
  for (let i = 0; i < value.length; i++) {
    const current = value.charCodeAt(i);
    if (current >= 55296 && current <= 56319) {
      if (i + 1 >= value.length)
        return false;
      const next = value.charCodeAt(++i);
      if (next < 56320 || next > 57343)
        return false;
    } else if (current >= 56320 && current <= 57343) {
      return false;
    }
  }
  return true;
}
function nfkd(str) {
  if (typeof str !== "string")
    throw new TypeError("invalid mnemonic type: " + typeof str);
  if (!isWellFormedUnicode(str))
    throw new TypeError("expected well-formed Unicode string");
  return str.normalize("NFKD");
}
function normalize(str) {
  const norm = nfkd(str);
  const words = norm.split(" ");
  if (![12, 15, 18, 21, 24].includes(words.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: norm, words };
}
function aentropy(ent) {
  abytes2(ent);
  if (![16, 20, 24, 28, 32].includes(ent.length))
    throw new RangeError("invalid entropy length");
}
function generateMnemonic(wordlist2, strength = 128) {
  anumber2(strength);
  if (strength % 32 !== 0 || strength > 256)
    throw new RangeError("Invalid entropy");
  return entropyToMnemonic(randomBytes(strength / 8), wordlist2);
}
var calcChecksum = (entropy) => {
  const bitsLeft = 8 - entropy.length / 4;
  return sha256(entropy)[0] >> bitsLeft << bitsLeft;
};
function awordlist(wordlist2) {
  if (!Array.isArray(wordlist2) || wordlist2.length !== 2048 || typeof wordlist2[0] !== "string")
    throw new TypeError("Wordlist: expected array of 2048 strings");
  wordlist2.forEach((i) => {
    if (typeof i !== "string")
      throw new TypeError("wordlist: non-string element: " + i);
    if (!isWellFormedUnicode(i))
      throw new TypeError("wordlist: expected well-formed Unicode string");
  });
}
function encodeWords(entropy, wordlist2) {
  awordlist(wordlist2);
  const bytes = new Uint8Array(entropy.length + 1);
  bytes.set(entropy);
  bytes[entropy.length] = calcChecksum(entropy);
  const words = [];
  let carry = 0;
  let bits = 0;
  for (const byte of bytes) {
    carry = carry << 8 | byte;
    bits += 8;
    if (bits >= 11) {
      bits -= 11;
      words.push(wordlist2[carry >>> bits & 2047]);
      carry &= (1 << bits) - 1;
    }
  }
  return words;
}
function decodeWords(words, wordlist2) {
  awordlist(wordlist2);
  const entLen = words.length / 3 * 4;
  const bytes = new Uint8Array(entLen + 1);
  let carry = 0;
  let bits = 0;
  let pos = 0;
  for (const word of words) {
    const index = wordlist2.indexOf(word);
    if (index === -1)
      throw new Error("Unknown word: " + word);
    carry = carry << 11 | index;
    bits += 11;
    while (bits >= 8) {
      bits -= 8;
      bytes[pos++] = carry >>> bits & 255;
    }
    carry &= (1 << bits) - 1;
  }
  if (bits > 0)
    bytes[pos] = carry << 8 - bits;
  const entropy = bytes.subarray(0, entLen);
  if (bytes[entLen] !== calcChecksum(entropy))
    throw new Error("Invalid checksum");
  return Uint8Array.from(entropy);
}
function mnemonicToEntropy(mnemonic, wordlist2) {
  const { words } = normalize(mnemonic);
  const entropy = decodeWords(words, wordlist2);
  aentropy(entropy);
  return entropy;
}
function entropyToMnemonic(entropy, wordlist2) {
  aentropy(entropy);
  const words = encodeWords(entropy, wordlist2);
  return words.join(isJapanese(wordlist2) ? "\u3000" : " ");
}
function validateMnemonic(mnemonic, wordlist2) {
  try {
    mnemonicToEntropy(mnemonic, wordlist2);
  } catch (e) {
    return false;
  }
  return true;
}
var psalt = (passphrase) => {
  if (typeof passphrase !== "string")
    throw new TypeError("invalid passphrase type: " + typeof passphrase);
  return nfkd("mnemonic" + passphrase);
};
function mnemonicToSeedSync(mnemonic, passphrase = "") {
  return pbkdf2(sha512, normalize(mnemonic).nfkd, psalt(passphrase), {
    c: 2048,
    dkLen: 64
  });
}

// node_modules/@scure/bip39/wordlists/english.js
var wordlist = /* @__PURE__ */ Object.freeze(`abandon
ability
able
about
above
absent
absorb
abstract
absurd
abuse
access
accident
account
accuse
achieve
acid
acoustic
acquire
across
act
action
actor
actress
actual
adapt
add
addict
address
adjust
admit
adult
advance
advice
aerobic
affair
afford
afraid
again
age
agent
agree
ahead
aim
air
airport
aisle
alarm
album
alcohol
alert
alien
all
alley
allow
almost
alone
alpha
already
also
alter
always
amateur
amazing
among
amount
amused
analyst
anchor
ancient
anger
angle
angry
animal
ankle
announce
annual
another
answer
antenna
antique
anxiety
any
apart
apology
appear
apple
approve
april
arch
arctic
area
arena
argue
arm
armed
armor
army
around
arrange
arrest
arrive
arrow
art
artefact
artist
artwork
ask
aspect
assault
asset
assist
assume
asthma
athlete
atom
attack
attend
attitude
attract
auction
audit
august
aunt
author
auto
autumn
average
avocado
avoid
awake
aware
away
awesome
awful
awkward
axis
baby
bachelor
bacon
badge
bag
balance
balcony
ball
bamboo
banana
banner
bar
barely
bargain
barrel
base
basic
basket
battle
beach
bean
beauty
because
become
beef
before
begin
behave
behind
believe
below
belt
bench
benefit
best
betray
better
between
beyond
bicycle
bid
bike
bind
biology
bird
birth
bitter
black
blade
blame
blanket
blast
bleak
bless
blind
blood
blossom
blouse
blue
blur
blush
board
boat
body
boil
bomb
bone
bonus
book
boost
border
boring
borrow
boss
bottom
bounce
box
boy
bracket
brain
brand
brass
brave
bread
breeze
brick
bridge
brief
bright
bring
brisk
broccoli
broken
bronze
broom
brother
brown
brush
bubble
buddy
budget
buffalo
build
bulb
bulk
bullet
bundle
bunker
burden
burger
burst
bus
business
busy
butter
buyer
buzz
cabbage
cabin
cable
cactus
cage
cake
call
calm
camera
camp
can
canal
cancel
candy
cannon
canoe
canvas
canyon
capable
capital
captain
car
carbon
card
cargo
carpet
carry
cart
case
cash
casino
castle
casual
cat
catalog
catch
category
cattle
caught
cause
caution
cave
ceiling
celery
cement
census
century
cereal
certain
chair
chalk
champion
change
chaos
chapter
charge
chase
chat
cheap
check
cheese
chef
cherry
chest
chicken
chief
child
chimney
choice
choose
chronic
chuckle
chunk
churn
cigar
cinnamon
circle
citizen
city
civil
claim
clap
clarify
claw
clay
clean
clerk
clever
click
client
cliff
climb
clinic
clip
clock
clog
close
cloth
cloud
clown
club
clump
cluster
clutch
coach
coast
coconut
code
coffee
coil
coin
collect
color
column
combine
come
comfort
comic
common
company
concert
conduct
confirm
congress
connect
consider
control
convince
cook
cool
copper
copy
coral
core
corn
correct
cost
cotton
couch
country
couple
course
cousin
cover
coyote
crack
cradle
craft
cram
crane
crash
crater
crawl
crazy
cream
credit
creek
crew
cricket
crime
crisp
critic
crop
cross
crouch
crowd
crucial
cruel
cruise
crumble
crunch
crush
cry
crystal
cube
culture
cup
cupboard
curious
current
curtain
curve
cushion
custom
cute
cycle
dad
damage
damp
dance
danger
daring
dash
daughter
dawn
day
deal
debate
debris
decade
december
decide
decline
decorate
decrease
deer
defense
define
defy
degree
delay
deliver
demand
demise
denial
dentist
deny
depart
depend
deposit
depth
deputy
derive
describe
desert
design
desk
despair
destroy
detail
detect
develop
device
devote
diagram
dial
diamond
diary
dice
diesel
diet
differ
digital
dignity
dilemma
dinner
dinosaur
direct
dirt
disagree
discover
disease
dish
dismiss
disorder
display
distance
divert
divide
divorce
dizzy
doctor
document
dog
doll
dolphin
domain
donate
donkey
donor
door
dose
double
dove
draft
dragon
drama
drastic
draw
dream
dress
drift
drill
drink
drip
drive
drop
drum
dry
duck
dumb
dune
during
dust
dutch
duty
dwarf
dynamic
eager
eagle
early
earn
earth
easily
east
easy
echo
ecology
economy
edge
edit
educate
effort
egg
eight
either
elbow
elder
electric
elegant
element
elephant
elevator
elite
else
embark
embody
embrace
emerge
emotion
employ
empower
empty
enable
enact
end
endless
endorse
enemy
energy
enforce
engage
engine
enhance
enjoy
enlist
enough
enrich
enroll
ensure
enter
entire
entry
envelope
episode
equal
equip
era
erase
erode
erosion
error
erupt
escape
essay
essence
estate
eternal
ethics
evidence
evil
evoke
evolve
exact
example
excess
exchange
excite
exclude
excuse
execute
exercise
exhaust
exhibit
exile
exist
exit
exotic
expand
expect
expire
explain
expose
express
extend
extra
eye
eyebrow
fabric
face
faculty
fade
faint
faith
fall
false
fame
family
famous
fan
fancy
fantasy
farm
fashion
fat
fatal
father
fatigue
fault
favorite
feature
february
federal
fee
feed
feel
female
fence
festival
fetch
fever
few
fiber
fiction
field
figure
file
film
filter
final
find
fine
finger
finish
fire
firm
first
fiscal
fish
fit
fitness
fix
flag
flame
flash
flat
flavor
flee
flight
flip
float
flock
floor
flower
fluid
flush
fly
foam
focus
fog
foil
fold
follow
food
foot
force
forest
forget
fork
fortune
forum
forward
fossil
foster
found
fox
fragile
frame
frequent
fresh
friend
fringe
frog
front
frost
frown
frozen
fruit
fuel
fun
funny
furnace
fury
future
gadget
gain
galaxy
gallery
game
gap
garage
garbage
garden
garlic
garment
gas
gasp
gate
gather
gauge
gaze
general
genius
genre
gentle
genuine
gesture
ghost
giant
gift
giggle
ginger
giraffe
girl
give
glad
glance
glare
glass
glide
glimpse
globe
gloom
glory
glove
glow
glue
goat
goddess
gold
good
goose
gorilla
gospel
gossip
govern
gown
grab
grace
grain
grant
grape
grass
gravity
great
green
grid
grief
grit
grocery
group
grow
grunt
guard
guess
guide
guilt
guitar
gun
gym
habit
hair
half
hammer
hamster
hand
happy
harbor
hard
harsh
harvest
hat
have
hawk
hazard
head
health
heart
heavy
hedgehog
height
hello
helmet
help
hen
hero
hidden
high
hill
hint
hip
hire
history
hobby
hockey
hold
hole
holiday
hollow
home
honey
hood
hope
horn
horror
horse
hospital
host
hotel
hour
hover
hub
huge
human
humble
humor
hundred
hungry
hunt
hurdle
hurry
hurt
husband
hybrid
ice
icon
idea
identify
idle
ignore
ill
illegal
illness
image
imitate
immense
immune
impact
impose
improve
impulse
inch
include
income
increase
index
indicate
indoor
industry
infant
inflict
inform
inhale
inherit
initial
inject
injury
inmate
inner
innocent
input
inquiry
insane
insect
inside
inspire
install
intact
interest
into
invest
invite
involve
iron
island
isolate
issue
item
ivory
jacket
jaguar
jar
jazz
jealous
jeans
jelly
jewel
job
join
joke
journey
joy
judge
juice
jump
jungle
junior
junk
just
kangaroo
keen
keep
ketchup
key
kick
kid
kidney
kind
kingdom
kiss
kit
kitchen
kite
kitten
kiwi
knee
knife
knock
know
lab
label
labor
ladder
lady
lake
lamp
language
laptop
large
later
latin
laugh
laundry
lava
law
lawn
lawsuit
layer
lazy
leader
leaf
learn
leave
lecture
left
leg
legal
legend
leisure
lemon
lend
length
lens
leopard
lesson
letter
level
liar
liberty
library
license
life
lift
light
like
limb
limit
link
lion
liquid
list
little
live
lizard
load
loan
lobster
local
lock
logic
lonely
long
loop
lottery
loud
lounge
love
loyal
lucky
luggage
lumber
lunar
lunch
luxury
lyrics
machine
mad
magic
magnet
maid
mail
main
major
make
mammal
man
manage
mandate
mango
mansion
manual
maple
marble
march
margin
marine
market
marriage
mask
mass
master
match
material
math
matrix
matter
maximum
maze
meadow
mean
measure
meat
mechanic
medal
media
melody
melt
member
memory
mention
menu
mercy
merge
merit
merry
mesh
message
metal
method
middle
midnight
milk
million
mimic
mind
minimum
minor
minute
miracle
mirror
misery
miss
mistake
mix
mixed
mixture
mobile
model
modify
mom
moment
monitor
monkey
monster
month
moon
moral
more
morning
mosquito
mother
motion
motor
mountain
mouse
move
movie
much
muffin
mule
multiply
muscle
museum
mushroom
music
must
mutual
myself
mystery
myth
naive
name
napkin
narrow
nasty
nation
nature
near
neck
need
negative
neglect
neither
nephew
nerve
nest
net
network
neutral
never
news
next
nice
night
noble
noise
nominee
noodle
normal
north
nose
notable
note
nothing
notice
novel
now
nuclear
number
nurse
nut
oak
obey
object
oblige
obscure
observe
obtain
obvious
occur
ocean
october
odor
off
offer
office
often
oil
okay
old
olive
olympic
omit
once
one
onion
online
only
open
opera
opinion
oppose
option
orange
orbit
orchard
order
ordinary
organ
orient
original
orphan
ostrich
other
outdoor
outer
output
outside
oval
oven
over
own
owner
oxygen
oyster
ozone
pact
paddle
page
pair
palace
palm
panda
panel
panic
panther
paper
parade
parent
park
parrot
party
pass
patch
path
patient
patrol
pattern
pause
pave
payment
peace
peanut
pear
peasant
pelican
pen
penalty
pencil
people
pepper
perfect
permit
person
pet
phone
photo
phrase
physical
piano
picnic
picture
piece
pig
pigeon
pill
pilot
pink
pioneer
pipe
pistol
pitch
pizza
place
planet
plastic
plate
play
please
pledge
pluck
plug
plunge
poem
poet
point
polar
pole
police
pond
pony
pool
popular
portion
position
possible
post
potato
pottery
poverty
powder
power
practice
praise
predict
prefer
prepare
present
pretty
prevent
price
pride
primary
print
priority
prison
private
prize
problem
process
produce
profit
program
project
promote
proof
property
prosper
protect
proud
provide
public
pudding
pull
pulp
pulse
pumpkin
punch
pupil
puppy
purchase
purity
purpose
purse
push
put
puzzle
pyramid
quality
quantum
quarter
question
quick
quit
quiz
quote
rabbit
raccoon
race
rack
radar
radio
rail
rain
raise
rally
ramp
ranch
random
range
rapid
rare
rate
rather
raven
raw
razor
ready
real
reason
rebel
rebuild
recall
receive
recipe
record
recycle
reduce
reflect
reform
refuse
region
regret
regular
reject
relax
release
relief
rely
remain
remember
remind
remove
render
renew
rent
reopen
repair
repeat
replace
report
require
rescue
resemble
resist
resource
response
result
retire
retreat
return
reunion
reveal
review
reward
rhythm
rib
ribbon
rice
rich
ride
ridge
rifle
right
rigid
ring
riot
ripple
risk
ritual
rival
river
road
roast
robot
robust
rocket
romance
roof
rookie
room
rose
rotate
rough
round
route
royal
rubber
rude
rug
rule
run
runway
rural
sad
saddle
sadness
safe
sail
salad
salmon
salon
salt
salute
same
sample
sand
satisfy
satoshi
sauce
sausage
save
say
scale
scan
scare
scatter
scene
scheme
school
science
scissors
scorpion
scout
scrap
screen
script
scrub
sea
search
season
seat
second
secret
section
security
seed
seek
segment
select
sell
seminar
senior
sense
sentence
series
service
session
settle
setup
seven
shadow
shaft
shallow
share
shed
shell
sheriff
shield
shift
shine
ship
shiver
shock
shoe
shoot
shop
short
shoulder
shove
shrimp
shrug
shuffle
shy
sibling
sick
side
siege
sight
sign
silent
silk
silly
silver
similar
simple
since
sing
siren
sister
situate
six
size
skate
sketch
ski
skill
skin
skirt
skull
slab
slam
sleep
slender
slice
slide
slight
slim
slogan
slot
slow
slush
small
smart
smile
smoke
smooth
snack
snake
snap
sniff
snow
soap
soccer
social
sock
soda
soft
solar
soldier
solid
solution
solve
someone
song
soon
sorry
sort
soul
sound
soup
source
south
space
spare
spatial
spawn
speak
special
speed
spell
spend
sphere
spice
spider
spike
spin
spirit
split
spoil
sponsor
spoon
sport
spot
spray
spread
spring
spy
square
squeeze
squirrel
stable
stadium
staff
stage
stairs
stamp
stand
start
state
stay
steak
steel
stem
step
stereo
stick
still
sting
stock
stomach
stone
stool
story
stove
strategy
street
strike
strong
struggle
student
stuff
stumble
style
subject
submit
subway
success
such
sudden
suffer
sugar
suggest
suit
summer
sun
sunny
sunset
super
supply
supreme
sure
surface
surge
surprise
surround
survey
suspect
sustain
swallow
swamp
swap
swarm
swear
sweet
swift
swim
swing
switch
sword
symbol
symptom
syrup
system
table
tackle
tag
tail
talent
talk
tank
tape
target
task
taste
tattoo
taxi
teach
team
tell
ten
tenant
tennis
tent
term
test
text
thank
that
theme
then
theory
there
they
thing
this
thought
three
thrive
throw
thumb
thunder
ticket
tide
tiger
tilt
timber
time
tiny
tip
tired
tissue
title
toast
tobacco
today
toddler
toe
together
toilet
token
tomato
tomorrow
tone
tongue
tonight
tool
tooth
top
topic
topple
torch
tornado
tortoise
toss
total
tourist
toward
tower
town
toy
track
trade
traffic
tragic
train
transfer
trap
trash
travel
tray
treat
tree
trend
trial
tribe
trick
trigger
trim
trip
trophy
trouble
truck
true
truly
trumpet
trust
truth
try
tube
tuition
tumble
tuna
tunnel
turkey
turn
turtle
twelve
twenty
twice
twin
twist
two
type
typical
ugly
umbrella
unable
unaware
uncle
uncover
under
undo
unfair
unfold
unhappy
uniform
unique
unit
universe
unknown
unlock
until
unusual
unveil
update
upgrade
uphold
upon
upper
upset
urban
urge
usage
use
used
useful
useless
usual
utility
vacant
vacuum
vague
valid
valley
valve
van
vanish
vapor
various
vast
vault
vehicle
velvet
vendor
venture
venue
verb
verify
version
very
vessel
veteran
viable
vibrant
vicious
victory
video
view
village
vintage
violin
virtual
virus
visa
visit
visual
vital
vivid
vocal
voice
void
volcano
volume
vote
voyage
wage
wagon
wait
walk
wall
walnut
want
warfare
warm
warrior
wash
wasp
waste
water
wave
way
wealth
weapon
wear
weasel
weather
web
wedding
weekend
weird
welcome
west
wet
whale
what
wheat
wheel
when
where
whip
whisper
wide
width
wife
wild
will
win
window
wine
wing
wink
winner
winter
wire
wisdom
wise
wish
witness
wolf
woman
wonder
wood
wool
word
work
world
worry
worth
wrap
wreck
wrestle
wrist
write
wrong
yard
year
yellow
you
young
youth
zebra
zero
zone
zoo`.split("\n"));

// node_modules/@noble/curves/utils.js
function aarray(item, title, inner = () => {
}) {
  if (!Array.isArray(item))
    throw new TypeError(`"${title}" expected array, got type=${typeof item}`);
  for (let i = 0; i < item.length; i++)
    inner(item[i], `${title}[${i}]`);
  return item;
}
var abytes3 = (value, length, title) => abytes2(value, length, title);
var anumber3 = anumber2;
function astring(value, title = "") {
  if (typeof value !== "string") {
    const prefix = title && `"${title}" `;
    throw new TypeError(prefix + "expected string, got type=" + typeof value);
  }
  return value;
}
function aobject2(value, title = "object") {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(title === "object" ? "expected valid options object" : `"${title}" expected object, got type=${typeof value}`);
  return value;
}
function afunction(value, title) {
  if (typeof value !== "function")
    throw new TypeError(`"${title}" is invalid: expected function, got ${typeof value}`);
  return value;
}
var bytesToHex2 = bytesToHex;
var concatBytes2 = (...arrays) => concatBytes(...arrays);
var hexToBytes2 = (hex) => hexToBytes(hex);
var isBytes3 = isBytes2;
var randomBytes2 = (bytesLength) => randomBytes(bytesLength);
var _0n = /* @__PURE__ */ BigInt(0);
var _1n = /* @__PURE__ */ BigInt(1);
var atitle2 = (title) => title ? `"${title}" ` : "";
function abool2(value, title = "") {
  if (typeof value !== "boolean")
    throw new TypeError(atitle2(title) + "expected boolean, got type=" + typeof value);
  return value;
}
function abignumber(n3) {
  if (typeof n3 === "bigint") {
    if (!isPosBig(n3))
      throw new RangeError("positive bigint expected, got " + n3);
  } else
    anumber3(n3);
  return n3;
}
function asafenumber(value, title = "") {
  if (typeof value !== "number") {
    const prefix = title && `"${title}" `;
    throw new TypeError(prefix + "expected number, got type=" + typeof value);
  }
  if (!Number.isSafeInteger(value)) {
    const prefix = title && `"${title}" `;
    throw new RangeError(prefix + "expected safe integer, got " + value);
  }
}
function numberToHexUnpadded(num2) {
  const hex = abignumber(num2).toString(16);
  return hex.length & 1 ? "0" + hex : hex;
}
function hexToNumber(hex) {
  if (typeof hex !== "string")
    throw new TypeError("hex string expected, got " + typeof hex);
  return hex === "" ? _0n : BigInt("0x" + hex);
}
function bytesToNumberBE(bytes) {
  return hexToNumber(bytesToHex(bytes));
}
function bytesToNumberLE(bytes) {
  return hexToNumber(bytesToHex(copyBytes(abytes2(bytes)).reverse()));
}
function numberToBytesBE(n3, len) {
  anumber2(len);
  if (len === 0)
    throw new Error("zero output length is invalid");
  n3 = abignumber(n3);
  const expectedLen = len * 2;
  const hex = n3.toString(16);
  if (hex.length > expectedLen)
    throw new RangeError("number is too large");
  return hexToBytes(hex.padStart(expectedLen, "0"));
}
function numberToBytesLE(n3, len) {
  return numberToBytesBE(n3, len).reverse();
}
function copyBytes(bytes) {
  return Uint8Array.from(abytes3(bytes));
}
function isPosBig(n3) {
  return typeof n3 === "bigint" && _0n <= n3;
}
function inRange(n3, min, max) {
  return isPosBig(n3) && isPosBig(min) && isPosBig(max) && min <= n3 && n3 < max;
}
function aInRange(title, n3, min, max) {
  if (!inRange(n3, min, max))
    throw new RangeError("expected valid " + title + ": " + min + " <= n < " + max + ", got " + n3);
}
function bitLen(n3) {
  if (n3 < _0n)
    throw new Error("expected non-negative bigint, got " + n3);
  return n3 === _0n ? 0 : n3.toString(2).length;
}
var bitMask = (n3) => {
  asafenumber(n3, "n");
  return (_1n << BigInt(n3)) - _1n;
};
function createHmacDrbg(hashLen, qByteLen, hmacFn) {
  anumber2(hashLen, "hashLen");
  anumber2(qByteLen, "qByteLen");
  if (typeof hmacFn !== "function")
    throw new TypeError("hmacFn must be a function");
  const u8n = (len) => new Uint8Array(len);
  const NULL = Uint8Array.of();
  const byte0 = Uint8Array.of(0);
  const byte1 = Uint8Array.of(1);
  const _maxDrbgIters = 1e3;
  let v = u8n(hashLen);
  let k = u8n(hashLen);
  let i = 0;
  const reset = () => {
    v.fill(1);
    k.fill(0);
    i = 0;
  };
  const h = (...msgs) => hmacFn(k, concatBytes2(v, ...msgs));
  const reseed = (seed = NULL) => {
    k = h(byte0, seed);
    v = h();
    if (seed.length === 0)
      return;
    k = h(byte1, seed);
    v = h();
  };
  const gen = () => {
    if (i++ >= _maxDrbgIters)
      throw new Error("drbg: tried max amount of iterations");
    let len = 0;
    const out = [];
    while (len < qByteLen) {
      v = h();
      const sl = v.slice();
      out.push(sl);
      len += v.length;
    }
    return concatBytes2(...out);
  };
  const genUntil = (seed, pred) => {
    reset();
    reseed(seed);
    let res = void 0;
    while ((res = pred(gen())) === void 0)
      reseed();
    reset();
    return res;
  };
  return genUntil;
}
function validateObject(object, fields = {}, optFields = {}, title = "object") {
  aobject2(object, title);
  aobject2(fields, "fields");
  aobject2(optFields, "optFields");
  function checkField(fieldName, expectedType, isOpt) {
    const label = title === "object" ? `param "${String(fieldName)}"` : `"${title}.${String(fieldName)}"`;
    const val = object[fieldName];
    if (!Object.hasOwn(object, fieldName) && (isOpt ? val !== void 0 : expectedType !== "function")) {
      throw new TypeError(`${label} is invalid: expected own property`);
    }
    if (isOpt && val === void 0)
      return;
    const current = typeof val;
    if (current !== expectedType || val === null)
      throw new TypeError(`${label} is invalid: expected ${expectedType}, got ${current}`);
  }
  const iter = (f, isOpt) => Object.entries(f).forEach(([k, v]) => checkField(k, v, isOpt));
  iter(fields, false);
  iter(optFields, true);
}

// node_modules/@noble/curves/abstract/modular.js
var _0n2 = /* @__PURE__ */ BigInt(0);
var _1n2 = /* @__PURE__ */ BigInt(1);
var _2n = /* @__PURE__ */ BigInt(2);
var _3n = /* @__PURE__ */ BigInt(3);
var _4n = /* @__PURE__ */ BigInt(4);
var _5n = /* @__PURE__ */ BigInt(5);
var _7n = /* @__PURE__ */ BigInt(7);
var _8n = /* @__PURE__ */ BigInt(8);
var _9n = /* @__PURE__ */ BigInt(9);
var _15n = /* @__PURE__ */ BigInt(15);
var _16n = /* @__PURE__ */ BigInt(16);
var POW_WINDOWED_MIN = /* @__PURE__ */ BigInt("0x10000000000000000");
function mod(a, b) {
  if (b <= _0n2)
    throw new Error("mod: expected positive modulus, got " + b);
  const result = a % b;
  return result >= _0n2 ? result : b + result;
}
function pow(num2, power, modulo) {
  if (modulo <= _1n2)
    throw new Error("pow: expected modulus > 1, got " + modulo);
  if (typeof power !== "bigint")
    throw new TypeError("invalid exponent: expected bigint, got " + typeof power);
  if (power < _0n2)
    throw new Error("invalid exponent, negatives unsupported");
  if (power === _0n2)
    return _1n2;
  if (power === _1n2)
    return num2;
  let d = num2 % modulo;
  if (d < _0n2)
    d += modulo;
  if (power < POW_WINDOWED_MIN) {
    let p2 = _1n2;
    while (power > _0n2) {
      if (power & _1n2)
        p2 = p2 * d % modulo;
      d = d * d % modulo;
      power >>= _1n2;
    }
    return p2;
  }
  const digits = [];
  while (power > _0n2) {
    digits.push(Number(power & _15n));
    power >>= _4n;
  }
  const table = new Array(16);
  table[0] = _1n2;
  table[1] = d;
  for (let i = 2; i < 16; i++)
    table[i] = table[i - 1] * d % modulo;
  let p = table[digits[digits.length - 1]];
  for (let w = digits.length - 2; w >= 0; w--) {
    p = p * p % modulo;
    p = p * p % modulo;
    p = p * p % modulo;
    p = p * p % modulo;
    const digit = digits[w];
    if (digit !== 0)
      p = p * table[digit] % modulo;
  }
  return p;
}
function pow2(x, power, modulo) {
  if (modulo <= _1n2)
    throw new Error("pow2: expected modulus > 1, got " + modulo);
  if (power < _0n2)
    throw new Error("pow2: expected non-negative exponent, got " + power);
  let res = x;
  while (power-- > _0n2) {
    res *= res;
    res %= modulo;
  }
  return res;
}
function invert(number, modulo) {
  if (number === _0n2)
    throw new Error("invert: expected non-zero number");
  if (modulo <= _1n2)
    throw new Error("invert: expected modulus > 1, got " + modulo);
  let a = mod(number, modulo);
  let b = modulo;
  let x = _0n2, u = _1n2;
  while (a !== _0n2) {
    const q = b / a;
    const r = b - a * q;
    const m = x - u * q;
    b = a, a = r, x = u, u = m;
  }
  const gcd = b;
  if (gcd !== _1n2)
    throw new Error("invert: does not exist");
  return mod(x, modulo);
}
function invertCt(a, prime) {
  if (prime <= _1n2)
    throw new Error("invertCt: expected prime modulus > 1, got " + prime);
  const an = mod(a, prime);
  if (an === _0n2)
    throw new Error("invertCt: expected non-zero number");
  const inverse = pow(an, prime - _2n, prime);
  if (mod(an * inverse, prime) !== _1n2)
    throw new Error("invertCt: does not exist");
  return inverse;
}
function assertIsSquare(Fp2, root, n3) {
  const F = Fp2;
  if (!F.eql(F.sqr(root), n3))
    throw new Error("Cannot find square root");
}
function aoddModulus(order, fnName) {
  if ((order & _1n2) === _0n2)
    throw new Error(fnName + ": expected odd modulus, got " + order);
}
function sqrt3mod4(Fp2, n3) {
  const F = Fp2;
  const p1div4 = (F.ORDER + _1n2) / _4n;
  const root = F.pow(n3, p1div4);
  assertIsSquare(F, root, n3);
  return root;
}
function sqrt5mod8(Fp2, n3) {
  const F = Fp2;
  const p5div8 = (F.ORDER - _5n) / _8n;
  const n22 = F.mul(n3, _2n);
  const v = F.pow(n22, p5div8);
  const nv = F.mul(n3, v);
  const i = F.mul(F.mul(nv, _2n), v);
  const root = F.mul(nv, F.sub(i, F.ONE));
  assertIsSquare(F, root, n3);
  return root;
}
function sqrt9mod16(P) {
  const Fp_ = Field(P);
  const tn = tonelliShanks(P);
  const c1 = tn(Fp_, Fp_.neg(Fp_.ONE));
  const c2 = tn(Fp_, c1);
  const c3 = tn(Fp_, Fp_.neg(c1));
  const c4 = (P + _7n) / _16n;
  return ((Fp2, n3) => {
    const F = Fp2;
    let tv1 = F.pow(n3, c4);
    let tv2 = F.mul(tv1, c1);
    const tv3 = F.mul(tv1, c2);
    const tv4 = F.mul(tv1, c3);
    const e1 = F.eql(F.sqr(tv2), n3);
    const e2 = F.eql(F.sqr(tv3), n3);
    tv1 = F.cmov(tv1, tv2, e1);
    tv2 = F.cmov(tv4, tv3, e2);
    const e3 = F.eql(F.sqr(tv2), n3);
    const root = F.cmov(tv1, tv2, e3);
    assertIsSquare(F, root, n3);
    return root;
  });
}
function tonelliShanks(P) {
  if (P < _3n)
    throw new Error("sqrt is not defined for small field");
  aoddModulus(P, "tonelliShanks");
  let Q = P - _1n2;
  let S = 0;
  while (Q % _2n === _0n2) {
    Q /= _2n;
    S++;
  }
  let Z = _2n;
  const _Fp = Field(P);
  while (FpLegendre(_Fp, Z) === 1) {
    if (Z++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  }
  if (S === 1)
    return sqrt3mod4;
  let cc = _Fp.pow(Z, Q);
  const Q1div2 = (Q + _1n2) / _2n;
  return function tonelliSlow(Fp2, n3) {
    const F = Fp2;
    if (F.is0(n3))
      return n3;
    if (FpLegendre(F, n3) !== 1)
      throw new Error("Cannot find square root");
    let M = S;
    let c = F.mul(F.ONE, cc);
    let t = F.pow(n3, Q);
    let R = F.pow(n3, Q1div2);
    while (!F.eql(t, F.ONE)) {
      if (F.is0(t))
        throw new Error("Cannot find square root: probably non-prime P");
      let i = 1;
      let t_tmp = F.sqr(t);
      while (!F.eql(t_tmp, F.ONE)) {
        i++;
        t_tmp = F.sqr(t_tmp);
        if (i === M)
          throw new Error("Cannot find square root");
      }
      const exponent = _1n2 << BigInt(M - i - 1);
      const b = F.pow(c, exponent);
      M = i;
      c = F.sqr(b);
      t = F.mul(t, c);
      R = F.mul(R, b);
    }
    return R;
  };
}
function FpSqrt(P) {
  aoddModulus(P, "Fp.sqrt");
  if (P % _4n === _3n)
    return sqrt3mod4;
  if (P % _8n === _5n)
    return sqrt5mod8;
  if (P % _16n === _9n)
    return sqrt9mod16(P);
  return tonelliShanks(P);
}
var isNegativeLE = (num2, modulo) => (mod(num2, modulo) & _1n2) === _1n2;
var FIELD_FIELDS = [
  "create",
  "isValid",
  "is0",
  "neg",
  "inv",
  "sqrt",
  "sqr",
  "eql",
  "add",
  "sub",
  "mul",
  "pow",
  "div",
  "addN",
  "subN",
  "mulN",
  "sqrN"
];
function validateField(field) {
  aobject2(field, "field");
  if (typeof field.ORDER !== "bigint")
    throw new TypeError('param "ORDER" is invalid: expected bigint, got ' + typeof field.ORDER);
  asafenumber(field.BYTES, "BYTES");
  asafenumber(field.BITS, "BITS");
  for (const name of FIELD_FIELDS)
    afunction(field[name], "field." + name);
  if (field.BYTES < 1 || field.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (field.ORDER <= _1n2)
    throw new Error("invalid field: expected ORDER > 1, got " + field.ORDER);
  return field;
}
function FpInvertBatch(Fp2, nums, passZero = false) {
  validateField(Fp2);
  aarray(nums, "nums");
  abool2(passZero, "passZero");
  const F = Fp2;
  const inverted = new Array(nums.length).fill(passZero ? F.ZERO : void 0);
  const multipliedAcc = nums.reduce((acc, num2, i) => {
    if (F.is0(num2))
      return acc;
    inverted[i] = acc;
    return F.mul(acc, num2);
  }, F.ONE);
  const invertedAcc = F.inv(multipliedAcc);
  nums.reduceRight((acc, num2, i) => {
    if (F.is0(num2))
      return acc;
    inverted[i] = F.mul(acc, inverted[i]);
    return F.mul(acc, num2);
  }, invertedAcc);
  return inverted;
}
function FpLegendre(Fp2, n3) {
  validateField(Fp2);
  const F = Fp2;
  aoddModulus(F.ORDER, "FpLegendre");
  const p1mod2 = (F.ORDER - _1n2) / _2n;
  const powered = F.pow(n3, p1mod2);
  const yes = F.eql(powered, F.ONE);
  const zero = F.eql(powered, F.ZERO);
  const no = F.eql(powered, F.neg(F.ONE));
  if (!yes && !zero && !no)
    throw new Error("invalid Legendre symbol result");
  return yes ? 1 : zero ? 0 : -1;
}
function nLength(n3, nBitLength) {
  if (nBitLength !== void 0)
    anumber3(nBitLength);
  if (n3 <= _0n2)
    throw new Error("invalid n length: expected positive n, got " + n3);
  if (nBitLength !== void 0 && nBitLength < 1)
    throw new Error("invalid n length: expected positive bit length, got " + nBitLength);
  const bits = bitLen(n3);
  if (nBitLength !== void 0 && nBitLength < bits)
    throw new Error(`invalid n length: expected nBitLength (${nBitLength}) >= bitLen(n) (${bits})`);
  const _nBitLength = nBitLength !== void 0 ? nBitLength : bits;
  const nByteLength = Math.ceil(_nBitLength / 8);
  return { nBitLength: _nBitLength, nByteLength };
}
var FIELD_SQRT = /* @__PURE__ */ new WeakMap();
var _Field = class {
  ORDER;
  BITS;
  BYTES;
  isLE;
  ZERO = _0n2;
  ONE = _1n2;
  _lengths;
  _mod;
  constructor(ORDER, opts = {}) {
    if (ORDER <= _1n2)
      throw new Error("invalid field: expected ORDER > 1, got " + ORDER);
    let _nbitLength = void 0;
    this.isLE = false;
    if (opts != null && typeof opts === "object") {
      if (typeof opts.BITS === "number")
        _nbitLength = opts.BITS;
      if (typeof opts.sqrt === "function")
        Object.defineProperty(this, "sqrt", { value: opts.sqrt, enumerable: true });
      if (typeof opts.isLE === "boolean")
        this.isLE = opts.isLE;
      if (opts.allowedLengths)
        this._lengths = Object.freeze(opts.allowedLengths.slice());
      if (typeof opts.modFromBytes === "boolean")
        this._mod = opts.modFromBytes;
    }
    const { nBitLength, nByteLength } = nLength(ORDER, _nbitLength);
    if (nByteLength > 2048)
      throw new Error("invalid field: expected ORDER of <= 2048 bytes");
    this.ORDER = ORDER;
    this.BITS = nBitLength;
    this.BYTES = nByteLength;
    Object.freeze(this);
  }
  create(num2) {
    return mod(num2, this.ORDER);
  }
  isValid(num2) {
    if (typeof num2 !== "bigint")
      throw new TypeError("invalid field element: expected bigint, got " + typeof num2);
    return _0n2 <= num2 && num2 < this.ORDER;
  }
  is0(num2) {
    return num2 === _0n2;
  }
  // is valid and invertible
  isValidNot0(num2) {
    return !this.is0(num2) && this.isValid(num2);
  }
  isOdd(num2) {
    return (num2 & _1n2) === _1n2;
  }
  neg(num2) {
    return mod(-num2, this.ORDER);
  }
  eql(lhs, rhs) {
    return lhs === rhs;
  }
  sqr(num2) {
    return mod(num2 * num2, this.ORDER);
  }
  add(lhs, rhs) {
    return mod(lhs + rhs, this.ORDER);
  }
  sub(lhs, rhs) {
    return mod(lhs - rhs, this.ORDER);
  }
  mul(lhs, rhs) {
    return mod(lhs * rhs, this.ORDER);
  }
  pow(num2, power) {
    return pow(num2, power, this.ORDER);
  }
  div(lhs, rhs) {
    return mod(lhs * invert(rhs, this.ORDER), this.ORDER);
  }
  // Same as above, but doesn't normalize
  sqrN(num2) {
    return num2 * num2;
  }
  addN(lhs, rhs) {
    return lhs + rhs;
  }
  subN(lhs, rhs) {
    return lhs - rhs;
  }
  mulN(lhs, rhs) {
    return lhs * rhs;
  }
  inv(num2) {
    return invert(num2, this.ORDER);
  }
  sqrt(num2) {
    let sqrt = FIELD_SQRT.get(this);
    if (!sqrt)
      FIELD_SQRT.set(this, sqrt = FpSqrt(this.ORDER));
    return sqrt(this, num2);
  }
  toBytes(num2) {
    return this.isLE ? numberToBytesLE(num2, this.BYTES) : numberToBytesBE(num2, this.BYTES);
  }
  fromBytes(bytes, skipValidation = false) {
    abytes3(bytes);
    const { _lengths: allowedLengths, BYTES, isLE: isLE2, ORDER, _mod: modFromBytes } = this;
    if (allowedLengths) {
      if (bytes.length < 1 || !allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
        throw new Error("Field.fromBytes: expected " + allowedLengths + " bytes, got " + bytes.length);
      }
      const padded = new Uint8Array(BYTES);
      padded.set(bytes, isLE2 ? 0 : padded.length - bytes.length);
      bytes = padded;
    }
    if (bytes.length !== BYTES)
      throw new Error("Field.fromBytes: expected " + BYTES + " bytes, got " + bytes.length);
    let scalar = isLE2 ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
    if (modFromBytes)
      scalar = mod(scalar, ORDER);
    if (!skipValidation) {
      if (!this.isValid(scalar))
        throw new Error("invalid field element: outside of range 0..ORDER");
    }
    return scalar;
  }
  // TODO: we don't need it here, move out to separate fn
  invertBatch(lst) {
    return FpInvertBatch(this, lst, true);
  }
  // We can't move this out because Fp6, Fp12 implement it
  // and it's unclear what to return in there.
  cmov(a, b, condition) {
    abool2(condition, "condition");
    return condition ? b : a;
  }
};
function Field(ORDER, opts = {}) {
  Object.freeze(_Field.prototype);
  return new _Field(ORDER, opts);
}
function getFieldBytesLength(fieldOrder) {
  if (typeof fieldOrder !== "bigint")
    throw new Error("field order must be bigint");
  if (fieldOrder <= _1n2)
    throw new Error("field order must be greater than 1");
  const bitLength = bitLen(fieldOrder - _1n2);
  return Math.ceil(bitLength / 8);
}
function getMinHashLength(fieldOrder) {
  const length = getFieldBytesLength(fieldOrder);
  return length + Math.ceil(length / 2);
}
function mapHashToField(key, fieldOrder, isLE2 = false) {
  abytes3(key);
  const len = key.length;
  const fieldLen = getFieldBytesLength(fieldOrder);
  const minLen = Math.max(getMinHashLength(fieldOrder), 16);
  if (len < minLen || len > 1024)
    throw new Error("expected " + minLen + "-1024 bytes of input, got " + len);
  const num2 = isLE2 ? bytesToNumberLE(key) : bytesToNumberBE(key);
  const reduced = mod(num2, fieldOrder - _1n2) + _1n2;
  return isLE2 ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
}

// node_modules/@noble/curves/abstract/curve.js
var _0n3 = /* @__PURE__ */ BigInt(0);
var _1n3 = /* @__PURE__ */ BigInt(1);
var _4n2 = /* @__PURE__ */ BigInt(4);
var BLIND_BYTES = 16;
var BLIND_BITS = 128;
var FW_WINDOW = 5;
var TABLE_BYTES_MAX = /* @__PURE__ */ (() => 2 ** 31)();
function validatePointCons(Point2) {
  const pc = Point2;
  if (typeof pc !== "function")
    throw new TypeError('"Point" expected constructor, got type=' + typeof Point2);
  afunction(pc.fromAffine, "Point.fromAffine");
  afunction(pc.fromBytes, "Point.fromBytes");
  afunction(pc.fromHex, "Point.fromHex");
  aobject2(pc.BASE, "Point.BASE");
  aobject2(pc.ZERO, "Point.ZERO");
  validateField(pc.Fp);
  validateField(pc.Fn);
}
function normalizeZ(c, points) {
  validatePointCons(c);
  validateMSMPoints(points, c);
  const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
  return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
}
function validateW(W, bits, min = 1) {
  if (!Number.isSafeInteger(W) || W < min || W > bits)
    throw new Error("invalid window size, expected [" + min + ".." + bits + "], got W=" + W);
}
function validateTableBytes(numPoints, fpBytes) {
  const bytes = numPoints * (4 * fpBytes + 128);
  if (bytes > TABLE_BYTES_MAX)
    throw new Error("invalid window size: table would need ~" + Math.ceil(bytes / 2 ** 20) + " MiB, max " + TABLE_BYTES_MAX / 2 ** 20 + " MiB");
}
function probeRandomBytes(randomBytes5, length) {
  if (randomBytes5 === void 0)
    return void 0;
  afunction(randomBytes5, "randomBytes");
  try {
    const probe = randomBytes5(length);
    if (!isBytes3(probe) || probe.length !== length)
      return void 0;
  } catch {
    return void 0;
  }
  return randomBytes5;
}
function validateMSMPoints(points, c) {
  aarray(points, "points");
  points.forEach((p, i) => {
    if (!(p instanceof c))
      throw new Error("invalid point at index " + i);
  });
}
function validateMSMScalars(scalars, field, maxScalar) {
  if (!Array.isArray(scalars))
    throw new Error("array of scalars expected");
  scalars.forEach((s, i) => {
    const ok = maxScalar === void 0 ? field.isValid(s) : isPosBig(s) && s < maxScalar;
    if (!ok)
      throw new Error("invalid scalar at index " + i);
  });
}
var pointWindowSizes = /* @__PURE__ */ new WeakMap();
function getWindowSize(P) {
  return pointWindowSizes.get(P) || 1;
}
function oddMultiples(p, size) {
  const dbl = p.double();
  const t = [p];
  for (let j = 1; j < size; j++)
    t.push(t[j - 1].add(dbl));
  return t;
}
function wnafDigits(n3, W) {
  const size = 2 ** W;
  const half = size / 2;
  const mask = BigInt(size - 1);
  const d = [];
  while (n3 > _0n3) {
    let w = 0;
    if (n3 & _1n3) {
      w = Number(n3 & mask);
      if (w >= half)
        w -= size;
      n3 -= BigInt(w);
    }
    d.push(w);
    n3 >>= _1n3;
  }
  return d;
}
function signedWindowDigits(n3, W, windows) {
  const size = 2 ** W;
  const half = size / 2;
  const mask = BigInt(size - 1);
  const shiftBy = BigInt(W);
  const d = [];
  for (let w = 0; w < windows; w++) {
    let v = Number(n3 & mask);
    n3 >>= shiftBy;
    if (v > half) {
      v -= size;
      n3 += _1n3;
    }
    d.push(v);
  }
  if (n3 !== _0n3)
    throw new Error("invalid wnaf");
  return d;
}
function wnafWalk(zero, tables, digits) {
  let max = 0;
  for (const d of digits)
    max = Math.max(max, d.length);
  let acc = zero;
  for (let bit = max - 1; bit >= 0; bit--) {
    if (bit !== max - 1)
      acc = acc.double();
    for (let i = 0; i < digits.length; i++) {
      const w = digits[i][bit];
      if (w) {
        const item = tables[i][Math.abs(w) - 1 >> 1];
        acc = acc.add(w < 0 ? item.negate() : item);
      }
    }
  }
  return acc;
}
var ScalarMultiplier = class {
  Point;
  BASE;
  ZERO;
  randomBytes;
  wnafPrecomputes = /* @__PURE__ */ new WeakMap();
  baseCanBeBlinded;
  bits;
  // Parametrized with a given Point class (not individual point)
  constructor(Point2, randomBytes5) {
    validatePointCons(Point2);
    this.randomBytes = probeRandomBytes(randomBytes5, BLIND_BYTES);
    this.Point = Point2;
    this.BASE = Point2.BASE;
    this.ZERO = Point2.ZERO;
    this.bits = Point2.Fn.BITS;
  }
  /**
   * Creates a signed fixed-window wNAF precomputation table: for every window w, the
   * multiples `[1..2^(W−1)]⋅2^(w⋅W)⋅P`, flattened. All doublings are baked into the table,
   * so cached multiplication is additions-only. `windows = ceil(bits/W) + 1`: the extra
   * window absorbs the final carry of signed-digit recoding.
   * For a 256-bit curve and W=6, the table is 44⋅32 = 1408 points.
   * @param point - Point instance
   * @param W - window size
   * @param bits - scalar bitlength the table must cover
   */
  buildWnafTable(point, W, bits) {
    const windows = Math.ceil(bits / W) + 1;
    const half = 2 ** (W - 1);
    const comp = [];
    let base2 = point;
    for (let w = 0; w < windows; w++) {
      let acc = base2;
      for (let i = 0; i < half; i++) {
        comp.push(acc);
        acc = acc.add(base2);
      }
      base2 = comp[comp.length - 1].double();
    }
    return { W, bits, windows, comp };
  }
  /**
   * Implements ec multiplication using precomputed signed fixed-window wNAF tables.
   * Constant-time: fixed window count with one table addition per window — zero digits feed
   * the fake accumulator — and no doublings; the lookup scans the whole window slice.
   * Scalar bounds are validated by the public entry points ({@link ScalarMultiplier.mulCT},
   * {@link ScalarMultiplier.mulCTBlinded}, {@link ScalarMultiplier.mulUnsafe});
   * signedWindowDigits throws if `n` exceeds the table.
   * @returns real and fake (for const-time) points
   */
  wnafCachedCT(precomputes, n3) {
    const { W, windows, comp } = precomputes;
    const half = 2 ** (W - 1);
    const digits = signedWindowDigits(n3, W, windows);
    let p = this.ZERO;
    let f = this.BASE;
    for (let w = 0; w < windows; w++) {
      const digit = digits[w];
      const start = w * half;
      const idx = Math.abs(digit) - 1;
      let sel = comp[start];
      for (let i = 1; i < half; i++)
        sel = i === idx ? comp[start + i] : sel;
      const neg = sel.negate();
      if (digit === 0)
        f = f.add(comp[start]);
      else
        p = p.add(digit < 0 ? neg : sel);
    }
    return { p, f };
  }
  // Cache key is point identity plus (W, bits); at most two entries exist per point (public-width
  // `Fn.BITS` and blinded `Fn.BITS + BLIND_BITS`). Callers must not reuse the same point with
  // incompatible `transform(...)` layouts and expect a separate cache entry.
  getWnafPrecomputes(W, point, bits, transform) {
    let entries = this.wnafPrecomputes.get(point);
    let comp = entries?.find((entry) => entry.W === W && entry.bits === bits);
    if (!comp) {
      comp = this.buildWnafTable(point, W, bits);
      if (typeof transform === "function")
        comp = { ...comp, comp: transform(comp.comp) };
      if (!entries) {
        entries = [];
        this.wnafPrecomputes.set(point, entries);
      }
      entries.push(comp);
    }
    return comp;
  }
  assertPoint(point) {
    if (!(point instanceof this.Point))
      throw new TypeError('"point" expected Point instance, got type=' + typeof point);
  }
  // Shared prologue of the constant-time entry points. Rejects scalar 0: in key/signature-style
  // callers a zero scalar means broken upstream plumbing, and concrete Points already reject it.
  // Uses inRange instead of Fn.isValidNot0: validateField() only certifies the arithmetic subset.
  validateMulInput(point, scalar) {
    this.assertPoint(point);
    if (!inRange(scalar, _1n3, this.Point.Fn.ORDER))
      throw new Error("invalid scalar");
  }
  // Constant-time dispatch shared by mulCT / mulCTBlinded. Un-precomputed points (W===1, e.g.
  // ECDH peer keys) skip building a throwaway cached table in favor of a small fixed-window
  // multiply. `n` must be < 2^bits.
  runCT(point, n3, bits, transform) {
    const W = getWindowSize(point);
    if (W === 1)
      return this.fixedWindowCT(point, n3, bits);
    return this.wnafCachedCT(this.getWnafPrecomputes(W, point, bits, transform), n3);
  }
  mulCT(point, scalar, transform) {
    this.validateMulInput(point, scalar);
    return this.runCT(point, scalar, this.bits, transform);
  }
  mulCTBlinded(point, scalar, transform) {
    this.validateMulInput(point, scalar);
    if (this.randomBytes === void 0)
      throw new Error("randomBytes is required for scalar blinding");
    const bits = this.Point.Fn.BITS + BLIND_BITS;
    const blind = this.randomBytes(BLIND_BYTES);
    if (!isBytes3(blind) || blind.length !== BLIND_BYTES)
      throw new Error("randomBytes returned invalid byte array");
    blind[0] = blind[0] & 63 | 128;
    const n3 = scalar + bytesToNumberBE(blind) * this.Point.Fn.ORDER;
    return this.runCT(point, n3, bits, transform);
  }
  /**
   * Constant-time multiplication `n*point` for an un-precomputed point, via a small fixed window.
   * A cached wNAF table only pays off when reused; a flat 2^FW_WINDOW table (`size-1` adds) is
   * far cheaper to build for a single use. The point-operation sequence is independent of `n`:
   * build the table, then per window exactly FW_WINDOW doublings, a data-oblivious scan over
   * every table entry, and one addition (adds the identity when the window digit is 0 — never
   * skipped).
   *
   * `n` must be `< 2^bits`. Assumes complete addition (adding the identity costs the same as any
   * add), which holds for the Weierstrass/Edwards point types used here. The table is left in
   * projective form (no normalizeZ): normalizing this small a table costs more than the
   * mixed-add savings it would buy for a single multiply.
   * @returns real point `p`; `f` duplicates it only to match {@link wnafCachedCT}'s return shape
   * (this path needs no fake accumulator — its op-count is already scalar-independent).
   */
  fixedWindowCT(point, n3, bits) {
    const W = FW_WINDOW;
    const size = 1 << W;
    const mask = bitMask(W);
    const table = new Array(size);
    table[0] = this.ZERO;
    for (let i = 1; i < size; i++)
      table[i] = table[i - 1].add(point);
    const windows = Math.ceil(bits / W);
    let acc = this.ZERO;
    for (let window = windows - 1; window >= 0; window--) {
      if (window !== windows - 1)
        for (let d = 0; d < W; d++)
          acc = acc.double();
      const digit = Number(n3 >> BigInt(window * W) & mask);
      let sel = table[0];
      for (let i = 1; i < size; i++)
        sel = i === digit ? table[i] : sel;
      acc = acc.add(sel);
    }
    return { p: acc, f: acc };
  }
  shouldBlind(point, cofactor) {
    if (this.randomBytes === void 0)
      return false;
    if (cofactor === _1n3)
      return true;
    if (point !== this.BASE)
      return false;
    if (this.baseCanBeBlinded === void 0)
      this.baseCanBeBlinded = this.mulUnsafe(this.BASE, this.Point.Fn.ORDER).is0();
    return this.baseCanBeBlinded;
  }
  mulSecret(point, scalar, cofactor, transform) {
    return this.shouldBlind(point, cofactor) ? this.mulCTBlinded(point, scalar, transform) : this.mulCT(point, scalar, transform);
  }
  mulUnsafe(point, scalar, transform) {
    this.assertPoint(point);
    if (!isPosBig(scalar))
      throw new Error("invalid scalar");
    const W = getWindowSize(point);
    if (W === 1 || scalar >= this.Point.Fn.ORDER)
      return mulAddUnsafe(this.Point, [point], [scalar], true);
    const precomputes = this.getWnafPrecomputes(W, point, this.bits, transform);
    return this.wnafCachedCT(precomputes, scalar).p;
  }
  // Remembers the window size used for precomputed wNAF multiplication of the given point
  // and drops any previously built tables. Usually only the base point is precomputed.
  // W=1 resets the point to the un-precomputed (table-less) paths.
  // W is additionally capped so tables stay under ~2 GiB ({@link TABLE_BYTES_MAX}).
  setWindowSize(point, W) {
    this.assertPoint(point);
    validateW(W, this.bits);
    const windows = Math.ceil((this.bits + BLIND_BITS) / W) + 1;
    validateTableBytes(windows * 2 ** (W - 1), this.Point.Fp.BYTES);
    pointWindowSizes.set(point, W);
    this.wnafPrecomputes.delete(point);
  }
  // True when a window size is set: tables themselves are built lazily on first multiply.
  hasWindowSize(point) {
    return getWindowSize(point) !== 1;
  }
};
function mulAddUnsafe(c, points, scalars, allowOversized = false) {
  validatePointCons(c);
  validateMSMPoints(points, c);
  abool2(allowOversized, "allowOversized");
  validateMSMScalars(scalars, c.Fn, allowOversized ? c.Fn.ORDER ** _4n2 : void 0);
  if (points.length !== scalars.length)
    throw new Error("arrays of points and scalars must have equal length");
  const tables = points.map((p) => oddMultiples(p, 4));
  const digits = scalars.map((n3) => wnafDigits(n3, 4));
  return wnafWalk(c.ZERO, tables, digits);
}
function createField(order, field, isLE2) {
  if (field) {
    if (field.ORDER !== order)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    validateField(field);
    return field;
  } else {
    return Field(order, { isLE: isLE2 });
  }
}
function createCurveFields(type, CURVE, curveOpts = {}, FpFnLE) {
  if (type !== "weierstrass" && type !== "edwards")
    throw new Error('expected curve type "weierstrass" or "edwards"');
  if (FpFnLE === void 0)
    FpFnLE = type === "edwards";
  if (!CURVE || typeof CURVE !== "object")
    throw new Error(`expected valid ${type} CURVE object`);
  validateObject(curveOpts);
  for (const p of ["p", "n", "h"]) {
    const val = CURVE[p];
    if (!(isPosBig(val) && val !== _0n3))
      throw new Error(`CURVE.${p} must be positive bigint`);
  }
  const Fp2 = createField(CURVE.p, curveOpts.Fp, FpFnLE);
  const Fn2 = createField(CURVE.n, curveOpts.Fn, FpFnLE);
  const _b = type === "weierstrass" ? "b" : "d";
  const params = ["Gx", "Gy", "a", _b];
  for (const p of params) {
    if (!Fp2.isValid(CURVE[p]))
      throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
  }
  CURVE = Object.freeze(Object.assign({}, CURVE));
  return { CURVE, Fp: Fp2, Fn: Fn2 };
}
function createKeygen(randomSecretKey, getPublicKey) {
  return function keygen(seed) {
    const secretKey = randomSecretKey(seed);
    return { secretKey, publicKey: getPublicKey(secretKey) };
  };
}

// node_modules/@noble/curves/abstract/der.js
var _0n4 = /* @__PURE__ */ BigInt(0);
var DERErr = class extends Error {
  constructor(m = "") {
    super(m);
  }
};
var _DER = {
  // asn.1 DER encoding utils
  Err: DERErr,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (tag, data) => {
      const { Err: E } = _DER;
      asafenumber(tag, "tag");
      if (tag < 0 || tag > 255)
        throw new E("tlv.encode: wrong tag");
      astring(data, "data");
      if (data.length & 1)
        throw new E("tlv.encode: unpadded data");
      const dataLen = data.length / 2;
      const len = numberToHexUnpadded(dataLen);
      if (len.length / 2 & 128)
        throw new E("tlv.encode: long form length too big");
      const lenLen = dataLen > 127 ? numberToHexUnpadded(len.length / 2 | 128) : "";
      const t = numberToHexUnpadded(tag);
      return t + lenLen + len + data;
    },
    // v - value, l - left bytes (unparsed)
    decode(tag, data) {
      const { Err: E } = _DER;
      data = abytes3(data, void 0, "DER data");
      let pos = 0;
      if (tag < 0 || tag > 255)
        throw new E("tlv.decode: wrong tag");
      if (data.length < 2 || data[pos++] !== tag)
        throw new E("tlv.decode: wrong tlv");
      const first = data[pos++];
      const isLong = !!(first & 128);
      let length = 0;
      if (!isLong)
        length = first;
      else {
        const lenLen = first & 127;
        if (!lenLen)
          throw new E("tlv.decode(long): indefinite length not supported");
        if (lenLen > 4)
          throw new E("tlv.decode(long): byte length is too big");
        const lengthBytes = data.subarray(pos, pos + lenLen);
        if (lengthBytes.length !== lenLen)
          throw new E("tlv.decode: length bytes not complete");
        if (lengthBytes[0] === 0)
          throw new E("tlv.decode(long): zero leftmost byte");
        for (const b of lengthBytes)
          length = length << 8 | b;
        pos += lenLen;
        if (length < 128)
          throw new E("tlv.decode(long): not minimal encoding");
      }
      const v = data.subarray(pos, pos + length);
      if (v.length !== length)
        throw new E("tlv.decode: wrong value length");
      return { v, l: data.subarray(pos + length) };
    }
  },
  // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
  // since we always use positive integers here. It must always be empty:
  // - add zero byte if exists
  // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
  _int: {
    encode(num2) {
      const { Err: E } = _DER;
      abignumber(num2);
      if (num2 < _0n4)
        throw new E("integer: negative integers are not allowed");
      let hex = numberToHexUnpadded(num2);
      if (Number.parseInt(hex[0], 16) & 8)
        hex = "00" + hex;
      if (hex.length & 1)
        throw new E("unexpected DER parsing assertion: unpadded hex");
      return hex;
    },
    decode(data) {
      const { Err: E } = _DER;
      if (data.length < 1)
        throw new E("invalid signature integer: empty");
      if (data[0] & 128)
        throw new E("invalid signature integer: negative");
      if (data.length > 1 && data[0] === 0 && !(data[1] & 128))
        throw new E("invalid signature integer: unnecessary leading zero");
      return bytesToNumberBE(data);
    }
  },
  toSig(bytes, maxScalarBytes) {
    const { Err: E, _int: int, _tlv: tlv } = _DER;
    if (maxScalarBytes !== void 0) {
      asafenumber(maxScalarBytes, "maxScalarBytes");
      if (maxScalarBytes < 1)
        throw new E("invalid signature: maxScalarBytes must be positive");
    }
    const data = abytes3(bytes, void 0, "signature");
    const { v: seqBytes, l: seqLeftBytes } = tlv.decode(48, data);
    if (seqLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    const { v: rBytes, l: rLeftBytes } = tlv.decode(2, seqBytes);
    const { v: sBytes, l: sLeftBytes } = tlv.decode(2, rLeftBytes);
    if (sLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    if (maxScalarBytes !== void 0 && (rBytes.length > maxScalarBytes || sBytes.length > maxScalarBytes))
      throw new E("invalid signature: integer too large");
    return { r: int.decode(rBytes), s: int.decode(sBytes) };
  },
  hexFromSig(sig) {
    const { _tlv: tlv, _int: int } = _DER;
    validateObject(sig, { r: "bigint", s: "bigint" }, {}, "sig");
    const rs = tlv.encode(2, int.encode(sig.r));
    const ss = tlv.encode(2, int.encode(sig.s));
    const seq = rs + ss;
    return tlv.encode(48, seq);
  }
};
var DER = /* @__PURE__ */ (() => {
  Object.freeze(_DER._tlv);
  Object.freeze(_DER._int);
  return Object.freeze(_DER);
})();

// node_modules/@noble/curves/abstract/weierstrass.js
var divNearest = (num2, den) => (num2 + (num2 >= 0 ? den : -den) / _2n2) / den;
function _splitEndoScalar(k, basis, n3) {
  aInRange("scalar", k, _0n5, n3);
  const [[a1, b1], [a2, b2]] = basis;
  const c1 = divNearest(b2 * k, n3);
  const c2 = divNearest(-b1 * k, n3);
  let k1 = k - c1 * a1 - c2 * a2;
  let k2 = -c1 * b1 - c2 * b2;
  const k1neg = k1 < _0n5;
  const k2neg = k2 < _0n5;
  if (k1neg)
    k1 = -k1;
  if (k2neg)
    k2 = -k2;
  const MAX_NUM = bitMask(Math.ceil(bitLen(n3) / 2)) + _1n4;
  if (k1 < _0n5 || k1 >= MAX_NUM || k2 < _0n5 || k2 >= MAX_NUM) {
    throw new Error("splitScalar (endomorphism): failed for k");
  }
  return { k1neg, k1, k2neg, k2 };
}
function validateSigFormat(format) {
  if (!["compact", "recovered", "der"].includes(format))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return format;
}
function validateSigOpts(opts, def) {
  validateObject(opts);
  const optsn = {};
  for (let optName of Object.keys(def)) {
    optsn[optName] = opts[optName] === void 0 ? def[optName] : opts[optName];
  }
  abool2(optsn.lowS, "lowS");
  abool2(optsn.prehash, "prehash");
  if (optsn.format !== void 0)
    validateSigFormat(optsn.format);
  return optsn;
}
var _0n5 = /* @__PURE__ */ BigInt(0);
var _1n4 = /* @__PURE__ */ BigInt(1);
var _2n2 = /* @__PURE__ */ BigInt(2);
var _3n2 = /* @__PURE__ */ BigInt(3);
var _4n3 = /* @__PURE__ */ BigInt(4);
function weierstrass(params, extraOpts = {}) {
  const validated = createCurveFields("weierstrass", params, extraOpts);
  const Fp2 = validated.Fp;
  const Fn2 = validated.Fn;
  let CURVE = validated.CURVE;
  const { h: cofactor, n: CURVE_ORDER } = CURVE;
  validateObject(extraOpts, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object",
    randomBytes: "function"
  });
  const { endo: endoOpts, allowInfinityPoint, clearCofactor, isTorsionFree, fromBytes, toBytes } = extraOpts;
  const randomBytes5 = extraOpts.randomBytes === void 0 ? randomBytes2 : extraOpts.randomBytes;
  if (endoOpts) {
    if (!Fp2.is0(CURVE.a) || typeof endoOpts.beta !== "bigint" || !Array.isArray(endoOpts.basises)) {
      throw new Error('invalid endo: expected "beta": bigint and "basises": array');
    }
  }
  const endo = endoOpts ? {
    beta: endoOpts.beta,
    basises: endoOpts.basises.map((basis) => [...basis])
  } : void 0;
  const lengths = getWLengths(Fp2, Fn2);
  function assertCompressionIsSupported() {
    if (!Fp2.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function pointToBytes(_c, point, isCompressed) {
    if (point.is0()) {
      if (!allowInfinityPoint)
        throw new Error("bad point: ZERO");
      return Uint8Array.of(0);
    }
    const { x, y } = point.toAffine();
    const bx = Fp2.toBytes(x);
    abool2(isCompressed, "isCompressed");
    if (isCompressed) {
      assertCompressionIsSupported();
      const hasEvenY = !Fp2.isOdd(y);
      return concatBytes2(pprefix(hasEvenY), bx);
    } else {
      return concatBytes2(Uint8Array.of(4), bx, Fp2.toBytes(y));
    }
  }
  function pointFromBytes(bytes) {
    abytes3(bytes, void 0, "Point");
    const { publicKey: comp, publicKeyUncompressed: uncomp } = lengths;
    const length = bytes.length;
    const head = bytes[0];
    const tail = bytes.subarray(1);
    if (allowInfinityPoint && length === 1 && head === 0)
      return { x: Fp2.ZERO, y: Fp2.ZERO };
    if (length === comp && (head === 2 || head === 3)) {
      const x = Fp2.fromBytes(tail);
      if (!Fp2.isValid(x))
        throw new Error("bad point: is not on curve, wrong x");
      const y2 = weierstrassEquation(x);
      let y;
      try {
        y = Fp2.sqrt(y2);
      } catch (sqrtError) {
        const err = sqrtError instanceof Error ? ": " + sqrtError.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + err);
      }
      assertCompressionIsSupported();
      const evenY = Fp2.isOdd(y);
      const evenH = (head & 1) === 1;
      if (evenH !== evenY)
        y = Fp2.neg(y);
      return { x, y };
    } else if (length === uncomp && head === 4) {
      const L = Fp2.BYTES;
      const x = Fp2.fromBytes(tail.subarray(0, L));
      const y = Fp2.fromBytes(tail.subarray(L, L * 2));
      if (!isValidXY(x, y))
        throw new Error("bad point: is not on curve");
      return { x, y };
    } else {
      throw new Error(`bad point: got length ${length}, expected compressed=${comp} or uncompressed=${uncomp}`);
    }
  }
  const encodePoint = toBytes === void 0 ? pointToBytes : toBytes;
  const decodePoint = fromBytes === void 0 ? pointFromBytes : fromBytes;
  const b3 = Fp2.mul(CURVE.b, _3n2);
  const mulA = Fp2.is0(CURVE.a) ? (_) => Fp2.ZERO : (x) => Fp2.mul(CURVE.a, x);
  function weierstrassEquation(x) {
    const x2 = Fp2.sqr(x);
    const x3 = Fp2.mul(x2, x);
    return Fp2.add(Fp2.add(x3, Fp2.mul(x, CURVE.a)), CURVE.b);
  }
  function isValidXY(x, y) {
    const left = Fp2.sqr(y);
    const right = weierstrassEquation(x);
    return Fp2.eql(left, right);
  }
  if (!isValidXY(CURVE.Gx, CURVE.Gy))
    throw new Error("bad curve params: generator point");
  const _4a3 = Fp2.mul(Fp2.pow(CURVE.a, _3n2), _4n3);
  const _27b2 = Fp2.mul(Fp2.sqr(CURVE.b), BigInt(27));
  if (Fp2.is0(Fp2.add(_4a3, _27b2)))
    throw new Error("bad curve params: a or b");
  function acoord(title, n3, banZero = false) {
    if (!Fp2.isValid(n3) || banZero && Fp2.is0(n3))
      throw new Error(`bad point coordinate ${title}`);
    return typeof n3 === "object" && n3 !== null ? Fp2.create(n3) : n3;
  }
  function aprjpoint(other) {
    if (!(other instanceof Point2))
      throw new Error("Weierstrass Point expected");
  }
  function splitEndoScalarN(k) {
    if (!endo || !endo.basises)
      throw new Error("no endo");
    return _splitEndoScalar(k, endo.basises, Fn2.ORDER);
  }
  function pushWnafPair(points, scalars, p, k) {
    if (!Fn2.isValid(k))
      throw new RangeError("invalid scalar: out of range");
    if (endo) {
      const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(k);
      const psi = new Point2(Fp2.mul(p.X, endo.beta), p.Y, p.Z);
      points.push(k1neg ? p.negate() : p, k2neg ? psi.negate() : psi);
      scalars.push(k1, k2);
    } else {
      points.push(p);
      scalars.push(k);
    }
  }
  const validityCache = /* @__PURE__ */ new WeakSet();
  class Point2 {
    static BASE = new Point2(CURVE.Gx, CURVE.Gy, Fp2.ONE);
    static ZERO = new Point2(Fp2.ZERO, Fp2.ONE, Fp2.ZERO);
    static Fp = Fp2;
    static Fn = Fn2;
    X;
    Y;
    Z;
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(X, Y, Z) {
      this.X = acoord("x", X);
      this.Y = acoord("y", Y, true);
      this.Z = acoord("z", Z);
      Object.freeze(this);
    }
    static CURVE() {
      return CURVE;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(p) {
      const { x, y } = p || {};
      if (!p || !Fp2.isValid(x) || !Fp2.isValid(y))
        throw new Error("invalid affine point");
      if (p instanceof Point2)
        throw new Error("projective point not allowed");
      if (Fp2.is0(x) && Fp2.is0(y))
        return Point2.ZERO;
      return new Point2(x, y, Fp2.ONE);
    }
    static fromBytes(bytes) {
      const P = Point2.fromAffine(decodePoint(abytes3(bytes, void 0, "point")));
      P.assertValidity();
      return P;
    }
    static fromHex(hex) {
      return Point2.fromBytes(hexToBytes2(hex));
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    /**
     * @param isLazy - true will defer table computation until the first multiplication
     */
    precompute(windowSize = 6, isLazy = true) {
      wnaf.setWindowSize(this, windowSize);
      if (!isLazy)
        this.multiply(_3n2);
      return this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      const p = this;
      if (p.is0()) {
        if (allowInfinityPoint && Fp2.is0(p.X) && Fp2.eql(p.Y, Fp2.ONE) && Fp2.is0(p.Z))
          return;
        throw new Error("bad point: ZERO");
      }
      if (validityCache.has(p))
        return;
      const { x, y } = p.toAffine();
      if (!Fp2.isValid(x) || !Fp2.isValid(y))
        throw new Error("bad point: x or y not field elements");
      if (!isValidXY(x, y))
        throw new Error("bad point: equation left != right");
      if (!p.isTorsionFree())
        throw new Error("bad point: not in prime-order subgroup");
      validityCache.add(p);
    }
    hasEvenY() {
      const { y } = this.toAffine();
      if (!Fp2.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !Fp2.isOdd(y);
    }
    /** Compare one point to another. */
    equals(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      const U1 = Fp2.eql(Fp2.mul(X1, Z2), Fp2.mul(X2, Z1));
      const U2 = Fp2.eql(Fp2.mul(Y1, Z2), Fp2.mul(Y2, Z1));
      return U1 && U2;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new Point2(this.X, Fp2.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { X: X1, Y: Y1, Z: Z1 } = this;
      let X3 = Fp2.ZERO, Y3 = Fp2.ZERO, Z3 = Fp2.ZERO;
      let t0 = Fp2.mul(X1, X1);
      let t1 = Fp2.mul(Y1, Y1);
      let t2 = Fp2.mul(Z1, Z1);
      let t3 = Fp2.mul(X1, Y1);
      t3 = Fp2.add(t3, t3);
      Z3 = Fp2.mul(X1, Z1);
      Z3 = Fp2.add(Z3, Z3);
      X3 = mulA(Z3);
      Y3 = Fp2.mul(b3, t2);
      Y3 = Fp2.add(X3, Y3);
      X3 = Fp2.sub(t1, Y3);
      Y3 = Fp2.add(t1, Y3);
      Y3 = Fp2.mul(X3, Y3);
      X3 = Fp2.mul(t3, X3);
      Z3 = Fp2.mul(b3, Z3);
      t2 = mulA(t2);
      t3 = Fp2.sub(t0, t2);
      t3 = mulA(t3);
      t3 = Fp2.add(t3, Z3);
      Z3 = Fp2.add(t0, t0);
      t0 = Fp2.add(Z3, t0);
      t0 = Fp2.add(t0, t2);
      t0 = Fp2.mul(t0, t3);
      Y3 = Fp2.add(Y3, t0);
      t2 = Fp2.mul(Y1, Z1);
      t2 = Fp2.add(t2, t2);
      t0 = Fp2.mul(t2, t3);
      X3 = Fp2.sub(X3, t0);
      Z3 = Fp2.mul(t2, t1);
      Z3 = Fp2.add(Z3, Z3);
      Z3 = Fp2.add(Z3, Z3);
      return new Point2(X3, Y3, Z3);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      let X3 = Fp2.ZERO, Y3 = Fp2.ZERO, Z3 = Fp2.ZERO;
      let t0 = Fp2.mul(X1, X2);
      let t1 = Fp2.mul(Y1, Y2);
      let t2 = Fp2.mul(Z1, Z2);
      let t3 = Fp2.add(X1, Y1);
      let t4 = Fp2.add(X2, Y2);
      t3 = Fp2.mul(t3, t4);
      t4 = Fp2.add(t0, t1);
      t3 = Fp2.sub(t3, t4);
      t4 = Fp2.add(X1, Z1);
      let t5 = Fp2.add(X2, Z2);
      t4 = Fp2.mul(t4, t5);
      t5 = Fp2.add(t0, t2);
      t4 = Fp2.sub(t4, t5);
      t5 = Fp2.add(Y1, Z1);
      X3 = Fp2.add(Y2, Z2);
      t5 = Fp2.mul(t5, X3);
      X3 = Fp2.add(t1, t2);
      t5 = Fp2.sub(t5, X3);
      Z3 = mulA(t4);
      X3 = Fp2.mul(b3, t2);
      Z3 = Fp2.add(X3, Z3);
      X3 = Fp2.sub(t1, Z3);
      Z3 = Fp2.add(t1, Z3);
      Y3 = Fp2.mul(X3, Z3);
      t1 = Fp2.add(t0, t0);
      t1 = Fp2.add(t1, t0);
      t2 = mulA(t2);
      t4 = Fp2.mul(b3, t4);
      t1 = Fp2.add(t1, t2);
      t2 = Fp2.sub(t0, t2);
      t2 = mulA(t2);
      t4 = Fp2.add(t4, t2);
      t0 = Fp2.mul(t1, t4);
      Y3 = Fp2.add(Y3, t0);
      t0 = Fp2.mul(t5, t4);
      X3 = Fp2.mul(t3, X3);
      X3 = Fp2.sub(X3, t0);
      t0 = Fp2.mul(t3, t1);
      Z3 = Fp2.mul(t5, Z3);
      Z3 = Fp2.add(Z3, t0);
      return new Point2(X3, Y3, Z3);
    }
    subtract(other) {
      aprjpoint(other);
      return this.add(other.negate());
    }
    is0() {
      return this.equals(Point2.ZERO);
    }
    /**
     * Constant time multiplication.
     * Uses precomputed tables (signed fixed-window wNAF) when available.
     * Uses scalar blinding and avoids endomorphism splitting in the secret-scalar path.
     * @param scalar - by which the point would be multiplied
     * @returns New point
     */
    multiply(scalar) {
      if (!Fn2.isValidNot0(scalar))
        throw new RangeError("invalid scalar: out of range");
      const { p, f } = wnaf.mulSecret(this, scalar, cofactor, normalize2);
      return normalize2([p, f])[0];
    }
    /**
     * Non-constant-time multiplication. Uses width-4 wNAF with GLV endomorphism splitting
     * when available (two half-width scalars sharing one halved doubling chain).
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(scalar) {
      const p = this;
      const sc = scalar;
      if (!Fn2.isValid(sc))
        throw new RangeError("invalid scalar: out of range");
      if (sc === _0n5 || p.is0())
        return Point2.ZERO;
      if (sc === _1n4)
        return p;
      if (wnaf.hasWindowSize(this))
        return wnaf.mulUnsafe(p, sc, normalize2);
      const points = [];
      const scalars = [];
      pushWnafPair(points, scalars, p, sc);
      return mulAddUnsafe(Point2, points, scalars);
    }
    /**
     * Non-constant-time double-scalar multiplication `a⋅this + b⋅other` (Strauss–Shamir).
     * Both walks share one doubling chain via {@link mulAddUnsafe}, and GLV endomorphism
     * (when available) halves the chain again by splitting each scalar into two half-width
     * parts. Used by ECDSA verification and public-key recovery for `R = u1⋅G + u2⋅P`.
     * Only for public scalars.
     */
    mulAddUnsafe(a, other, b) {
      aprjpoint(other);
      const points = [];
      const scalars = [];
      pushWnafPair(points, scalars, this, a);
      pushWnafPair(points, scalars, other, b);
      return mulAddUnsafe(Point2, points, scalars);
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * (X, Y, Z) ∋ (x=X/Z, y=Y/Z).
     * @param invertedZ - Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(invertedZ) {
      const p = this;
      let iz = invertedZ;
      if (iz != null && !Fp2.isValid(iz))
        throw new RangeError('"invertedZ" expected valid field element');
      const { X, Y, Z } = p;
      if (Fp2.eql(Z, Fp2.ONE))
        return { x: X, y: Y };
      const is0 = p.is0();
      if (iz == null)
        iz = is0 ? Fp2.ONE : Fp2.inv(Z);
      const x = Fp2.mul(X, iz);
      const y = Fp2.mul(Y, iz);
      const zz = Fp2.mul(Z, iz);
      if (is0)
        return { x: Fp2.ZERO, y: Fp2.ZERO };
      if (!Fp2.eql(zz, Fp2.ONE))
        throw new Error("invZ was invalid");
      return { x, y };
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      if (cofactor === _1n4)
        return true;
      if (isTorsionFree)
        return isTorsionFree(Point2, this);
      return wnaf.mulUnsafe(this, CURVE_ORDER).is0();
    }
    clearCofactor() {
      if (cofactor === _1n4)
        return this;
      if (clearCofactor)
        return clearCofactor(Point2, this);
      return this.multiplyUnsafe(cofactor);
    }
    isSmallOrder() {
      if (cofactor === _1n4)
        return this.is0();
      return this.clearCofactor().is0();
    }
    toBytes(isCompressed = true) {
      abool2(isCompressed, "isCompressed");
      this.assertValidity();
      return encodePoint(Point2, this, isCompressed);
    }
    toHex(isCompressed = true) {
      return bytesToHex2(this.toBytes(isCompressed));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const normalize2 = (points) => normalizeZ(Point2, points);
  const wnaf = new ScalarMultiplier(Point2, randomBytes5);
  if (wnaf.bits >= 6)
    Point2.BASE.precompute(6);
  Object.freeze(Point2.prototype);
  Object.freeze(Point2);
  return Point2;
}
function pprefix(hasEvenY) {
  return Uint8Array.of(hasEvenY ? 2 : 3);
}
function getWLengths(Fp2, Fn2) {
  return {
    secretKey: Fn2.BYTES,
    publicKey: 1 + Fp2.BYTES,
    publicKeyUncompressed: 1 + 2 * Fp2.BYTES,
    publicKeyHasPrefix: true,
    // Raw compact `(r || s)` signature width; DER and recovered signatures use
    // different lengths outside this helper.
    signature: 2 * Fn2.BYTES
  };
}
function ecdh(Point2, ecdhOpts = {}) {
  validatePointCons(Point2);
  const { Fn: Fn2 } = Point2;
  const randomBytes_ = ecdhOpts.randomBytes === void 0 ? randomBytes2 : ecdhOpts.randomBytes;
  const lengths = Object.assign(getWLengths(Point2.Fp, Fn2), {
    seed: Math.max(getMinHashLength(Fn2.ORDER), 16)
  });
  function isValidSecretKey(secretKey) {
    try {
      const num2 = Fn2.fromBytes(secretKey);
      return Fn2.isValidNot0(num2);
    } catch (error) {
      return false;
    }
  }
  function isValidPublicKey(publicKey, isCompressed) {
    const { publicKey: comp, publicKeyUncompressed } = lengths;
    try {
      const l = publicKey.length;
      if (isCompressed === true && l !== comp)
        return false;
      if (isCompressed === false && l !== publicKeyUncompressed)
        return false;
      return !Point2.fromBytes(publicKey).is0();
    } catch (error) {
      return false;
    }
  }
  function randomSecretKey(seed) {
    seed = seed === void 0 ? randomBytes_(lengths.seed) : seed;
    return mapHashToField(abytes3(seed, lengths.seed, "seed"), Fn2.ORDER);
  }
  function getPublicKey(secretKey, isCompressed = true) {
    return Point2.BASE.multiply(Fn2.fromBytes(secretKey)).toBytes(isCompressed);
  }
  function isProbPub(item) {
    const { secretKey, publicKey, publicKeyUncompressed } = lengths;
    const allowedLengths = Fn2._lengths;
    if (!isBytes3(item))
      return void 0;
    const l = abytes3(item, void 0, "key").length;
    const isPub = l === publicKey || l === publicKeyUncompressed;
    const isSec = l === secretKey || !!allowedLengths?.includes(l);
    if (isPub && isSec)
      return void 0;
    return isPub;
  }
  function getSharedSecret(secretKeyA, publicKeyB, isCompressed = true) {
    if (isProbPub(secretKeyA) === true)
      throw new Error("first arg must be private key");
    if (isProbPub(publicKeyB) === false)
      throw new Error("second arg must be public key");
    const s = Fn2.fromBytes(secretKeyA);
    const b = Point2.fromBytes(publicKeyB);
    if (b.is0())
      throw new Error("invalid public key: point at infinity");
    return b.multiply(s).toBytes(isCompressed);
  }
  const utils = {
    isValidSecretKey,
    isValidPublicKey,
    randomSecretKey
  };
  const keygen = createKeygen(randomSecretKey, getPublicKey);
  Object.freeze(utils);
  Object.freeze(lengths);
  return Object.freeze({ getPublicKey, getSharedSecret, keygen, Point: Point2, utils, lengths });
}
function ecdsa(Point2, hash, ecdsaOpts = {}) {
  validatePointCons(Point2);
  const hash_ = hash;
  ahash(hash_);
  validateObject(ecdsaOpts, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  const opts = Object.assign({}, ecdsaOpts);
  const randomBytes5 = opts.randomBytes === void 0 ? randomBytes2 : opts.randomBytes;
  const hmac2 = opts.hmac === void 0 ? (key, msg) => hmac(hash_, key, msg) : opts.hmac;
  const { Fp: Fp2, Fn: Fn2 } = Point2;
  const { ORDER: CURVE_ORDER, BITS: fnBits } = Fn2;
  const blindLength = getMinHashLength(CURVE_ORDER);
  const csprng = probeRandomBytes(randomBytes5, blindLength);
  const { keygen, getPublicKey, getSharedSecret, utils, lengths } = ecdh(Point2, opts);
  const defaultSigOpts = {
    prehash: true,
    lowS: typeof opts.lowS === "boolean" ? opts.lowS : true,
    format: "compact",
    extraEntropy: false
  };
  const hasLargeRecoveryLifts = CURVE_ORDER * _2n2 + _1n4 < Fp2.ORDER;
  function isBiggerThanHalfOrder(number) {
    const HALF = CURVE_ORDER >> _1n4;
    return number > HALF;
  }
  function validateRS(title, num2) {
    if (!Fn2.isValidNot0(num2))
      throw new Error(`invalid signature ${title}: out of range 1..Point.Fn.ORDER`);
    return num2;
  }
  function assertFieldSignIsSupported() {
    if (!Fp2.isOdd)
      throw new Error("Field doesn't support isOdd");
  }
  function getRecoveryBit(x, y, r) {
    assertFieldSignIsSupported();
    return (x === r ? 0 : 2) | Number(Fp2.isOdd(y));
  }
  function assertRecoverableCurve() {
    if (hasLargeRecoveryLifts)
      throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
  }
  function validateSigLength(bytes, format) {
    validateSigFormat(format);
    const size = lengths.signature;
    const sizer = format === "compact" ? size : format === "recovered" ? size + 1 : void 0;
    return abytes3(bytes, sizer);
  }
  class Signature {
    r;
    s;
    recovery;
    constructor(r, s, recovery) {
      this.r = validateRS("r", r);
      this.s = validateRS("s", s);
      if (recovery != null) {
        assertRecoverableCurve();
        if (![0, 1, 2, 3].includes(recovery))
          throw new Error("invalid recovery id");
        this.recovery = recovery;
      }
      Object.freeze(this);
    }
    static fromBytes(bytes, format = defaultSigOpts.format) {
      validateSigLength(bytes, format);
      let recid;
      if (format === "der") {
        if (bytes.length > 2 * Fn2.BYTES + 16)
          throw new DER.Err("invalid signature: DER signature too long");
        const { r: r2, s: s2 } = DER.toSig(abytes3(bytes), Fn2.BYTES + 1);
        return new Signature(r2, s2);
      }
      if (format === "recovered") {
        recid = bytes[0];
        format = "compact";
        bytes = bytes.subarray(1);
      }
      const L = lengths.signature / 2;
      const r = bytes.subarray(0, L);
      const s = bytes.subarray(L, L * 2);
      return new Signature(Fn2.fromBytes(r), Fn2.fromBytes(s), recid);
    }
    static fromHex(hex, format) {
      return this.fromBytes(hexToBytes2(hex), format);
    }
    assertRecovery() {
      const { recovery } = this;
      if (recovery == null)
        throw new Error("invalid recovery id: must be present");
      return recovery;
    }
    addRecoveryBit(recovery) {
      return new Signature(this.r, this.s, recovery);
    }
    // Unlike the top-level helper below, this method expects a digest that has
    // already been hashed to the curve's message representative.
    recoverPublicKey(messageHash) {
      const { r, s } = this;
      const recovery = this.assertRecovery();
      const radj = recovery === 2 || recovery === 3 ? r + CURVE_ORDER : r;
      if (!Fp2.isValid(radj))
        throw new Error("invalid recovery id: sig.r+curve.n != R.x");
      const x = Fp2.toBytes(radj);
      const R = Point2.fromBytes(concatBytes2(pprefix((recovery & 1) === 0), x));
      const ir = Fn2.inv(radj);
      const h = bits2int_modN(abytes3(messageHash, void 0, "msgHash"));
      const u1 = Fn2.create(-h * ir);
      const u2 = Fn2.create(s * ir);
      const Q = Point2.BASE.mulAddUnsafe(u1, R, u2);
      if (Q.is0())
        throw new Error("invalid recovery: point at infinify");
      Q.assertValidity();
      return Q;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return isBiggerThanHalfOrder(this.s);
    }
    toBytes(format = defaultSigOpts.format) {
      validateSigFormat(format);
      if (format === "der")
        return hexToBytes2(DER.hexFromSig(this));
      const { r, s } = this;
      const rb = Fn2.toBytes(r);
      const sb = Fn2.toBytes(s);
      if (format === "recovered") {
        assertRecoverableCurve();
        return concatBytes2(Uint8Array.of(this.assertRecovery()), rb, sb);
      }
      return concatBytes2(rb, sb);
    }
    toHex(format) {
      return bytesToHex2(this.toBytes(format));
    }
  }
  Object.freeze(Signature.prototype);
  Object.freeze(Signature);
  const bits2int = opts.bits2int === void 0 ? function bits2int_def(bytes) {
    if (bytes.length > 8192)
      throw new Error("input is too large");
    const num2 = bytesToNumberBE(bytes);
    const delta = bytes.length * 8 - fnBits;
    return delta > 0 ? num2 >> BigInt(delta) : num2;
  } : opts.bits2int;
  const bits2int_modN = opts.bits2int_modN === void 0 ? function bits2int_modN_def(bytes) {
    return Fn2.create(bits2int(bytes));
  } : opts.bits2int_modN;
  const ORDER_MASK = bitMask(fnBits);
  function int2octets(num2) {
    aInRange("num < 2^" + fnBits, num2, _0n5, ORDER_MASK);
    return Fn2.toBytes(num2);
  }
  function validateMsgAndHash(message, prehash) {
    abytes3(message, void 0, "message");
    return prehash ? abytes3(hash_(message), void 0, "prehashed message") : message;
  }
  function prepSig(message, secretKey, opts2) {
    const { lowS, prehash, extraEntropy } = validateSigOpts(opts2, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    const h1int = bits2int_modN(message);
    const d = Fn2.fromBytes(secretKey);
    if (!Fn2.isValidNot0(d))
      throw new Error("invalid private key");
    const seedArgs = [int2octets(d), int2octets(h1int)];
    if (extraEntropy != null && extraEntropy !== false) {
      const e = extraEntropy === true ? randomBytes5(lengths.secretKey) : extraEntropy;
      seedArgs.push(abytes3(e, void 0, "extraEntropy"));
    }
    const seed = concatBytes2(...seedArgs);
    const m = h1int;
    function k2sig(kBytes) {
      const k = bits2int(kBytes);
      if (!Fn2.isValidNot0(k))
        return;
      const q = Point2.BASE.multiply(k).toAffine();
      const r = Fn2.create(q.x);
      if (r === _0n5)
        return;
      let s;
      if (csprng !== void 0) {
        const b = bytesToNumberBE(mapHashToField(csprng(blindLength), CURVE_ORDER));
        const ibk = Fn2.inv(Fn2.mul(b, k));
        const bm = Fn2.mul(b, m);
        const bd = Fn2.mul(b, d);
        s = Fn2.create(ibk * Fn2.create(bm + bd * r));
      } else {
        const ik = invertCt(k, CURVE_ORDER);
        s = Fn2.create(ik * Fn2.create(m + r * d));
      }
      if (s === _0n5)
        return;
      let recovery = getRecoveryBit(q.x, q.y, r);
      let normS = s;
      if (lowS && isBiggerThanHalfOrder(s)) {
        normS = Fn2.neg(s);
        recovery ^= 1;
      }
      return new Signature(r, normS, hasLargeRecoveryLifts ? void 0 : recovery);
    }
    return { seed, k2sig };
  }
  function sign(message, secretKey, opts2 = {}) {
    const { seed, k2sig } = prepSig(message, secretKey, opts2);
    const drbg = createHmacDrbg(hash_.outputLen, Fn2.BYTES, hmac2);
    const sig = drbg(seed, k2sig);
    return sig.toBytes(opts2.format);
  }
  function verify(signature, message, publicKey, opts2 = {}) {
    const { lowS, prehash, format } = validateSigOpts(opts2, defaultSigOpts);
    publicKey = abytes3(publicKey, void 0, "publicKey");
    message = validateMsgAndHash(message, prehash);
    if (!isBytes3(signature)) {
      const end = signature instanceof Signature ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + end);
    }
    validateSigLength(signature, format);
    try {
      const sig = Signature.fromBytes(signature, format);
      const P = Point2.fromBytes(publicKey);
      if (P.is0())
        return false;
      if (lowS && sig.hasHighS())
        return false;
      const { r, s } = sig;
      const h = bits2int_modN(message);
      const is = Fn2.inv(s);
      const u1 = Fn2.create(h * is);
      const u2 = Fn2.create(r * is);
      const R = Point2.BASE.mulAddUnsafe(u1, P, u2);
      if (R.is0())
        return false;
      const q = R.toAffine();
      const v = Fn2.create(q.x);
      if (v !== r)
        return false;
      if (format === "recovered" && sig.recovery !== getRecoveryBit(q.x, q.y, r))
        return false;
      return true;
    } catch (e) {
      return false;
    }
  }
  function recoverPublicKey(signature, message, opts2 = {}) {
    const { prehash } = validateSigOpts(opts2, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    return Signature.fromBytes(signature, "recovered").recoverPublicKey(message).toBytes();
  }
  return Object.freeze({
    keygen,
    getPublicKey,
    getSharedSecret,
    utils,
    lengths,
    Point: Point2,
    sign,
    verify,
    recoverPublicKey,
    Signature,
    hash: hash_
  });
}

// node_modules/@noble/curves/secp256k1.js
var secp256k1_CURVE = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
};
var secp256k1_ENDO = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
};
var _2n3 = /* @__PURE__ */ BigInt(2);
function sqrtMod(y) {
  const P = secp256k1_CURVE.p;
  const _3n3 = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
  const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
  const b2 = y * y * y % P;
  const b3 = b2 * b2 * y % P;
  const b6 = pow2(b3, _3n3, P) * b3 % P;
  const b9 = pow2(b6, _3n3, P) * b3 % P;
  const b11 = pow2(b9, _2n3, P) * b2 % P;
  const b22 = pow2(b11, _11n, P) * b11 % P;
  const b44 = pow2(b22, _22n, P) * b22 % P;
  const b88 = pow2(b44, _44n, P) * b44 % P;
  const b176 = pow2(b88, _88n, P) * b88 % P;
  const b220 = pow2(b176, _44n, P) * b44 % P;
  const b223 = pow2(b220, _3n3, P) * b3 % P;
  const t1 = pow2(b223, _23n, P) * b22 % P;
  const t2 = pow2(t1, _6n, P) * b2 % P;
  const root = pow2(t2, _2n3, P);
  if (!Fpk1.eql(Fpk1.sqr(root), y))
    throw new Error("Cannot find square root");
  return root;
}
var Fpk1 = /* @__PURE__ */ Field(secp256k1_CURVE.p, { sqrt: sqrtMod });
var Pointk1 = /* @__PURE__ */ weierstrass(secp256k1_CURVE, {
  Fp: Fpk1,
  endo: secp256k1_ENDO
});
var secp256k1 = /* @__PURE__ */ ecdsa(Pointk1, sha256);

// node_modules/@noble/hashes/legacy.js
var Rho160 = /* @__PURE__ */ Uint8Array.from([
  7,
  4,
  13,
  1,
  10,
  6,
  15,
  3,
  12,
  0,
  9,
  5,
  2,
  14,
  11,
  8
]);
var Id160 = /* @__PURE__ */ (() => Uint8Array.from(new Array(16).fill(0).map((_, i) => i)))();
var Pi160 = /* @__PURE__ */ (() => Id160.map((i) => (9 * i + 5) % 16))();
var idxLR = /* @__PURE__ */ (() => {
  const L = [Id160];
  const R = [Pi160];
  const res = [L, R];
  for (let i = 0; i < 4; i++)
    for (let j of res)
      j.push(j[i].map((k) => Rho160[k]));
  return res;
})();
var idxL = /* @__PURE__ */ (() => idxLR[0])();
var idxR = /* @__PURE__ */ (() => idxLR[1])();
var shifts160 = /* @__PURE__ */ [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((i) => Uint8Array.from(i));
var shiftsL160 = /* @__PURE__ */ idxL.map((idx, i) => idx.map((j) => shifts160[i][j]));
var shiftsR160 = /* @__PURE__ */ idxR.map((idx, i) => idx.map((j) => shifts160[i][j]));
var Kl160 = /* @__PURE__ */ Uint32Array.from([
  0,
  1518500249,
  1859775393,
  2400959708,
  2840853838
]);
var Kr160 = /* @__PURE__ */ Uint32Array.from([
  1352829926,
  1548603684,
  1836072691,
  2053994217,
  0
]);
function ripemd_f(group, x, y, z) {
  if (group === 0)
    return x ^ y ^ z;
  if (group === 1)
    return x & y | ~x & z;
  if (group === 2)
    return (x | ~y) ^ z;
  if (group === 3)
    return x & z | y & ~z;
  return x ^ (y | ~z);
}
var BUF_160 = /* @__PURE__ */ new Uint32Array(16);
var _RIPEMD160 = class extends HashMD {
  h0 = 1732584193 | 0;
  h1 = 4023233417 | 0;
  h2 = 2562383102 | 0;
  h3 = 271733878 | 0;
  h4 = 3285377520 | 0;
  constructor() {
    super(64, 20, 8, true);
  }
  get() {
    const { h0, h1, h2, h3, h4 } = this;
    return [h0, h1, h2, h3, h4];
  }
  set(h0, h1, h2, h3, h4) {
    this.h0 = h0 | 0;
    this.h1 = h1 | 0;
    this.h2 = h2 | 0;
    this.h3 = h3 | 0;
    this.h4 = h4 | 0;
  }
  _cloneInto(to) {
    (to ||= new this.constructor()).set(...this.get());
    return this._cloneIntoMeta(to);
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      BUF_160[i] = view.getUint32(offset, true);
    let al = this.h0 | 0, ar = al, bl = this.h1 | 0, br = bl, cl = this.h2 | 0, cr = cl, dl = this.h3 | 0, dr = dl, el = this.h4 | 0, er = el;
    for (let group = 0; group < 5; group++) {
      const rGroup = 4 - group;
      const hbl = Kl160[group], hbr = Kr160[group];
      const rl = idxL[group], rr = idxR[group];
      const sl = shiftsL160[group], sr = shiftsR160[group];
      for (let i = 0; i < 16; i++) {
        const tl = rotl(al + ripemd_f(group, bl, cl, dl) + BUF_160[rl[i]] + hbl, sl[i]) + el | 0;
        al = el, el = dl, dl = rotl(cl, 10) | 0, cl = bl, bl = tl;
      }
      for (let i = 0; i < 16; i++) {
        const tr = rotl(ar + ripemd_f(rGroup, br, cr, dr) + BUF_160[rr[i]] + hbr, sr[i]) + er | 0;
        ar = er, er = dr, dr = rotl(cr, 10) | 0, cr = br, br = tr;
      }
    }
    this.set(this.h1 + cl + dr | 0, this.h2 + dl + er | 0, this.h3 + el + ar | 0, this.h4 + al + br | 0, this.h0 + bl + cr | 0);
  }
  roundClean() {
    clean(BUF_160);
  }
  destroy() {
    this.destroyed = true;
    clean(this.buffer);
    this.set(0, 0, 0, 0, 0);
  }
};
var ripemd160 = /* @__PURE__ */ createHasher(() => new _RIPEMD160());

// node_modules/@scure/bip32/index.js
var Point = /* @__PURE__ */ (() => secp256k1.Point)();
var Fn = /* @__PURE__ */ (() => Point.Fn)();
var base58check = /* @__PURE__ */ createBase58check(sha256);
var MASTER_SECRET = /* @__PURE__ */ (() => {
  return Uint8Array.from("Bitcoin seed".split(""), (char) => char.charCodeAt(0));
})();
var BITCOIN_VERSIONS = { private: 76066276, public: 76067358 };
var HARDENED_OFFSET = 2147483648;
var MAX_DEPTH = 255;
var hash160 = (data) => ripemd160(sha256(data));
var fromU32 = (data) => createView(data).getUint32(0, false);
var toU32 = (n3, title = "number") => {
  if (typeof n3 !== "number")
    throw new TypeError(`"${title}" expected number, got type=${typeof n3}`);
  if (!Number.isSafeInteger(n3) || n3 < 0 || n3 > 2 ** 32 - 1)
    throw new RangeError(`"${title}" expected integer in range 0..2**32-1, got ${n3}`);
  const buf = new Uint8Array(4);
  createView(buf).setUint32(0, n3, false);
  return buf;
};
var validateVersions = (versions, title = "versions") => {
  if (!(typeof versions === "object" && versions !== null))
    throw new Error("versions must be an object");
  toU32(versions.private, `${title}.private`);
  toU32(versions.public, `${title}.public`);
  return versions;
};
var HDKey = class _HDKey {
  get fingerprint() {
    if (!this._pubHash) {
      throw new Error("No publicKey set!");
    }
    return fromU32(this._pubHash);
  }
  get identifier() {
    return this._pubHash ? Uint8Array.from(this._pubHash) : void 0;
  }
  get pubKeyHash() {
    return this._pubHash ? Uint8Array.from(this._pubHash) : void 0;
  }
  get privateKey() {
    return this._privateKey ? Uint8Array.from(this._privateKey) : null;
  }
  get publicKey() {
    return this._publicKey ? Uint8Array.from(this._publicKey) : null;
  }
  get chainCode() {
    return this._chainCode ? Uint8Array.from(this._chainCode) : null;
  }
  get privateExtendedKey() {
    const priv = this._privateKey;
    if (!priv) {
      throw new Error("No private key");
    }
    return base58check.encode(this.serialize(this.versions.private, concatBytes(Uint8Array.of(0), priv)));
  }
  get publicExtendedKey() {
    if (!this._publicKey) {
      throw new Error("No public key");
    }
    return base58check.encode(this.serialize(this.versions.public, this._publicKey));
  }
  static fromMasterSeed(seed, versions = BITCOIN_VERSIONS) {
    abytes2(seed);
    versions = validateVersions(versions);
    if (8 * seed.length < 128 || 8 * seed.length > 512) {
      throw new RangeError("HDKey: seed length must be between 128 and 512 bits; 256 bits is advised, got " + seed.length);
    }
    const I = hmac(sha512, MASTER_SECRET, seed);
    const privateKey = I.slice(0, 32);
    const chainCode = I.slice(32);
    return new _HDKey({ versions, chainCode, privateKey });
  }
  static fromExtendedKey(base58key, versions = BITCOIN_VERSIONS) {
    versions = validateVersions(versions);
    const keyBuffer = base58check.decode(base58key);
    if (keyBuffer.length !== 78) {
      throw new Error(`HDKey: invalid extended key length: expected 78 bytes, got ${keyBuffer.length}`);
    }
    const keyView = createView(keyBuffer);
    const version = keyView.getUint32(0, false);
    const opt = {
      versions,
      depth: keyBuffer[4],
      parentFingerprint: keyView.getUint32(5, false),
      index: keyView.getUint32(9, false),
      chainCode: keyBuffer.slice(13, 45)
    };
    const key = keyBuffer.slice(45);
    const isPriv = key[0] === 0;
    if (version !== versions[isPriv ? "private" : "public"]) {
      throw new Error("Version mismatch");
    }
    if (isPriv) {
      return new _HDKey({ ...opt, privateKey: key.slice(1) });
    } else {
      return new _HDKey({ ...opt, publicKey: key });
    }
  }
  static fromJSON(json) {
    return _HDKey.fromExtendedKey("xpriv" in json ? json.xpriv : json.xpub);
  }
  versions;
  depth = 0;
  index = 0;
  parentFingerprint = 0;
  _chainCode = null;
  _privateKey;
  _publicKey;
  _pubHash;
  constructor(opt) {
    if (!opt || typeof opt !== "object") {
      throw new Error("HDKey.constructor must not be called directly");
    }
    const depth = opt.depth ?? 0;
    const index = opt.index ?? 0;
    const parentFingerprint = opt.parentFingerprint ?? 0;
    if (!Number.isSafeInteger(depth) || depth < 0 || depth > MAX_DEPTH) {
      throw new RangeError("HDKey: depth must be an integer in range 0..255");
    }
    toU32(index, "index");
    toU32(parentFingerprint, "parentFingerprint");
    if (depth === 0 && (index !== 0 || parentFingerprint !== 0)) {
      throw new Error("HDKey: zero depth with non-zero index/parent fingerprint");
    }
    this.versions = opt.versions ? validateVersions(opt.versions) : BITCOIN_VERSIONS;
    this.depth = depth;
    if (opt.chainCode)
      abytes2(opt.chainCode, 32);
    this._chainCode = opt.chainCode ? Uint8Array.from(opt.chainCode) : null;
    this.index = index;
    this.parentFingerprint = parentFingerprint;
    if (opt.publicKey && opt.privateKey) {
      throw new Error("HDKey: publicKey and privateKey at same time.");
    }
    if (opt.privateKey) {
      if (!secp256k1.utils.isValidSecretKey(opt.privateKey))
        throw new Error("Invalid private key");
      this._privateKey = Uint8Array.from(opt.privateKey);
      this._publicKey = secp256k1.getPublicKey(this._privateKey, true);
    } else if (opt.publicKey) {
      this._publicKey = Point.fromBytes(opt.publicKey).toBytes(true);
    } else {
      throw new Error("HDKey: no public or private key provided");
    }
    this._pubHash = hash160(this._publicKey);
  }
  derive(path7) {
    if (!/^[mM]'?/.test(path7)) {
      throw new Error('Path must start with "m" or "M"');
    }
    if (/^[mM]'?$/.test(path7)) {
      return this;
    }
    const parts = path7.replace(/^[mM]'?\//, "").split("/");
    if (parts.length > MAX_DEPTH - this.depth) {
      throw new Error("HDKey: path exceeds the serializable depth 255");
    }
    let child = this;
    for (const c of parts) {
      const m = /^(\d+)('?)$/.exec(c);
      const m1 = m && m[1];
      if (!m || m.length !== 3 || typeof m1 !== "string")
        throw new Error("invalid child index: " + c);
      let idx = +m1;
      if (!Number.isSafeInteger(idx) || idx >= HARDENED_OFFSET) {
        throw new Error("Invalid index");
      }
      if (m[2] === "'") {
        idx += HARDENED_OFFSET;
      }
      child = child.deriveChild(idx);
    }
    return child;
  }
  deriveChild(index) {
    return this._deriveChild(index);
  }
  /** Test-only implementation seam. Production callers must use deriveChild(). */
  _deriveChild(index, _I) {
    if (!this._publicKey || !this._chainCode) {
      throw new Error("No publicKey or chainCode set");
    }
    let data = toU32(index, "index");
    if (index >= HARDENED_OFFSET) {
      const priv = this._privateKey;
      if (!priv) {
        throw new Error("Could not derive hardened child key");
      }
      data = concatBytes(Uint8Array.of(0), priv, data);
    } else {
      data = concatBytes(this._publicKey, data);
    }
    const out = _I || hmac(sha512, this._chainCode, data);
    abytes2(out, 64);
    const childTweak = out.slice(0, 32);
    const chainCode = out.slice(32);
    const opt = {
      versions: this.versions,
      chainCode,
      depth: this.depth + 1,
      parentFingerprint: this.fingerprint,
      index
    };
    if (opt.depth > MAX_DEPTH) {
      throw new Error("HDKey: depth exceeds the serializable value 255");
    }
    const retry = () => {
      const maxIndex = this._privateKey ? 2 ** 32 - 1 : HARDENED_OFFSET - 1;
      if (index >= maxIndex) {
        throw new Error(`HDKey: cannot retry child derivation at index ${index}`);
      }
      return this.deriveChild(index + 1);
    };
    const ctweak = Fn.fromBytes(childTweak, true);
    if (!Fn.isValid(ctweak))
      return retry();
    if (this._privateKey) {
      const added = Fn.create(Fn.fromBytes(this._privateKey) + ctweak);
      if (!Fn.isValidNot0(added))
        return retry();
      opt.privateKey = Fn.toBytes(added);
    } else {
      const point = Point.fromBytes(this._publicKey);
      const added = ctweak === 0n ? point : point.add(Point.BASE.multiply(ctweak));
      if (added.equals(Point.ZERO))
        return retry();
      opt.publicKey = added.toBytes(true);
    }
    return new _HDKey(opt);
  }
  sign(hash) {
    if (!this._privateKey) {
      throw new Error("No privateKey set!");
    }
    abytes2(hash, 32);
    return secp256k1.sign(hash, this._privateKey, { prehash: false });
  }
  verify(hash, signature) {
    abytes2(hash, 32);
    abytes2(signature, 64);
    if (!this._publicKey) {
      throw new Error("No publicKey set!");
    }
    return secp256k1.verify(signature, hash, this._publicKey, { prehash: false });
  }
  wipePrivateData() {
    if (this._privateKey) {
      this._privateKey.fill(0);
      this._privateKey = void 0;
    }
    return this;
  }
  // TODO(v3): Make automatic JSON serialization public-only so JSON.stringify cannot expose xpriv.
  toJSON() {
    return this.toPrivateJSON();
  }
  /**
   * Explicitly exports private key material. Treat the returned value as a secret.
   */
  toPrivateJSON() {
    return {
      xpriv: this.privateExtendedKey,
      xpub: this.publicExtendedKey
    };
  }
  serialize(version, key) {
    if (!this._chainCode) {
      throw new Error("No chainCode set");
    }
    abytes2(key, 33);
    return concatBytes(toU32(version, "version"), new Uint8Array([this.depth]), toU32(this.parentFingerprint, "parentFingerprint"), toU32(this.index, "index"), this._chainCode, key);
  }
};

// node_modules/@noble/curves/abstract/edwards.js
var _0n6 = /* @__PURE__ */ BigInt(0);
var _1n5 = /* @__PURE__ */ BigInt(1);
var _2n4 = /* @__PURE__ */ BigInt(2);
var _4n4 = /* @__PURE__ */ BigInt(4);
var _8n2 = /* @__PURE__ */ BigInt(8);
function isEdValidXY(Fp2, CURVE, x, y) {
  const x2 = Fp2.sqr(x);
  const y2 = Fp2.sqr(y);
  const left = Fp2.add(Fp2.mul(CURVE.a, x2), y2);
  const right = Fp2.add(Fp2.ONE, Fp2.mul(CURVE.d, Fp2.mul(x2, y2)));
  return Fp2.eql(left, right);
}
function edwards(params, extraOpts = {}) {
  validateObject(extraOpts, {}, {}, "extraOpts");
  const opts = extraOpts;
  const validated = createCurveFields("edwards", params, opts, opts.FpFnLE);
  const { Fp: Fp2, Fn: Fn2 } = validated;
  let CURVE = validated.CURVE;
  const { h: cofactor } = CURVE;
  if (FpLegendre(Fp2, CURVE.a) !== 1)
    throw new Error("edwards: CURVE.a must be a square in Fp for complete addition formulas");
  if (FpLegendre(Fp2, CURVE.d) !== -1)
    throw new Error("edwards: CURVE.d must be a non-square in Fp for complete addition formulas");
  validateObject(opts, {}, { uvRatio: "function", randomBytes: "function" });
  const randomBytes5 = opts.randomBytes === void 0 ? randomBytes2 : opts.randomBytes;
  const MASK = _2n4 << BigInt(Fp2.BYTES * 8) - _1n5;
  function isOdd(n3) {
    if (!Fp2.isOdd)
      throw new Error("Field does not have .isOdd()");
    return Fp2.isOdd(n3);
  }
  const uvRatio2 = opts.uvRatio === void 0 ? (u, v) => {
    try {
      return { isValid: true, value: Fp2.sqrt(Fp2.div(u, v)) };
    } catch (e) {
      return { isValid: false, value: _0n6 };
    }
  } : opts.uvRatio;
  if (!isEdValidXY(Fp2, CURVE, CURVE.Gx, CURVE.Gy))
    throw new Error("bad curve params: generator point");
  const mulA = Fp2.eql(CURVE.a, Fp2.neg(Fp2.ONE)) ? (x) => Fp2.neg(x) : Fp2.eql(CURVE.a, Fp2.ONE) ? (x) => x : (x) => Fp2.mul(CURVE.a, x);
  function acoord(title, n3, banZero = false) {
    const min = banZero ? _1n5 : _0n6;
    aInRange("coordinate " + title, n3, min, MASK);
    return n3;
  }
  function aedpoint(other) {
    if (!(other instanceof Point2))
      throw new Error("EdwardsPoint expected");
  }
  class Point2 {
    static BASE = new Point2(CURVE.Gx, CURVE.Gy, Fp2.ONE, Fp2.mul(CURVE.Gx, CURVE.Gy));
    static ZERO = new Point2(Fp2.ZERO, Fp2.ONE, Fp2.ONE, Fp2.ZERO);
    static Fp = Fp2;
    static Fn = Fn2;
    X;
    Y;
    Z;
    T;
    constructor(X, Y, Z, T) {
      this.X = acoord("x", X);
      this.Y = acoord("y", Y);
      this.Z = acoord("z", Z, true);
      this.T = acoord("t", T);
      Object.freeze(this);
    }
    static CURVE() {
      return CURVE;
    }
    /**
     * Create one extended Edwards point from affine coordinates.
     * Does NOT validate that the point is on-curve or torsion-free.
     * Use `.assertValidity()` on adversarial inputs.
     */
    static fromAffine(p) {
      if (p instanceof Point2)
        throw new Error("extended point not allowed");
      const { x, y } = p || {};
      acoord("x", x);
      acoord("y", y);
      return new Point2(x, y, Fp2.ONE, Fp2.mul(x, y));
    }
    // Uses algo from RFC8032 5.1.3.
    static fromBytes(bytes, zip215 = false) {
      const len = Fp2.BYTES;
      const { a, d } = CURVE;
      bytes = copyBytes(abytes3(bytes, len, "point"));
      abool2(zip215, "zip215");
      const normed = copyBytes(bytes);
      const lastByte = bytes[len - 1];
      normed[len - 1] = lastByte & ~128;
      const y = bytesToNumberLE(normed);
      const max = zip215 ? MASK : Fp2.ORDER;
      aInRange("point.y", y, _0n6, max);
      const y2 = Fp2.sqr(y);
      const u = Fp2.sub(y2, Fp2.ONE);
      const v = Fp2.sub(Fp2.mulN(d, y2), a);
      let { isValid, value: x } = uvRatio2(u, v);
      if (!isValid)
        throw new Error("bad point: invalid y coordinate");
      const isXOdd = isOdd(x);
      const isLastByteOdd = (lastByte & 128) !== 0;
      if (!zip215 && Fp2.is0(x) && isLastByteOdd)
        throw new Error("bad point: x=0 and x_0=1");
      if (isLastByteOdd !== isXOdd)
        x = Fp2.neg(x);
      return Point2.fromAffine({ x, y });
    }
    static fromHex(hex, zip215 = false) {
      return Point2.fromBytes(hexToBytes2(hex), zip215);
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    precompute(windowSize = 6, isLazy = true) {
      wnaf.setWindowSize(this, windowSize);
      if (!isLazy)
        this.multiply(_2n4);
      return this;
    }
    // Useful in fromAffine() - not for fromBytes(), which always created valid points.
    assertValidity() {
      const p = this;
      const { a, d } = CURVE;
      if (p.is0())
        throw new Error("bad point: ZERO");
      const { X, Y, Z, T } = p;
      const X2 = Fp2.sqr(X);
      const Y2 = Fp2.sqr(Y);
      const Z2 = Fp2.sqr(Z);
      const Z4 = Fp2.sqr(Z2);
      const aX2 = Fp2.mul(X2, a);
      const left = Fp2.mul(Fp2.add(aX2, Y2), Z2);
      const right = Fp2.add(Z4, Fp2.mul(d, Fp2.mul(X2, Y2)));
      if (!Fp2.eql(left, right))
        throw new Error("bad point: equation left != right (1)");
      const XY = Fp2.mul(X, Y);
      const ZT = Fp2.mul(Z, T);
      if (!Fp2.eql(XY, ZT))
        throw new Error("bad point: equation left != right (2)");
    }
    // Compare one point to another.
    equals(other) {
      aedpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      const X1Z2 = Fp2.mul(X1, Z2);
      const X2Z1 = Fp2.mul(X2, Z1);
      const Y1Z2 = Fp2.mul(Y1, Z2);
      const Y2Z1 = Fp2.mul(Y2, Z1);
      return Fp2.eql(X1Z2, X2Z1) && Fp2.eql(Y1Z2, Y2Z1);
    }
    is0() {
      return this.equals(Point2.ZERO);
    }
    negate() {
      return new Point2(Fp2.neg(this.X), this.Y, this.Z, Fp2.neg(this.T));
    }
    // Fast algo for doubling Extended Point.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#doubling-dbl-2008-hwcd
    // Cost: 4M + 4S + 1*a + 6add + 1*2.
    double() {
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const A = Fp2.sqr(X1);
      const B2 = Fp2.sqr(Y1);
      const C = Fp2.mul(Fp2.sqr(Z1), _2n4);
      const D = mulA(A);
      const x1y1 = Fp2.addN(X1, Y1);
      const E = Fp2.sub(Fp2.subN(Fp2.sqr(x1y1), A), B2);
      const G = Fp2.addN(D, B2);
      const F = Fp2.subN(G, C);
      const H = Fp2.subN(D, B2);
      const X3 = Fp2.mul(E, F);
      const Y3 = Fp2.mul(G, H);
      const T3 = Fp2.mul(E, H);
      const Z3 = Fp2.mul(F, G);
      return new Point2(X3, Y3, Z3, T3);
    }
    // Fast algo for adding 2 Extended Points.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#addition-add-2008-hwcd
    // Cost: 9M + 1*a + 1*d + 7add.
    add(other) {
      aedpoint(other);
      const { d } = CURVE;
      const { X: X1, Y: Y1, Z: Z1, T: T1 } = this;
      const { X: X2, Y: Y2, Z: Z2, T: T2 } = other;
      const A = Fp2.mul(X1, X2);
      const B2 = Fp2.mul(Y1, Y2);
      const C = Fp2.mul(Fp2.mulN(T1, d), T2);
      const D = Fp2.mul(Z1, Z2);
      const E = Fp2.sub(Fp2.subN(Fp2.mulN(Fp2.addN(X1, Y1), Fp2.addN(X2, Y2)), A), B2);
      const F = Fp2.subN(D, C);
      const G = Fp2.addN(D, C);
      const H = Fp2.sub(B2, mulA(A));
      const X3 = Fp2.mul(E, F);
      const Y3 = Fp2.mul(G, H);
      const T3 = Fp2.mul(E, H);
      const Z3 = Fp2.mul(F, G);
      return new Point2(X3, Y3, Z3, T3);
    }
    subtract(other) {
      aedpoint(other);
      return this.add(other.negate());
    }
    // Constant-time multiplication.
    multiply(scalar) {
      if (!Fn2.isValidNot0(scalar))
        throw new RangeError("invalid scalar: expected 1 <= sc < curve.n");
      const { p, f } = wnaf.mulSecret(this, scalar, cofactor, normalize2);
      return normalize2([p, f])[0];
    }
    // Non-constant-time multiplication. Uses double-and-add algorithm.
    // It's faster, but should only be used when you don't care about
    // an exposed private key e.g. sig verification.
    // Keeps the same subgroup-scalar contract: 0 is allowed for public-scalar callers, but
    // n and larger values are rejected instead of being reduced mod n to the identity point.
    multiplyUnsafe(scalar) {
      if (!Fn2.isValid(scalar))
        throw new RangeError("invalid scalar: expected 0 <= sc < curve.n");
      if (scalar === _0n6)
        return Point2.ZERO;
      if (this.is0() || scalar === _1n5)
        return this;
      return wnaf.mulUnsafe(this, scalar, normalize2);
    }
    // Checks if point is of small order.
    // If you add something to small order point, you will have "dirty"
    // point with torsion component.
    // Clears cofactor and checks if the result is 0.
    isSmallOrder() {
      return this.clearCofactor().is0();
    }
    // Multiplies point by curve order and checks if the result is 0.
    // Returns `false` is the point is dirty.
    isTorsionFree() {
      return wnaf.mulUnsafe(this, CURVE.n).is0();
    }
    // Converts Extended point to default (x, y) coordinates.
    // Can accept precomputed Z^-1 - for example, from invertBatch.
    toAffine(invertedZ) {
      const p = this;
      let iz = invertedZ;
      if (iz != null && typeof iz !== "bigint")
        throw new TypeError('"invertedZ" expected bigint, got type=' + typeof iz);
      const { X, Y, Z } = p;
      const is0 = p.is0();
      if (iz == null)
        iz = is0 ? Fp2.create(_8n2) : Fp2.inv(Z);
      const x = Fp2.mul(X, iz);
      const y = Fp2.mul(Y, iz);
      const zz = Fp2.mul(Z, iz);
      if (is0)
        return { x: Fp2.ZERO, y: Fp2.ONE };
      if (!Fp2.eql(zz, Fp2.ONE))
        throw new Error("invZ was invalid");
      return { x, y };
    }
    clearCofactor() {
      if (cofactor === _1n5)
        return this;
      if (cofactor === _2n4)
        return this.double();
      if (cofactor === _4n4)
        return this.double().double();
      if (cofactor === _8n2)
        return this.double().double().double();
      return this.multiplyUnsafe(cofactor);
    }
    toBytes() {
      const { x, y } = this.toAffine();
      const bytes = Fp2.toBytes(y);
      bytes[bytes.length - 1] |= isOdd(x) ? 128 : 0;
      return bytes;
    }
    toHex() {
      return bytesToHex2(this.toBytes());
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const normalize2 = (points) => normalizeZ(Point2, points);
  const wnaf = new ScalarMultiplier(Point2, randomBytes5);
  if (wnaf.bits >= 6)
    Point2.BASE.precompute(6);
  Object.freeze(Point2.prototype);
  Object.freeze(Point2);
  return Point2;
}
function eddsa(Point2, cHash, eddsaOpts = {}) {
  validatePointCons(Point2);
  if (typeof cHash !== "function")
    throw new Error('"hash" function param is required');
  const hash = cHash;
  const opts = eddsaOpts;
  validateObject(opts, {}, {
    adjustScalarBytes: "function",
    randomBytes: "function",
    domain: "function",
    prehash: "function",
    zip215: "boolean",
    mapToCurve: "function",
    toMontgomery: "function",
    toMontgomerySecret: "function"
  });
  const { prehash } = opts;
  const { BASE: BASE3, Fp: Fp2, Fn: Fn2 } = Point2;
  const outputLen = hash.outputLen;
  const expectedLen = 2 * Fp2.BYTES;
  if (outputLen !== void 0) {
    asafenumber(outputLen, "hash.outputLen");
    if (outputLen !== expectedLen)
      throw new Error(`hash.outputLen must be ${expectedLen}, got ${outputLen}`);
  }
  const randomBytes5 = opts.randomBytes === void 0 ? randomBytes2 : opts.randomBytes;
  const toMontgomery2 = opts.toMontgomery;
  const toMontgomerySecret2 = opts.toMontgomerySecret;
  const adjustScalarBytes2 = opts.adjustScalarBytes === void 0 ? (bytes) => bytes : opts.adjustScalarBytes;
  const domain = opts.domain === void 0 ? (data, ctx, phflag) => {
    abool2(phflag, "phflag");
    if (ctx.length || phflag)
      throw new Error("Contexts/pre-hash are not supported");
    return data;
  } : opts.domain;
  function modN_LE(hash2) {
    return Fn2.create(bytesToNumberLE(hash2));
  }
  function getPrivateScalar(key) {
    const len = lengths.secretKey;
    abytes3(key, lengths.secretKey, "secretKey");
    const hashed = abytes3(hash(key), 2 * len, "hashedSecretKey");
    const head = adjustScalarBytes2(hashed.slice(0, len));
    const prefix = hashed.slice(len, 2 * len);
    const scalar = modN_LE(head);
    return { head, prefix, scalar };
  }
  function getExtendedPublicKey(secretKey) {
    const { head, prefix, scalar } = getPrivateScalar(secretKey);
    const point = BASE3.multiply(scalar);
    const pointBytes = point.toBytes();
    return { head, prefix, scalar, point, pointBytes };
  }
  function getPublicKey(secretKey) {
    return getExtendedPublicKey(secretKey).pointBytes;
  }
  function hashDomainToScalar(context = Uint8Array.of(), ...msgs) {
    const msg = concatBytes2(...msgs);
    return modN_LE(hash(domain(msg, abytes3(context, void 0, "context"), !!prehash)));
  }
  function sign(msg, secretKey, options = {}) {
    validateObject(options, {}, {}, "options");
    msg = copyBytes(abytes3(msg, void 0, "message"));
    if (prehash)
      msg = prehash(msg);
    const { prefix, scalar, pointBytes } = getExtendedPublicKey(secretKey);
    const r = hashDomainToScalar(options.context, prefix, msg);
    const R = BASE3.multiply(r).toBytes();
    const k = hashDomainToScalar(options.context, R, pointBytes, msg);
    const s = Fn2.create(r + k * scalar);
    if (!Fn2.isValid(s))
      throw new Error("sign failed: invalid s");
    const rs = concatBytes2(R, Fn2.toBytes(s));
    return abytes3(rs, lengths.signature, "result");
  }
  const verifyOpts = {
    zip215: opts.zip215
  };
  function verify(sig, msg, publicKey, options = verifyOpts) {
    validateObject(options);
    const { context } = options;
    const zip215 = options.zip215 === void 0 ? !!verifyOpts.zip215 : options.zip215;
    const len = lengths.signature;
    sig = abytes3(sig, len, "signature");
    msg = abytes3(msg, void 0, "message");
    publicKey = abytes3(publicKey, lengths.publicKey, "publicKey");
    if (zip215 !== void 0)
      abool2(zip215, "zip215");
    if (prehash)
      msg = prehash(msg);
    const mid = len / 2;
    const r = sig.subarray(0, mid);
    const s = bytesToNumberLE(sig.subarray(mid, len));
    let A, R, SB;
    try {
      A = Point2.fromBytes(publicKey, zip215);
      R = Point2.fromBytes(r, zip215);
      SB = BASE3.multiplyUnsafe(s);
    } catch (error) {
      return false;
    }
    if (!zip215 && A.isSmallOrder())
      return false;
    const k = hashDomainToScalar(context, r, publicKey, msg);
    const RkA = R.add(A.multiplyUnsafe(k));
    return RkA.subtract(SB).clearCofactor().is0();
  }
  const _size = Fp2.BYTES;
  const lengths = {
    secretKey: _size,
    publicKey: _size,
    signature: 2 * _size,
    seed: _size
  };
  function randomSecretKey(seed) {
    seed = seed === void 0 ? randomBytes5(lengths.seed) : seed;
    return abytes3(seed, lengths.seed, "seed");
  }
  function isValidSecretKey(key) {
    return isBytes3(key) && key.length === lengths.secretKey;
  }
  function isValidPublicKey(key, zip215) {
    try {
      return !!Point2.fromBytes(key, zip215 === void 0 ? verifyOpts.zip215 : zip215);
    } catch (error) {
      return false;
    }
  }
  const utils = {
    getExtendedPublicKey,
    randomSecretKey,
    isValidSecretKey,
    isValidPublicKey,
    /** Converts an Edwards public key to a companion Montgomery public key. */
    toMontgomery(publicKey) {
      if (toMontgomery2 === void 0)
        throw new Error("Montgomery conversion is not supported for this curve");
      return toMontgomery2(Point2.fromBytes(publicKey));
    },
    toMontgomerySecret(secretKey) {
      if (toMontgomerySecret2 === void 0)
        throw new Error("Montgomery conversion is not supported for this curve");
      return toMontgomerySecret2(secretKey);
    }
  };
  Object.freeze(lengths);
  Object.freeze(utils);
  return Object.freeze({
    keygen: createKeygen(randomSecretKey, getPublicKey),
    getPublicKey,
    sign,
    verify,
    utils,
    Point: Point2,
    lengths
  });
}

// node_modules/@noble/curves/ed25519.js
var _1n6 = /* @__PURE__ */ BigInt(1);
var _2n5 = /* @__PURE__ */ BigInt(2);
var _5n2 = /* @__PURE__ */ BigInt(5);
var _8n3 = /* @__PURE__ */ BigInt(8);
var ed25519_CURVE_p = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed");
var ed25519_CURVE = /* @__PURE__ */ (() => ({
  p: ed25519_CURVE_p,
  n: BigInt("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"),
  h: _8n3,
  a: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec"),
  d: BigInt("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3"),
  Gx: BigInt("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a"),
  Gy: BigInt("0x6666666666666666666666666666666666666666666666666666666666666658")
}))();
function ed25519_pow_2_252_3(x) {
  const _10n = BigInt(10), _20n = BigInt(20), _40n = BigInt(40), _80n = BigInt(80);
  const P = ed25519_CURVE_p;
  const x2 = x * x % P;
  const b2 = x2 * x % P;
  const b4 = pow2(b2, _2n5, P) * b2 % P;
  const b5 = pow2(b4, _1n6, P) * x % P;
  const b10 = pow2(b5, _5n2, P) * b5 % P;
  const b20 = pow2(b10, _10n, P) * b10 % P;
  const b40 = pow2(b20, _20n, P) * b20 % P;
  const b80 = pow2(b40, _40n, P) * b40 % P;
  const b160 = pow2(b80, _80n, P) * b80 % P;
  const b240 = pow2(b160, _80n, P) * b80 % P;
  const b250 = pow2(b240, _10n, P) * b10 % P;
  const pow_p_5_8 = pow2(b250, _2n5, P) * x % P;
  return { pow_p_5_8, b2 };
}
function adjustScalarBytes(bytes) {
  bytes[0] &= 248;
  bytes[31] &= 127;
  bytes[31] |= 64;
  return bytes;
}
var ED25519_SQRT_M1 = /* @__PURE__ */ BigInt("19681161376707505956807079304988542015446066515923890162744021073123829784752");
function uvRatio(u, v) {
  const P = ed25519_CURVE_p;
  const v3 = mod(v * v * v, P);
  const v7 = mod(v3 * v3 * v, P);
  const pow3 = ed25519_pow_2_252_3(u * v7).pow_p_5_8;
  let x = mod(u * v3 * pow3, P);
  const vx2 = mod(v * x * x, P);
  const root1 = x;
  const root2 = mod(x * ED25519_SQRT_M1, P);
  const useRoot1 = vx2 === u;
  const useRoot2 = vx2 === mod(-u, P);
  const noRoot = vx2 === mod(-u * ED25519_SQRT_M1, P);
  if (useRoot1)
    x = root1;
  if (useRoot2 || noRoot)
    x = root2;
  if (isNegativeLE(x, P))
    x = mod(-x, P);
  return { isValid: useRoot1 || useRoot2, value: x };
}
var ed25519_Point = /* @__PURE__ */ edwards(ed25519_CURVE, { uvRatio });
var Fp = /* @__PURE__ */ (() => ed25519_Point.Fp)();
function toMontgomery(point) {
  const { y } = point;
  return Fp.toBytes(Fp.div(_1n6 + y, _1n6 - y));
}
function toMontgomerySecret(secretKey) {
  const size = ed25519_Point.Fp.BYTES;
  abytes2(secretKey, size);
  return adjustScalarBytes(sha512(secretKey.subarray(0, size))).subarray(0, size);
}
function ed(opts) {
  return eddsa(ed25519_Point, sha512, Object.assign({ adjustScalarBytes, toMontgomery, toMontgomerySecret, zip215: true }, opts));
}
var ed25519 = /* @__PURE__ */ ed({});

// node_modules/@noble/hashes/sha3.js
var _0n7 = BigInt(0);
var _1n7 = BigInt(1);
var _2n6 = BigInt(2);
var _7n2 = BigInt(7);
var _256n = BigInt(256);
var _0x71n = BigInt(113);
var SHA3_PI = [];
var SHA3_ROTL = [];
var _SHA3_IOTA = [];
for (let round = 0, R = _1n7, x = 1, y = 0; round < 24; round++) {
  [x, y] = [y, (2 * x + 3 * y) % 5];
  SHA3_PI.push(2 * (5 * y + x));
  SHA3_ROTL.push((round + 1) * (round + 2) / 2 % 64);
  let t = _0n7;
  for (let j = 0; j < 7; j++) {
    R = (R << _1n7 ^ (R >> _7n2) * _0x71n) % _256n;
    if (R & _2n6)
      t ^= _1n7 << (_1n7 << BigInt(j)) - _1n7;
  }
  _SHA3_IOTA.push(t);
}
var IOTAS = split(_SHA3_IOTA, true);
var SHA3_IOTA_H = IOTAS[0];
var SHA3_IOTA_L = IOTAS[1];
var rotlSH = (h, l, s) => h << s | l >>> 32 - s;
var rotlSL = (h, l, s) => l << s | h >>> 32 - s;
var rotlBH = (h, l, s) => l << s - 32 | h >>> 64 - s;
var rotlBL = (h, l, s) => h << s - 32 | l >>> 64 - s;
var rotlH = (h, l, s) => s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s);
var rotlL = (h, l, s) => s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s);
var B = new Uint32Array(5 * 2);
function keccakP(s, rounds = 24) {
  if (!(s instanceof Uint32Array))
    throw new TypeError('"s" expected Uint32Array(50), got type=' + typeof s);
  if (s.length !== 50)
    throw new RangeError('"s" expected Uint32Array(50), got length=' + s.length);
  anumber2(rounds, "rounds");
  if (rounds < 1 || rounds > 24)
    throw new Error('"rounds" expected integer 1..24');
  for (let round = 24 - rounds; round < 24; round++) {
    for (let x = 0; x < 10; x++)
      B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
    for (let x = 0; x < 10; x += 2) {
      const idx1 = (x + 8) % 10;
      const idx0 = (x + 2) % 10;
      const B0 = B[idx0];
      const B1 = B[idx0 + 1];
      const Th = rotlH(B0, B1, 1) ^ B[idx1];
      const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
      for (let y = 0; y < 50; y += 10) {
        s[x + y] ^= Th;
        s[x + y + 1] ^= Tl;
      }
    }
    let curH = s[2];
    let curL = s[3];
    for (let t = 0; t < 24; t++) {
      const shift = SHA3_ROTL[t];
      const Th = rotlH(curH, curL, shift);
      const Tl = rotlL(curH, curL, shift);
      const PI = SHA3_PI[t];
      curH = s[PI];
      curL = s[PI + 1];
      s[PI] = Th;
      s[PI + 1] = Tl;
    }
    for (let y = 0; y < 50; y += 10) {
      const b0 = s[y], b1 = s[y + 1], b2 = s[y + 2], b3 = s[y + 3];
      s[y] ^= ~s[y + 2] & s[y + 4];
      s[y + 1] ^= ~s[y + 3] & s[y + 5];
      s[y + 2] ^= ~s[y + 4] & s[y + 6];
      s[y + 3] ^= ~s[y + 5] & s[y + 7];
      s[y + 4] ^= ~s[y + 6] & s[y + 8];
      s[y + 5] ^= ~s[y + 7] & s[y + 9];
      s[y + 6] ^= ~s[y + 8] & b0;
      s[y + 7] ^= ~s[y + 9] & b1;
      s[y + 8] ^= ~b0 & b2;
      s[y + 9] ^= ~b1 & b3;
    }
    s[0] ^= SHA3_IOTA_H[round];
    s[1] ^= SHA3_IOTA_L[round];
  }
  clean(B);
}
var Keccak = class _Keccak {
  state;
  pos = 0;
  posOut = 0;
  finished = false;
  state32;
  destroyed = false;
  blockLen;
  suffix;
  outputLen;
  canXOF;
  enableXOF = false;
  rounds;
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
    anumber2(blockLen, "blockLen");
    anumber2(suffix, "suffix");
    anumber2(rounds, "rounds");
    abool(enableXOF, "enableXOF");
    this.blockLen = blockLen;
    this.suffix = suffix;
    this.outputLen = outputLen;
    this.enableXOF = enableXOF;
    this.canXOF = enableXOF;
    this.rounds = rounds;
    anumber2(outputLen, "outputLen");
    if (!(0 < blockLen && blockLen < 200))
      throw new Error('"blockLen" must be 1..199');
    this.state = new Uint8Array(200);
    this.state32 = u32(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    swap32IfBE(this.state32);
    keccakP(this.state32, this.rounds);
    swap32IfBE(this.state32);
    this.posOut = 0;
    this.pos = 0;
  }
  update(data) {
    aexists(this);
    abytes2(data);
    const { blockLen, state, state32 } = this;
    const len = data.length;
    const canUseU32 = blockLen % 4 === 0 && data.byteOffset % 4 === 0;
    const blockLen32 = blockLen / 4;
    const data32 = canUseU32 && len >= blockLen ? u32(data) : void 0;
    for (let pos = 0; pos < len; ) {
      if (data32 !== void 0 && this.pos === 0 && pos % 4 === 0 && len - pos >= blockLen) {
        for (let i = 0, o = pos / 4; i < blockLen32; i++)
          state32[i] ^= data32[o + i];
        pos += blockLen;
        this.pos = blockLen;
        this.keccak();
        continue;
      }
      const take = Math.min(blockLen - this.pos, len - pos);
      for (let i = 0; i < take; i++)
        state[this.pos++] ^= data[pos++];
      if (this.pos === blockLen)
        this.keccak();
    }
    return this;
  }
  finish() {
    if (this.finished)
      return;
    this.finished = true;
    const { state, suffix, pos, blockLen } = this;
    state[pos] ^= suffix;
    if ((suffix & 128) !== 0 && pos === blockLen - 1)
      this.keccak();
    state[blockLen - 1] ^= 128;
    this.keccak();
  }
  writeInto(out) {
    aexists(this, false);
    abytes2(out);
    this.finish();
    const bufferOut = this.state;
    const { blockLen } = this;
    for (let pos = 0, len = out.length; pos < len; ) {
      if (this.posOut >= blockLen)
        this.keccak();
      const take = Math.min(blockLen - this.posOut, len - pos);
      out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
      this.posOut += take;
      pos += take;
    }
    return out;
  }
  xofInto(out) {
    if (!this.enableXOF)
      throw new Error("XOF is not enabled");
    return this.writeInto(out);
  }
  xof(bytes) {
    anumber2(bytes);
    return this.xofInto(new Uint8Array(bytes));
  }
  digestInto(out) {
    aoutput(out, this);
    if (this.finished)
      throw new Error("digest() was already called");
    this.writeInto(out.length === this.outputLen ? out : out.subarray(0, this.outputLen));
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.outputLen);
    this.digestInto(out);
    return out;
  }
  destroy() {
    this.destroyed = true;
    clean(this.state);
  }
  _cloneInto(to) {
    const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
    to ||= new _Keccak(blockLen, suffix, outputLen, enableXOF, rounds);
    to.blockLen = blockLen;
    to.state32.set(this.state32);
    to.pos = this.pos;
    to.posOut = this.posOut;
    to.finished = this.finished;
    to.rounds = rounds;
    to.suffix = suffix;
    to.outputLen = outputLen;
    to.enableXOF = enableXOF;
    to.canXOF = this.canXOF;
    to.destroyed = this.destroyed;
    return to;
  }
};
var genKeccak = (suffix, blockLen, outputLen, info = {}) => createHasher(() => new Keccak(blockLen, suffix, outputLen), info);
var keccak_256 = /* @__PURE__ */ genKeccak(1, 136, 32);

// src/live/keystore.ts
var EVM_PATH = "m/44'/60'/0'/0/0";
var SOLANA_PATH = [44, 501, 0, 0];
var SCRYPT = { N: 2 ** 16, r: 8, p: 1 };
var MIN_PASSWORD = 10;
var files = (dir) => ({ secret: path.join(dir, "wallet.enc"), pub: path.join(dir, "wallet.json") });
function checksumAddress(hexNo0x) {
  const hash = Buffer.from(keccak_256(new TextEncoder().encode(hexNo0x))).toString("hex");
  return "0x" + [...hexNo0x].map((c, i) => parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c).join("");
}
function evmAddressOf(privateKey) {
  const pub = secp256k1.getPublicKey(privateKey, false).slice(1);
  return checksumAddress(Buffer.from(keccak_256(pub).slice(-20)).toString("hex"));
}
function slip10Ed25519(seed, pathIdx) {
  let I = hmac(sha512, new TextEncoder().encode("ed25519 seed"), seed);
  let key = I.slice(0, 32);
  let chain2 = I.slice(32);
  for (const i of pathIdx) {
    const data = new Uint8Array(37);
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, (i | 2147483648) >>> 0);
    I = hmac(sha512, chain2, data);
    key = I.slice(0, 32);
    chain2 = I.slice(32);
  }
  return key;
}
function deriveAccounts(mnemonic) {
  if (!validateMnemonic(mnemonic, wordlist)) throw new Error("Frase de recuperaci\xF3n no v\xE1lida");
  const seed = mnemonicToSeedSync(mnemonic);
  const evmKey = HDKey.fromMasterSeed(seed).derive(EVM_PATH).privateKey;
  if (!evmKey) throw new Error("No se pudo derivar la clave EVM");
  const solPriv = slip10Ed25519(seed, SOLANA_PATH);
  const solPub = ed25519.getPublicKey(solPriv);
  const secretKey = new Uint8Array(64);
  secretKey.set(solPriv);
  secretKey.set(solPub, 32);
  return {
    evm: { address: evmAddressOf(evmKey), privateKey: evmKey },
    solana: { address: base58.encode(solPub), secretKey }
  };
}
var kdf = (password, salt, p = SCRYPT) => scryptSync(password.normalize("NFKC"), salt, 32, { N: p.N, r: p.r, p: p.p, maxmem: 256 * 1024 * 1024 });
function walletExists(dir) {
  return existsSync(files(dir).secret);
}
function readWalletPublic(dir) {
  const f = files(dir).pub;
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}
function createWallet(dir, password) {
  if (password.length < MIN_PASSWORD) throw new Error(`La contrase\xF1a debe tener al menos ${MIN_PASSWORD} caracteres`);
  if (walletExists(dir)) throw new Error("Ya existe una cartera: no se sobrescribe");
  mkdirSync(dir, { recursive: true });
  const mnemonic = generateMnemonic(wordlist, 128);
  const accounts = deriveAccounts(mnemonic);
  const salt = randomBytes3(16);
  const iv = randomBytes3(12);
  const cipher = createCipheriv("aes-256-gcm", kdf(password, salt), iv);
  const data = Buffer.concat([cipher.update(mnemonic, "utf8"), cipher.final()]);
  const file = {
    version: 1,
    kdf: { name: "scrypt", ...SCRYPT, salt: salt.toString("base64") },
    cipher: { name: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") },
    data: data.toString("base64")
  };
  const pub = { version: 1, createdAt: (/* @__PURE__ */ new Date()).toISOString(), evm: accounts.evm.address, solana: accounts.solana.address };
  const { secret, pub: pubFile } = files(dir);
  writeFileSync(secret, JSON.stringify(file), { mode: 384, flag: "wx" });
  writeFileSync(pubFile, JSON.stringify(pub, null, 2), { mode: 384 });
  return { mnemonic, pub };
}
function unlockWallet(dir, password) {
  const { secret } = files(dir);
  if (!existsSync(secret)) throw new Error("No hay ninguna cartera creada");
  const f = JSON.parse(readFileSync(secret, "utf8"));
  const decipher = createDecipheriv("aes-256-gcm", kdf(password, Buffer.from(f.kdf.salt, "base64"), f.kdf), Buffer.from(f.cipher.iv, "base64"));
  decipher.setAuthTag(Buffer.from(f.cipher.tag, "base64"));
  let mnemonic;
  try {
    mnemonic = Buffer.concat([decipher.update(Buffer.from(f.data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Contrase\xF1a incorrecta");
  }
  const accounts = deriveAccounts(mnemonic);
  const pub = readWalletPublic(dir);
  if (pub && (pub.evm !== accounts.evm.address || pub.solana !== accounts.solana.address)) {
    throw new Error("Las direcciones guardadas no coinciden con la cartera cifrada");
  }
  return accounts;
}

// src/db.ts
import { mkdirSync as mkdirSync3 } from "node:fs";
import path5 from "node:path";
import { DatabaseSync } from "node:sqlite";

// src/config.ts
var import_dotenv = __toESM(require_dist(), 1);
import path3 from "node:path";

// src/paths.ts
import os from "node:os";
import path2 from "node:path";
import { fileURLToPath } from "node:url";
var BUNDLED = true;
var here = path2.dirname(fileURLToPath(import.meta.url));
var projectRoot = path2.resolve(here, "..");
var usable = (dir) => dir && !dir.includes("${") ? path2.resolve(dir) : void 0;
function resolveDataDir() {
  return usable(process.env.DATA_DIR) ?? (BUNDLED ? path2.join(os.homedir(), ".cryptoagent") : path2.join(projectRoot, "data"));
}

// src/config.ts
import_dotenv.default.config({ path: path3.join(projectRoot, ".env"), quiet: true });
function num(name, fallback) {
  const raw = process.env[name];
  if (raw === void 0 || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} no es un n\xFAmero v\xE1lido: ${raw}`);
  return value;
}
var config = {
  model: process.env.MODEL || "claude-opus-5",
  effort: process.env.EFFORT || "high",
  initialUsd: num("INITIAL_USD", 1e3),
  solanaTxFeeSol: num("SOLANA_TX_FEE_SOL", 1e-4),
  binanceTakerFee: num("BINANCE_TAKER_FEE", 1e-3),
  // Comisión real de Binance por retirar USDC por la red Solana (septiembre de 2026).
  binanceUsdcWithdrawFee: num("BINANCE_USDC_WITHDRAW_FEE", 0.3),
  maxStepsPerSession: num("MAX_STEPS_PER_SESSION", 80),
  loopPauseMinutes: num("LOOP_PAUSE_MINUTES", 30),
  watchIntervalSeconds: num("WATCH_INTERVAL_SECONDS", 60),
  browserHeadful: process.env.BROWSER_HEADFUL === "true",
  // DATA_DIR permite usar otra base de datos (p. ej. para pruebas) sin tocar la simulación principal.
  dataDir: resolveDataDir()
};

// src/migrations.ts
import { mkdirSync as mkdirSync2, readdirSync, rmSync } from "node:fs";
import path4 from "node:path";

// src/sim/text.ts
var STOPWORDS = new Set(
  "de la el en y a los las del que un una por con para se al lo como mas pero sus le ya o este esta si porque muy sin sobre tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes algunos que unos yo otro otras otra el tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros es son fue ser han hace hacer cuando no su sus mas menos entre tras".split(" ")
);
function fingerprint(text) {
  const words = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return [...new Set(words)].sort().join(" ");
}
function lessonRefs(text) {
  const ids = /* @__PURE__ */ new Set();
  for (const m of text.matchAll(/lecci[oó]n(?:es)?\s*#?\s*(\d+(?:\s*(?:,|y|e|\/)\s*#?\d+)*)/gi)) {
    for (const n3 of m[1].matchAll(/\d+/g)) ids.add(Number(n3[0]));
  }
  return [...ids];
}

// src/migrations.ts
var MIGRATIONS = [
  {
    version: 1,
    description: "Cupos de peticiones por servicio (APIs con l\xEDmite por ventana de tiempo)",
    up: (db2) => db2.exec("CREATE TABLE IF NOT EXISTS http_budget (host TEXT PRIMARY KEY, window_start INTEGER NOT NULL, used INTEGER NOT NULL)")
  },
  {
    version: 2,
    description: "Memoria de tres tipos (howtos, creencias, retrospectivas) escrita por el agente revisor",
    up: memoryV2
  },
  {
    version: 3,
    description: "Cadenas EVM (Base, BNB Chain): datos de tokens, approvals, y reparto y referencia de cada misi\xF3n",
    up: (db2) => db2.exec(`
        -- S\xEDmbolo y decimales de los tokens EVM (no cambian: se leen una vez por RPC).
        CREATE TABLE token_meta (chain TEXT NOT NULL, address TEXT NOT NULL, symbol TEXT NOT NULL, decimals INTEGER NOT NULL, PRIMARY KEY (chain, address));
        -- Tokens que el monedero EVM de cada misi\xF3n ya ha aprobado para vender (la primera venta cuesta un approve).
        CREATE TABLE evm_approvals (mission_id INTEGER NOT NULL, chain TEXT NOT NULL, token TEXT NOT NULL, approved_at TEXT NOT NULL, PRIMARY KEY (mission_id, chain, token));
        -- Reparto inicial del capital por cadena o exchange (JSON de porcentajes) y cartera inicial para la referencia "sin operar".
        ALTER TABLE missions ADD COLUMN allocation TEXT;
        ALTER TABLE missions ADD COLUMN benchmark TEXT;
      `)
  },
  {
    version: 4,
    description: "Transferencias con tiempo de llegada: dep\xF3sitos y retiradas de Binance y puentes entre cadenas",
    up: (db2) => db2.exec(`
        -- El dinero sale al momento y llega en arrives_at. status: 'pending' | 'settling' | 'settled'.
        -- kind: 'cex_deposit' | 'cex_withdraw' | 'bridge'. carry: coste de la posici\xF3n que viaja con el activo.
        CREATE TABLE transfers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mission_id INTEGER NOT NULL,
          session_id INTEGER,
          created_at TEXT NOT NULL,
          arrives_at TEXT NOT NULL,
          settled_at TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          kind TEXT NOT NULL,
          from_venue TEXT NOT NULL,
          to_venue TEXT NOT NULL,
          provider TEXT NOT NULL,
          asset_out TEXT NOT NULL,
          symbol_out TEXT NOT NULL,
          amount_out REAL NOT NULL,
          asset_in TEXT NOT NULL,
          symbol_in TEXT NOT NULL,
          decimals_in INTEGER NOT NULL,
          amount_in REAL NOT NULL,
          value_usd REAL,
          costs TEXT NOT NULL,
          carry TEXT
        );
        CREATE INDEX transfers_pending ON transfers (status, arrives_at);
      `)
  },
  {
    version: 5,
    description: "El reloj de la misi\xF3n arranca cuando el agente empieza a trabajar",
    // Las misiones que ya existían cuentan como empezadas al crearse.
    up: (db2) => db2.exec("ALTER TABLE missions ADD COLUMN started_at TEXT; UPDATE missions SET started_at = created_at;")
  }
];
function memoryV2(db2) {
  db2.exec(`
    CREATE TABLE howtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      scope TEXT NOT NULL,            -- cadena o exchange al que se aplica, o 'any'
      topic TEXT NOT NULL,
      title TEXT NOT NULL,
      steps TEXT NOT NULL,
      source_mission_id INTEGER,
      fingerprint TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'obsolete'
      superseded_by INTEGER,
      from_belief_id INTEGER
    );
    CREATE TABLE beliefs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source_mission_id INTEGER,
      statement TEXT NOT NULL,
      applies_to TEXT NOT NULL,
      expectation TEXT,               -- con condici\xF3n: 'positive' (tiende a ganar) | 'negative' (tiende a perder)
      condition TEXT,                 -- JSON: {"all":[{"f":"ageMinutes","op":"<","v":30}]}
      fingerprint TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'retired' | 'converted'
      status_reason TEXT,
      origin TEXT NOT NULL DEFAULT 'reviewer', -- 'reviewer' | 'migrated'
      legacy_evidence TEXT
    );
    CREATE TABLE mission_reviews (
      mission_id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'reviewer', -- 'reviewer' | 'legacy'
      what_was_tried TEXT NOT NULL,
      what_happened TEXT NOT NULL,
      surprises TEXT,
      next_time TEXT NOT NULL
    );
    -- Revisiones a mitad de misi\xF3n: marcan hasta d\xF3nde ha revisado el revisor.
    CREATE TABLE review_checkpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      mission_id INTEGER NOT NULL,
      summary TEXT NOT NULL
    );
    -- Lo que el revisor quiere que el agente tenga presente en una misi\xF3n. seen_at: cu\xE1ndo lo recibi\xF3 el agente.
    CREATE TABLE briefings (
      mission_id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      text TEXT NOT NULL,
      seen_at TEXT
    );
    -- Observaciones del agente que opera para el revisor, que decide si pasan a la memoria.
    CREATE TABLE observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      mission_id INTEGER,
      session_id INTEGER,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'used' | 'dismissed'
      resolved_at TEXT,
      resolution TEXT
    );
    -- Errores de las herramientas, capturados por el simulador.
    CREATE TABLE tool_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      mission_id INTEGER,
      session_id INTEGER,
      tool TEXT NOT NULL,
      venue TEXT,
      error_class TEXT NOT NULL,
      message TEXT NOT NULL,
      input TEXT,
      howto_id INTEGER
    );
    CREATE INDEX tool_errors_class ON tool_errors (error_class, ts);
    -- Qu\xE9 APIs responden: lo mide http_get en cada llamada del agente.
    CREATE TABLE api_observations (
      host TEXT NOT NULL,
      path TEXT NOT NULL,
      ok INTEGER NOT NULL DEFAULT 0,
      fail INTEGER NOT NULL DEFAULT 0,
      last_status INTEGER,
      last_ok_at TEXT,
      last_fail_at TEXT,
      PRIMARY KEY (host, path)
    );
    -- Capacidades que el agente echa en falta (una cuenta, una herramienta, otro mercado\u2026), para que el
    -- usuario decida si se las da. Las peticiones parecidas se agrupan y se cuentan.
    CREATE TABLE capability_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source TEXT NOT NULL,             -- 'trader' | 'reviewer'
      category TEXT NOT NULL,
      capability TEXT NOT NULL,
      why TEXT NOT NULL,
      plan TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      times_requested INTEGER NOT NULL DEFAULT 1,
      missions TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'accepted' | 'rejected' | 'done'
      response TEXT
    );
    ALTER TABLE positions ADD COLUMN beliefs_applied TEXT;
  `);
  const lessons = db2.prepare("SELECT id, created_at, mission_id, text, applies_to, evidence, confidence FROM lessons ORDER BY id").all();
  const insertBelief = db2.prepare(
    `INSERT INTO beliefs (id, created_at, updated_at, source_mission_id, statement, applies_to, fingerprint, origin, legacy_evidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'migrated', ?)`
  );
  for (const l of lessons) {
    const evidence = [l.evidence, l.confidence ? `(confianza que declar\xF3 el agente: ${l.confidence})` : null].filter(Boolean).join(" ");
    insertBelief.run(l.id, l.created_at, l.created_at, l.mission_id, l.text, l.applies_to ?? "(sin especificar)", fingerprint(l.text), evidence || null);
  }
  const reviewed = db2.prepare("SELECT id, reviewed_at FROM missions WHERE reviewed_at IS NOT NULL").all();
  const insertReview = db2.prepare(
    "INSERT INTO mission_reviews (mission_id, created_at, origin, what_was_tried, what_happened, next_time) VALUES (?, ?, 'legacy', ?, ?, ?)"
  );
  for (const m of reviewed) {
    const ids = lessons.filter((l) => l.mission_id === m.id).map((l) => `#${l.id}`);
    const note = ids.length ? `Revisada antes de existir el revisor: lo aprendido est\xE1 en las creencias ${ids.join(", ")}.` : "Revisada antes de existir el revisor, sin lecciones.";
    insertReview.run(m.id, m.reviewed_at, note, note, ids.length ? `Ver las creencias ${ids.join(", ")}.` : "-");
  }
  const known = new Set(lessons.map((l) => l.id));
  const positions = db2.prepare("SELECT id, lessons_applied FROM positions WHERE lessons_applied IS NOT NULL").all();
  const setApplied = db2.prepare("UPDATE positions SET beliefs_applied = ? WHERE id = ?");
  for (const p of positions) {
    const ids = lessonRefs(p.lessons_applied).filter((id) => known.has(id));
    if (ids.length) setApplied.run(JSON.stringify(ids), p.id);
  }
}
var MAX_BACKUPS = 10;
var schemaVersion = (db2) => db2.prepare("PRAGMA user_version").get().user_version;
function hasUserData(db2) {
  return Boolean(db2.prepare("SELECT 1 FROM missions LIMIT 1").get());
}
function backup(db2, dataDir, from) {
  const dir = path4.join(dataDir, "backups");
  mkdirSync2(dir, { recursive: true });
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const file = path4.join(dir, `sim-v${from}-${stamp}-${process.pid}.db`);
  db2.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const old = readdirSync(dir).filter((f) => f.startsWith("sim-v") && f.endsWith(".db")).sort();
  for (const f of old.slice(0, Math.max(0, old.length - MAX_BACKUPS))) rmSync(path4.join(dir, f), { force: true });
  return file;
}
function runMigrations(db2, dataDir, migrations = MIGRATIONS) {
  const pending = migrations.filter((m) => m.version > schemaVersion(db2)).sort((a, b) => a.version - b.version);
  if (!pending.length) return [];
  if (hasUserData(db2)) backup(db2, dataDir, schemaVersion(db2));
  const applied = [];
  for (const m of pending) {
    db2.exec("BEGIN IMMEDIATE");
    try {
      if (schemaVersion(db2) >= m.version) {
        db2.exec("COMMIT");
        continue;
      }
      m.up(db2);
      db2.exec(`PRAGMA user_version = ${m.version}`);
      db2.exec("COMMIT");
      applied.push(m.version);
    } catch (err) {
      db2.exec("ROLLBACK");
      throw new Error(`Fall\xF3 la migraci\xF3n ${m.version} (${m.description}): ${err.message}`);
    }
  }
  return applied;
}

// src/db.ts
mkdirSync3(config.dataDir, { recursive: true });
var db = new DatabaseSync(path5.join(config.dataDir, "sim.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 10000;");
db.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  -- Cartera de cada misi\xF3n. venue: 'solana' (asset = mint) | 'binance' (asset = ticker, p.ej. 'USDT')
  CREATE TABLE IF NOT EXISTS holdings (
    mission_id INTEGER NOT NULL,
    venue TEXT NOT NULL,
    asset TEXT NOT NULL,
    symbol TEXT NOT NULL,
    decimals INTEGER NOT NULL,
    amount REAL NOT NULL,
    PRIMARY KEY (mission_id, venue, asset)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    final_text TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0
  );
  -- kind: 'swap' | 'cex_order' | 'transfer' | 'hypothetical' | 'rejected'
  CREATE TABLE IF NOT EXISTS journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    session_id INTEGER,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    reasoning TEXT,
    details TEXT
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    session_id INTEGER,
    text TEXT NOT NULL
  );
  -- \xD3rdenes condicionales: cuando el precio cruza el disparador se ejecuta 'action' a mercado.
  -- status: 'open' | 'executing' | 'filled' | 'failed' | 'cancelled' | 'expired'
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    session_id INTEGER,
    venue TEXT NOT NULL,
    trigger_asset TEXT NOT NULL,
    trigger_label TEXT NOT NULL,
    condition TEXT NOT NULL,
    trigger_price REAL NOT NULL,
    action TEXT NOT NULL,
    reasoning TEXT,
    expires_at TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    closed_at TEXT,
    result TEXT
  );
  -- status: 'active' | 'succeeded' (objetivo alcanzado) | 'expired' (se acab\xF3 el tiempo) | 'cancelled'
  CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    initial_usd REAL NOT NULL,
    target_usd REAL NOT NULL,
    deadline TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    ended_at TEXT,
    final_usd REAL
  );
  -- Actividad del agente para el panel: registro de trabajo ('thought', v\xEDa log_progress) y, en el runner por API,
  -- tambi\xE9n sus textos, razonamiento resumido y llamadas a herramientas.
  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    session_id INTEGER,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT
  );
  -- Memoria a largo plazo del agente: lecciones que sobreviven entre misiones.
  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    mission_id INTEGER,
    text TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS snapshots (
    ts TEXT NOT NULL,
    total_usd REAL NOT NULL,
    benchmark_usd REAL NOT NULL,
    details TEXT
  );
`);
db.exec(`
  -- Posiciones: cada token comprado en una misi\xF3n, con los datos del token al entrar,
  -- la investigaci\xF3n hecha antes y el resultado real al salir. Lo calcula el simulador.
  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id INTEGER,
    venue TEXT NOT NULL,
    asset TEXT NOT NULL,
    symbol TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    qty_open REAL NOT NULL,
    cost_open_usd REAL NOT NULL,
    realized_cost_usd REAL NOT NULL DEFAULT 0,
    realized_proceeds_usd REAL NOT NULL DEFAULT 0,
    entry_features TEXT,
    research TEXT,
    thesis TEXT,
    lessons_applied TEXT,
    exit_reason TEXT
  );
  -- Llamadas a herramientas de investigaci\xF3n, para saber cu\xE1nto investig\xF3 antes de cada operaci\xF3n.
  CREATE TABLE IF NOT EXISTS research_log (
    ts TEXT NOT NULL,
    mission_id INTEGER,
    tool TEXT NOT NULL,
    target TEXT
  );
`);
function addColumns(table, columns) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  for (const [name, type] of Object.entries(columns)) {
    if (!existing.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}
addColumns("missions", {
  instructions: "TEXT",
  reviewed_at: "TEXT",
  benchmark_sol_price: "REAL"
});
addColumns("lessons", { applies_to: "TEXT", evidence: "TEXT", confidence: "TEXT" });
for (const table of ["journal", "activity", "orders", "notes", "snapshots", "sessions"]) addColumns(table, { mission_id: "INTEGER" });
{
  const holdingCols = db.prepare("PRAGMA table_info(holdings)").all().map((c) => c.name);
  if (!holdingCols.includes("mission_id")) {
    db.exec(`
      BEGIN;
      CREATE TABLE holdings_new (
        mission_id INTEGER NOT NULL, venue TEXT NOT NULL, asset TEXT NOT NULL, symbol TEXT NOT NULL,
        decimals INTEGER NOT NULL, amount REAL NOT NULL, PRIMARY KEY (mission_id, venue, asset)
      );
      INSERT INTO holdings_new SELECT COALESCE((SELECT MAX(id) FROM missions), 0), venue, asset, symbol, decimals, amount FROM holdings;
      DROP TABLE holdings;
      ALTER TABLE holdings_new RENAME TO holdings;
      COMMIT;
    `);
  }
  const done = db.prepare("SELECT value FROM meta WHERE key = 'migration_mission_ids'").get();
  if (!done) {
    const byTime = (table, tsCol) => db.exec(`UPDATE ${table} SET mission_id = (
        SELECT m.id FROM missions m WHERE m.created_at <= ${table}.${tsCol} ORDER BY m.created_at DESC LIMIT 1
      ) WHERE mission_id IS NULL`);
    byTime("journal", "ts");
    byTime("activity", "ts");
    byTime("orders", "created_at");
    byTime("notes", "ts");
    byTime("snapshots", "ts");
    byTime("sessions", "started_at");
    const legacyBench = db.prepare("SELECT value FROM meta WHERE key = 'benchmark_sol_price'").get()?.value;
    if (legacyBench) {
      db.prepare("UPDATE missions SET benchmark_sol_price = ? WHERE benchmark_sol_price IS NULL AND id = (SELECT MAX(id) FROM missions)").run(Number(legacyBench));
    }
    db.prepare("INSERT INTO meta (key, value) VALUES ('migration_mission_ids', '1')").run();
  }
}
runMigrations(db, config.dataDir);
function getMeta(key) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row?.value;
}
function setMeta(key, value) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
var CODE_VERSION = "0.15.0";
var semver = (v) => v.split(".").map((n3) => Number.parseInt(n3, 10) || 0);
var newer = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};
if (CODE_VERSION) {
  const stored = getMeta("code_version");
  if (!stored || newer(CODE_VERSION, stored)) setMeta("code_version", CODE_VERSION);
}

// src/market/http.ts
var DEFAULT_TTL_MS = 5e3;
var MAX_PARALLEL_PER_HOST = 6;
var MAX_RETRIES = 5;
var MIN_INTERVAL_MS = {
  "lite-api.jup.ag": 1100,
  // KyberSwap admite unas 30 peticiones cada 10 s.
  "aggregator-api.kyberswap.com": 350,
  // GoPlus no publica su límite: se va despacio (sus respuestas se guardan en caché más tiempo).
  "api.gopluslabs.io": 2e3,
  // Binance limita por "peso" (6000 por minuto e IP); si se pasa, bloquea la IP (HTTP 418).
  "api.binance.com": 100
};
var DEFAULT_BAN_MS = 2 * 6e4;
var COOLDOWN_MS = 6e3;
db.exec("CREATE TABLE IF NOT EXISTS http_pacing (host TEXT PRIMARY KEY, next_at INTEGER NOT NULL)");
var reserveStmt = db.prepare(
  `INSERT INTO http_pacing (host, next_at) VALUES (?, ?) ON CONFLICT(host) DO UPDATE SET next_at = max(next_at, ?) + ?
   RETURNING next_at`
);
var cooldownStmt = db.prepare(
  "INSERT INTO http_pacing (host, next_at) VALUES (?, ?) ON CONFLICT(host) DO UPDATE SET next_at = max(next_at, excluded.next_at)"
);
db.exec("CREATE TABLE IF NOT EXISTS http_blocked (host TEXT PRIMARY KEY, until INTEGER NOT NULL)");
var blockedStmt = db.prepare("SELECT until FROM http_blocked WHERE host = ?");
var blockStmt = db.prepare(
  "INSERT INTO http_blocked (host, until) VALUES (?, ?) ON CONFLICT(host) DO UPDATE SET until = max(until, excluded.until)"
);
function banUntil(res, body) {
  const stated = Number(body.match(/banned until (\d{12,})/)?.[1]);
  if (Number.isFinite(stated) && stated > Date.now()) return stated;
  const retryAfter = Number(res.headers.get("retry-after"));
  return Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1e3 : DEFAULT_BAN_MS);
}
async function pace(host) {
  const interval = MIN_INTERVAL_MS[host];
  if (!interval) return;
  const nowMs = Date.now();
  const { next_at } = reserveStmt.get(host, nowMs + interval, nowMs, interval);
  const slot = next_at - interval;
  if (slot > nowMs) await sleep(slot - nowMs);
}
var MAX_CACHE_ENTRIES = 2e3;
var cache = /* @__PURE__ */ new Map();
var active = /* @__PURE__ */ new Map();
var waiting = /* @__PURE__ */ new Map();
async function acquire(host) {
  if ((active.get(host) ?? 0) >= MAX_PARALLEL_PER_HOST) {
    await new Promise((resolve) => {
      const queue = waiting.get(host) ?? [];
      queue.push(resolve);
      waiting.set(host, queue);
    });
  }
  active.set(host, (active.get(host) ?? 0) + 1);
}
function release(host) {
  active.set(host, (active.get(host) ?? 1) - 1);
  waiting.get(host)?.shift()?.();
}
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var fetchImpl = (...args) => fetch(...args);
async function request(url, opts) {
  const host = new URL(url).host;
  for (let attempt2 = 0; ; attempt2++) {
    const blocked = blockedStmt.get(host)?.until ?? 0;
    if (blocked > Date.now()) {
      const hora = new Date(blocked).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      throw new Error(`${host} ha bloqueado temporalmente esta IP por exceso de peticiones (hasta las ${hora}); no se le llama hasta entonces`);
    }
    await pace(host);
    await acquire(host);
    let res;
    let body;
    try {
      res = await fetchImpl(url, {
        method: opts.method ?? "GET",
        signal: AbortSignal.timeout(opts.timeoutMs),
        headers: {
          accept: "application/json",
          "user-agent": "Mozilla/5.0",
          ...opts.body !== void 0 ? { "content-type": "application/json" } : {},
          ...opts.headers
        },
        body: opts.body !== void 0 ? JSON.stringify(opts.body) : void 0
      });
      body = await res.text();
    } finally {
      release(host);
    }
    if (res.status === 418) {
      blockStmt.run(host, banUntil(res, body));
      return { status: res.status, body };
    }
    if ((res.status === 429 || res.status === 503) && attempt2 < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 15) * 1e3 : COOLDOWN_MS;
      if (MIN_INTERVAL_MS[host]) cooldownStmt.run(host, Date.now() + wait);
      else await sleep(wait);
      continue;
    }
    return { status: res.status, body };
  }
}
function fetchText(url, opts = {}) {
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const key = opts.body !== void 0 || opts.method === "POST" ? `${opts.method ?? "GET"} ${url} ${JSON.stringify(opts.body ?? null)}` : url;
  const nowMs = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > nowMs) return hit.value;
  const value = request(url, { ...opts, timeoutMs: opts.timeoutMs ?? 15e3 });
  cache.set(key, { expires: nowMs + ttl, value });
  value.then(
    (r) => {
      if (r.status < 200 || r.status >= 300) cache.delete(key);
    },
    () => cache.delete(key)
  );
  if (cache.size > MAX_CACHE_ENTRIES) {
    for (const [k, v] of cache) if (v.expires <= nowMs) cache.delete(k);
  }
  return value;
}
function isNoRouteError(err) {
  const msg = String(err?.message ?? err);
  if (/HTTP (408|429|5\d\d)|timeout|timed out|aborted|fetch failed|ECONN|ENOTFOUND/i.test(msg)) return false;
  return /HTTP 40[04]|COULD_NOT_FIND|NO_ROUTE|No routes|not tradable|TOKEN_NOT_TRADABLE/i.test(msg);
}
async function fetchJson(url, a = {}, ttlMs) {
  const opts = typeof a === "number" ? { timeoutMs: a, ttlMs } : a;
  const { status, body } = await fetchText(url, opts);
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status} en ${url}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}
var budgetStmt = db.prepare(
  `INSERT INTO http_budget (host, window_start, used) VALUES (?, ?, 1)
   ON CONFLICT(host) DO UPDATE SET
     window_start = CASE WHEN window_start + ? <= ? THEN excluded.window_start ELSE window_start END,
     used = CASE WHEN window_start + ? <= ? THEN 1 ELSE used + 1 END
   RETURNING used`
);

// src/market/jupiter.ts
var BASE = "https://lite-api.jup.ag";
var SOL_MINT = "So11111111111111111111111111111111111111112";
var USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
var USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
var ALIASES = { SOL: SOL_MINT, USDC: USDC_MINT, USDT: USDT_MINT };
function resolveMint(mintOrAlias) {
  return ALIASES[mintOrAlias.toUpperCase()] ?? mintOrAlias;
}
var tokenCache = /* @__PURE__ */ new Map();
async function getTokenInfo(mint) {
  const cached = tokenCache.get(mint);
  if (cached) return cached;
  const results = await fetchJson(`${BASE}/tokens/v2/search?query=${encodeURIComponent(mint)}`, 15e3, 3e4);
  const hit = results.find((t) => t.id === mint);
  if (!hit) throw new Error(`Token no encontrado en Solana: ${mint}`);
  const info = {
    mint,
    symbol: String(hit.symbol ?? "?"),
    name: String(hit.name ?? ""),
    decimals: Number(hit.decimals),
    usdPrice: typeof hit.usdPrice === "number" ? hit.usdPrice : null
  };
  tokenCache.set(mint, info);
  return info;
}
async function getQuote(inputMint, outputMint, amountBase, slippageBps, ttlMs = 2e3) {
  const url = `${BASE}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountBase.toString()}&slippageBps=${slippageBps}`;
  const quote2 = await fetchJson(url, 15e3, ttlMs);
  if (quote2.error) throw new Error(`Jupiter: ${quote2.error}`);
  return quote2;
}
function toBaseUnits(amount, decimals) {
  const [int, frac = ""] = amount.toFixed(decimals).split(".");
  return BigInt(int + frac.padEnd(decimals, "0"));
}
function fromBaseUnits(base2, decimals) {
  return Number(BigInt(base2)) / 10 ** decimals;
}

// src/market/evm.ts
var NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
var EVM_CHAINS = {
  base: { chainId: 8453, rpc: "https://mainnet.base.org", kyber: "base", dexscreener: "base", gecko: "base" },
  bsc: { chainId: 56, rpc: "https://bsc-dataseed.binance.org", kyber: "bsc", dexscreener: "bsc", gecko: "bsc" }
};
var isAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(s);
async function rpcBatch(chain2, calls) {
  const body = calls.map((c, i) => ({ jsonrpc: "2.0", id: i + 1, ...c }));
  const res = await fetchJson(EVM_CHAINS[chain2].rpc, {
    method: "POST",
    body,
    ttlMs: 1e4
  });
  const byId = new Map(res.map((r) => [r.id, r]));
  return body.map((b) => {
    const r = byId.get(b.id);
    if (!r || r.error) throw new Error(`RPC de ${chain2}: ${r?.error?.message ?? "sin respuesta"}`);
    return r.result;
  });
}
function decodeString(hex) {
  const data = hex.replace(/^0x/, "");
  if (data.length >= 128) {
    const len = parseInt(data.slice(64, 128), 16);
    return Buffer.from(data.slice(128, 128 + len * 2), "hex").toString("utf8");
  }
  return Buffer.from(data, "hex").toString("utf8").replace(/\0+$/, "");
}
async function tokenMeta(chain2, address) {
  const addr = address.toLowerCase();
  const cached = db.prepare("SELECT symbol, decimals FROM token_meta WHERE chain = ? AND address = ?").get(chain2, addr);
  if (cached) return { address: addr, ...cached };
  let decimalsHex;
  let symbolHex;
  try {
    [decimalsHex, symbolHex] = await rpcBatch(chain2, [
      { method: "eth_call", params: [{ to: addr, data: "0x313ce567" }, "latest"] },
      { method: "eth_call", params: [{ to: addr, data: "0x95d89b41" }, "latest"] }
    ]);
  } catch {
    throw new Error(`No existe un token en ${addr} en ${chain2} (o no responde como un ERC-20)`);
  }
  if (!decimalsHex || decimalsHex === "0x") throw new Error(`No existe un token en ${addr} en ${chain2}`);
  const decimals = Number(BigInt(decimalsHex));
  const symbol = decodeString(symbolHex).trim() || "?";
  db.prepare("INSERT OR REPLACE INTO token_meta (chain, address, symbol, decimals) VALUES (?, ?, ?, ?)").run(chain2, addr, symbol, decimals);
  return { address: addr, symbol, decimals };
}
async function gasPriceWei(chain2) {
  const [hex] = await rpcBatch(chain2, [{ method: "eth_gasPrice", params: [] }]);
  return BigInt(hex);
}
async function kyberQuote(chain2, tokenIn, tokenOut, amountIn) {
  const url = `https://aggregator-api.kyberswap.com/${EVM_CHAINS[chain2].kyber}/api/v1/routes?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amountIn=${amountIn}&gasInclude=true`;
  const res = await fetchJson(url, {
    ttlMs: 2e3,
    headers: { "x-client-id": "cryptoagent" }
  });
  const r = res.data?.routeSummary;
  if (res.code !== 0 || !r) throw new Error(`KyberSwap: ${res.message}`);
  return {
    amountOut: BigInt(r.amountOut),
    gas: BigInt(r.gas),
    gasPriceWei: BigInt(r.gasPrice),
    gasUsd: Number(r.gasUsd),
    l1FeeUsd: Number(r.l1FeeUsd ?? 0),
    amountInUsd: Number(r.amountInUsd),
    amountOutUsd: Number(r.amountOutUsd),
    route: r.route.flat().map((s) => s.exchange),
    source: "KyberSwap"
  };
}
async function paraswapQuote(chain2, tokenIn, tokenOut, amountIn) {
  const url = `https://api.paraswap.io/prices?srcToken=${tokenIn.address}&destToken=${tokenOut.address}&amount=${amountIn}&srcDecimals=${tokenIn.decimals}&destDecimals=${tokenOut.decimals}&side=SELL&network=${EVM_CHAINS[chain2].chainId}&version=6.2`;
  const res = await fetchJson(url, { ttlMs: 2e3 });
  const r = res.priceRoute;
  if (!r) throw new Error(`ParaSwap: ${res.error ?? "sin ruta"}`);
  const gas = BigInt(r.gasCost);
  const gasPrice = await gasPriceWei(chain2);
  return {
    amountOut: BigInt(r.destAmount),
    gas,
    gasPriceWei: gasPrice,
    gasUsd: Number(r.gasCostUSD),
    l1FeeUsd: 0,
    amountInUsd: Number(r.srcUSD),
    amountOutUsd: Number(r.destUSD),
    route: (r.bestRoute ?? []).flatMap((x) => x.swaps.flatMap((s) => s.swapExchanges.map((e) => e.exchange))),
    source: "ParaSwap"
  };
}
async function quote(chain2, tokenIn, tokenOut, amountIn) {
  try {
    return await kyberQuote(chain2, tokenIn.address, tokenOut.address, amountIn);
  } catch (kyberErr) {
    try {
      return await paraswapQuote(chain2, tokenIn, tokenOut, amountIn);
    } catch (paraErr) {
      throw new Error(`Sin ruta de swap en ${chain2}: ${kyberErr.message}; ${paraErr.message}`);
    }
  }
}
var pctOrUndefined = (v) => v === void 0 || v === null || v === "" ? void 0 : Number((Number(v) * 100).toFixed(2));
var flag = (v) => v === "1" ? true : v === "0" ? false : void 0;
async function tokenSecurity(chain2, address) {
  const res = await fetchJson(
    `https://api.gopluslabs.io/api/v1/token_security/${EVM_CHAINS[chain2].chainId}?contract_addresses=${address}`,
    { ttlMs: 10 * 6e4 }
  );
  const r = res.result?.[address.toLowerCase()];
  if (!r) return {};
  const holders = r.holders ?? [];
  return {
    buyTaxPct: pctOrUndefined(r.buy_tax),
    sellTaxPct: pctOrUndefined(r.sell_tax),
    honeypot: flag(r.is_honeypot),
    mintable: flag(r.is_mintable),
    cannotSellAll: flag(r.cannot_sell_all),
    holders: r.holder_count ? Number(r.holder_count) : void 0,
    topHoldersPct: holders.length ? Number((holders.slice(0, 10).reduce((s, h) => s + Number(h.percent), 0) * 100).toFixed(1)) : void 0,
    ownerCanChangeBalance: flag(r.owner_change_balance),
    raw: r
  };
}
async function dexPairs(chain2, addresses) {
  const out = /* @__PURE__ */ new Map();
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  for (let i = 0; i < unique.length; i += 30) {
    const pairs = await fetchJson(`https://api.dexscreener.com/tokens/v1/${EVM_CHAINS[chain2].dexscreener}/${unique.slice(i, i + 30).join(",")}`, {
      ttlMs: 15e3
    });
    for (const p of pairs) {
      const key = p.baseToken.address.toLowerCase();
      out.set(key, [...out.get(key) ?? [], p]);
    }
  }
  for (const list of out.values()) list.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  return out;
}

// src/sim/types.ts
var CHAINS = ["solana", "base", "bsc"];
var VENUES = [...CHAINS, "binance"];

// src/market/binance.ts
var BASE2 = "https://api.binance.com/api/v3";
async function getOrderBook(symbol) {
  const raw = await fetchJson(
    `${BASE2}/depth?symbol=${symbol.toUpperCase()}&limit=100`,
    15e3,
    2e3
    // determina el precio de ejecución: caché muy corta
  );
  const parse = (levels) => levels.map(([p, q]) => [Number(p), Number(q)]);
  return { bids: parse(raw.bids), asks: parse(raw.asks) };
}
function walkBook(levels, side, amount) {
  let remaining = amount;
  let baseQty = 0;
  let quoteQty = 0;
  let levelsConsumed = 0;
  for (const [price, qty] of levels) {
    if (remaining <= 0) break;
    levelsConsumed++;
    if (side === "BUY") {
      const spend = Math.min(remaining, price * qty);
      baseQty += spend / price;
      quoteQty += spend;
      remaining -= spend;
    } else {
      const sell = Math.min(remaining, qty);
      baseQty += sell;
      quoteQty += sell * price;
      remaining -= sell;
    }
  }
  if (remaining > 1e-12) throw new Error("No hay liquidez suficiente en el libro para esa cantidad");
  const bestPrice = levels[0][0];
  const avgPrice = quoteQty / baseQty;
  return {
    baseQty,
    quoteQty,
    avgPrice,
    bestPrice,
    slippagePct: Math.abs(avgPrice - bestPrice) / bestPrice * 100,
    levelsConsumed
  };
}

// src/sim/venues/binance.ts
var CASH = /* @__PURE__ */ new Set(["USDT", "USDC", "FDUSD"]);
var binance = {
  kind: "cex",
  id: "binance",
  label: "Binance",
  isCash: (asset) => CASH.has(asset),
  async triggerPrice(symbol) {
    const data = await fetchJson(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    return Number(data.price);
  },
  async liquidationValue(h) {
    if (CASH.has(h.asset)) return { usd: h.amount, method: "stable", reliable: true };
    for (const quoteAsset of ["USDT", "USDC"]) {
      try {
        const book = await getOrderBook(`${h.asset}${quoteAsset}`);
        const fill = walkBook(book.bids, "SELL", h.amount);
        return { usd: fill.quoteQty * (1 - config.binanceTakerFee), method: `liquidaci\xF3n Binance ${h.asset}${quoteAsset}`, reliable: true };
      } catch {
      }
    }
    return { usd: 0, method: "sin precio", reliable: false };
  }
};

// src/sim/venues/evm.ts
var DUST = 1e-12;
var APPROVE_GAS = 46000n;
function settleEvmSwap(q, w) {
  const x = q.extra;
  const native = q.chain === "base" ? "ETH" : "BNB";
  const inBalance = w.balance(q.input.address);
  if (q.amountIn > inBalance + DUST) {
    return { ok: false, error: `Saldo insuficiente: tienes ${inBalance} ${q.input.symbol} y quieres vender ${q.amountIn}`, deltas: [], costs: [] };
  }
  const isNativeIn = q.input.address === NATIVE;
  const needsApproval = !isNativeIn && !w.approved?.(q.input.address);
  const costs = [{ kind: "network_fee", asset: NATIVE, symbol: native, amount: x.gasNative }];
  if (x.l1Native > 0) costs.push({ kind: "l1_fee", asset: NATIVE, symbol: native, amount: x.l1Native });
  if (needsApproval) costs.push({ kind: "approval", asset: NATIVE, symbol: native, amount: x.approvalGasNative });
  const gasCost = costs.reduce((s, c) => s + c.amount, 0);
  const nativeBalance = w.balance(NATIVE);
  const needed = gasCost + (isNativeIn ? q.amountIn : 0);
  if (nativeBalance + DUST < needed) {
    return {
      ok: false,
      error: `insufficient funds for gas * price + value: necesitas ${needed.toPrecision(4)} ${native} (${gasCost.toPrecision(3)} de gas${isNativeIn ? " m\xE1s lo que env\xEDas" : ""}) y tienes ${nativeBalance.toPrecision(4)} ${native}. En esta cadena el gas se paga en ${native}.`,
      deltas: [],
      costs: []
    };
  }
  const gasDelta = { asset: NATIVE, symbol: native, decimals: 18, amount: -gasCost };
  const approvals = needsApproval ? [q.input.address] : [];
  const revert = (error) => ({ ok: false, error, deltas: [gasDelta], costs, approvals });
  if (x.honeypotSell) return revert(`El swap revierte: ${q.input.symbol} es un honeypot (no se puede vender). Has pagado el gas igualmente.`);
  const taxLoss = q.grossOut > 0 ? 1 - q.amountOut / q.grossOut : 0;
  if (taxLoss * 1e4 > q.slippageBps + 1e-6) {
    return revert(
      `El swap revierte: los impuestos del token (${(taxLoss * 100).toFixed(1)} %) superan tu slippage (${q.slippageBps / 100} %). Has pagado el gas igualmente. Con un token con impuestos, el slippage tiene que cubrirlos.`
    );
  }
  if (x.sellTaxPct) costs.push({ kind: "tax_sell", asset: q.input.address, symbol: q.input.symbol, amount: q.amountIn * (x.sellTaxPct / 100) });
  if (x.buyTaxPct) {
    costs.push({ kind: "tax_buy", asset: q.output.address, symbol: q.output.symbol, amount: q.grossOut * (1 - (x.sellTaxPct ?? 0) / 100) * (x.buyTaxPct / 100) });
  }
  return {
    ok: true,
    deltas: [
      { asset: q.input.address, symbol: q.input.symbol, decimals: q.input.decimals, amount: -q.amountIn },
      { asset: q.output.address, symbol: q.output.symbol, decimals: q.output.decimals, amount: q.amountOut },
      gasDelta
    ],
    costs,
    approvals,
    info: { gasCost: `${gasCost.toPrecision(3)} ${native}`, approvalSent: needsApproval, quotedBy: x.source }
  };
}
var ageMinutes = (ms) => ms ? Math.round((Date.now() - ms) / 6e4) : void 0;
var n = (v, d = 2) => typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(d)) : void 0;
function evmAdapter(cfg) {
  const cash = new Set(cfg.stables.map((t) => t.address));
  const isCash = (a) => cash.has(a.toLowerCase());
  async function nativeUsd() {
    const data = await fetchJson(`https://api.binance.com/api/v3/ticker/price?symbol=${cfg.nativeBook}`, { ttlMs: 1e4 });
    return Number(data.price);
  }
  async function resolveToken(ref) {
    const r = ref.trim();
    const alias = cfg.aliases[r.toUpperCase()];
    if (alias) return alias;
    if (!isAddress(r)) {
      throw new Error(`En ${cfg.label} indica la direcci\xF3n del token (0x\u2026) o un alias: ${Object.keys(cfg.aliases).join(", ")}`);
    }
    if (r.toLowerCase() === NATIVE) return cfg.native;
    return tokenMeta(cfg.id, r);
  }
  async function priceUsd2(assets) {
    const prices = {};
    const rest = [];
    for (const a of assets.map((x) => x.toLowerCase())) {
      if (isCash(a)) prices[a] = 1;
      else if (a === NATIVE) prices[a] = await nativeUsd();
      else rest.push(a);
    }
    if (rest.length) {
      const pairs = await dexPairs(cfg.id, rest);
      for (const a of rest) {
        const p = Number(pairs.get(a)?.[0]?.priceUsd);
        if (Number.isFinite(p) && p > 0) prices[a] = p;
      }
    }
    return prices;
  }
  const security = (a) => a === NATIVE || isCash(a) ? Promise.resolve({}) : tokenSecurity(cfg.id, a).catch(() => ({}));
  const adapter = {
    kind: "chain",
    id: cfg.id,
    label: cfg.label,
    native: cfg.native,
    cash: cfg.cash,
    stables: cfg.stables,
    liquidationReserve: cfg.liquidationReserve,
    gasBudgetUsd: cfg.gasBudgetUsd,
    isCash,
    resolveToken,
    priceUsd: priceUsd2,
    async triggerPrice(asset) {
      const price = (await priceUsd2([asset]))[asset.toLowerCase()];
      if (typeof price !== "number") throw new Error(`Sin precio para ${asset} en ${cfg.label}`);
      return price;
    },
    async quote({ input, output, amountIn, slippageBps }) {
      if (input.address === output.address) throw new Error("El token de entrada y salida son el mismo");
      const [q, secIn, secOut] = await Promise.all([
        quote(cfg.id, input, output, toBaseUnits(amountIn, input.decimals)),
        security(input.address),
        security(output.address)
      ]);
      const grossOut = fromBaseUnits(q.amountOut, output.decimals);
      const gasNative = Number(q.gas * q.gasPriceWei) / 1e18;
      const nativePrice = gasNative > 0 && q.gasUsd > 0 ? q.gasUsd / gasNative : await nativeUsd();
      const warnings = [];
      const taxable = (t) => t.address !== NATIVE && !isCash(t.address);
      if (taxable(input) && secIn.sellTaxPct === void 0) warnings.push(`No se conoce el impuesto de venta de ${input.symbol}: podr\xEDa tenerlo.`);
      if (taxable(output) && secOut.buyTaxPct === void 0) warnings.push(`No se conoce el impuesto de compra de ${output.symbol}: podr\xEDa tenerlo.`);
      if (secIn.sellTaxPct) warnings.push(`${input.symbol} cobra un ${secIn.sellTaxPct} % al venderlo.`);
      if (secOut.buyTaxPct) warnings.push(`${output.symbol} cobra un ${secOut.buyTaxPct} % al comprarlo.`);
      if (secOut.sellTaxPct) warnings.push(`${output.symbol} cobra un ${secOut.sellTaxPct} % al venderlo.`);
      if (secOut.honeypot) warnings.push(`GoPlus marca ${output.symbol} como honeypot: podr\xEDas no poder venderlo.`);
      if (secOut.cannotSellAll) warnings.push(`${output.symbol} no deja vender todo el saldo de una vez.`);
      const extra = {
        source: q.source,
        gasNative,
        l1Native: q.l1FeeUsd / nativePrice,
        approvalGasNative: Number(APPROVE_GAS * q.gasPriceWei) / 1e18,
        sellTaxPct: secIn.sellTaxPct,
        buyTaxPct: secOut.buyTaxPct,
        honeypotSell: secIn.honeypot === true
      };
      return {
        chain: cfg.id,
        input,
        output,
        amountIn,
        grossOut,
        amountOut: grossOut * (1 - (secIn.sellTaxPct ?? 0) / 100) * (1 - (secOut.buyTaxPct ?? 0) / 100),
        route: [`${q.source}: ${[...new Set(q.route)].join(", ")}`],
        slippageBps,
        extra,
        warnings
      };
    },
    settle: settleEvmSwap,
    async liquidationValue(h) {
      const asset = h.asset.toLowerCase();
      if (isCash(asset)) return { usd: h.amount, method: "stable", reliable: true };
      if (asset === NATIVE) {
        try {
          const fill = walkBook((await getOrderBook(cfg.nativeBook)).bids, "SELL", h.amount);
          return { usd: fill.quoteQty, method: `libro Binance ${cfg.nativeBook}`, reliable: true };
        } catch {
        }
      }
      try {
        const sec = await security(asset);
        if (sec.honeypot) return { usd: 0, method: "honeypot: no se puede vender", reliable: true };
        const token2 = asset === NATIVE ? cfg.native : await tokenMeta(cfg.id, asset);
        const q = await quote(cfg.id, token2, cfg.cash, toBaseUnits(h.amount, h.decimals));
        const usd = fromBaseUnits(q.amountOut, cfg.cash.decimals) * (1 - (sec.sellTaxPct ?? 0) / 100);
        return { usd, method: `liquidaci\xF3n ${q.source}${sec.sellTaxPct ? ` (con ${sec.sellTaxPct} % de impuesto)` : ""}`, reliable: true };
      } catch (err) {
        if (isNoRouteError(err)) return { usd: 0, method: "sin ruta de venta: ahora no se puede vender", reliable: true };
        const p = (await priceUsd2([asset]).catch(() => ({})))[asset];
        return { usd: (p ?? 0) * h.amount, method: "precio spot (sin cotizaci\xF3n de venta)", reliable: false };
      }
    },
    async entryFeatures(asset) {
      const [pairs, sec] = await Promise.all([dexPairs(cfg.id, [asset]).catch(() => /* @__PURE__ */ new Map()), security(asset.toLowerCase())]);
      const top = pairs.get(asset.toLowerCase())?.[0];
      const m5 = top?.txns?.m5;
      return {
        venue: cfg.id,
        ageMinutes: ageMinutes(top?.pairCreatedAt),
        liquidityUsd: n(top?.liquidity?.usd, 0),
        mcapUsd: n(top?.marketCap ?? top?.fdv, 0),
        priceChange5mPct: n(top?.priceChange?.m5),
        priceChange1hPct: n(top?.priceChange?.h1),
        priceChange24hPct: n(top?.priceChange?.h24),
        holders: sec.holders,
        topHoldersPct: sec.topHoldersPct,
        netBuyers5m: m5 ? m5.buys - m5.sells : void 0,
        launchpad: top?.dexId,
        buyTaxPct: sec.buyTaxPct,
        sellTaxPct: sec.sellTaxPct,
        honeypot: sec.honeypot,
        mintable: sec.mintable
      };
    },
    research: {
      async scan(limit) {
        const merged = /* @__PURE__ */ new Map();
        const add2 = (address, source, data) => {
          if (!address) return;
          const key = address.toLowerCase();
          const c = merged.get(key) ?? { token: key, sources: [] };
          if (!c.sources.includes(source)) c.sources.push(source);
          for (const [k, v] of Object.entries(data)) if (v !== void 0 && c[k] === void 0) c[k] = v;
          merged.set(key, c);
        };
        const gecko = async (kind) => {
          const res = await fetchJson(`https://api.geckoterminal.com/api/v2/networks/${EVM_CHAINS[cfg.id].gecko}/${kind}`);
          for (const p of res.data) {
            const a = p.attributes ?? {};
            const tx = a.transactions?.m5;
            add2(String(p.relationships?.base_token?.data?.id ?? "").replace(/^[a-z_]+?_(0x)/, "$1"), `geckoterminal_${kind}`, {
              name: a.name,
              liquidityUsd: n(Number(a.reserve_in_usd), 0),
              priceChange5mPct: n(Number(a.price_change_percentage?.m5)),
              priceChange1hPct: n(Number(a.price_change_percentage?.h1)),
              netBuyers5m: tx ? tx.buyers - tx.sellers : void 0,
              volume1hUsd: n(Number(a.volume_usd?.h1), 0),
              ageMinutes: a.pool_created_at ? ageMinutes(new Date(a.pool_created_at).getTime()) : void 0
            });
          }
          return res.data.length;
        };
        const boosts = async () => {
          const list = await fetchJson("https://api.dexscreener.com/token-boosts/latest/v1");
          const mine = list.filter((b) => b.chainId === EVM_CHAINS[cfg.id].dexscreener);
          for (const b of mine) add2(b.tokenAddress, "dexscreener_boosted", { dexscreenerBoost: b.totalAmount });
          return mine.length;
        };
        const sources = ["geckoterminal_trending_pools", "geckoterminal_new_pools", "dexscreener_boosted"];
        const status = await Promise.all(
          [() => gecko("trending_pools"), () => gecko("new_pools"), boosts].map((fn, i) => fn().then((c) => `${sources[i]}: ${c}`, (e) => `${sources[i]}: ${e.message.slice(0, 120)}`))
        );
        const skip = /* @__PURE__ */ new Set([...cash, ...Object.values(cfg.aliases).map((t) => t.address)]);
        const candidates = [...merged.values()].filter((c) => !skip.has(c.token)).sort((a, b) => b.sources.length - a.sources.length || (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0)).slice(0, limit);
        return {
          chain: cfg.id,
          note: `Candidatos de ${cfg.label} de varias fuentes (los que aparecen en m\xE1s fuentes van primero). Para uno a fondo: token_report con chain: ${cfg.id} y su direcci\xF3n.`,
          sourcesStatus: status,
          totalUnique: merged.size,
          candidates
        };
      },
      async report(token2) {
        const t = await resolveToken(token2);
        const [pairs, sec] = await Promise.all([
          dexPairs(cfg.id, [t.address]).then(
            (m) => m.get(t.address) ?? [],
            (e) => ({ error: e.message })
          ),
          t.address === NATIVE || isCash(t.address) ? Promise.resolve(null) : tokenSecurity(cfg.id, t.address).catch((e) => ({ error: e.message }))
        ]);
        const summarize = (p) => ({
          dex: p.dexId,
          quote: p.quoteToken.symbol,
          priceUsd: p.priceUsd,
          liquidityUsd: n(p.liquidity?.usd, 0),
          mcapUsd: n(p.marketCap ?? p.fdv, 0),
          pairAgeMinutes: ageMinutes(p.pairCreatedAt),
          txns: p.txns,
          volumeUsd: p.volume,
          priceChangePct: p.priceChange,
          url: p.url
        });
        const top = Array.isArray(pairs) ? pairs[0] : void 0;
        const s = sec && !("error" in sec) ? sec : void 0;
        return {
          chain: cfg.id,
          token: t,
          pairs: Array.isArray(pairs) ? { count: pairs.length, top: pairs.slice(0, 3).map(summarize) } : pairs,
          websites: top?.info?.websites?.map((w) => w.url),
          socials: top?.info?.socials?.map((x) => `${x.type}: ${x.url}`),
          security: s ? {
            buyTaxPct: s.buyTaxPct ?? "desconocido",
            sellTaxPct: s.sellTaxPct ?? "desconocido",
            honeypot: s.honeypot,
            cannotSellAll: s.cannotSellAll,
            mintable: s.mintable,
            ownerCanChangeBalance: s.ownerCanChangeBalance,
            holders: s.holders,
            top10HoldersPct: s.topHoldersPct,
            openSource: s.raw?.is_open_source,
            proxy: s.raw?.is_proxy,
            creatorPercent: s.raw?.creator_percent,
            lpHolders: s.raw?.lp_holders?.slice(0, 3)
          } : sec ?? void 0
        };
      }
    }
  };
  return adapter;
}
var token = (address, symbol, decimals) => ({ address: address.toLowerCase(), symbol, decimals });
var ETH = token(NATIVE, "ETH", 18);
var BASE_USDC = token("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "USDC", 6);
var BASE_USDBC = token("0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", "USDbC", 6);
var BASE_WETH = token("0x4200000000000000000000000000000000000006", "WETH", 18);
var BNB = token(NATIVE, "BNB", 18);
var BSC_USDT = token("0x55d398326f99059fF775485246999027B3197955", "USDT", 18);
var BSC_USDC = token("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", "USDC", 18);
var BSC_WBNB = token("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "WBNB", 18);
var base = evmAdapter({
  id: "base",
  label: "Base",
  native: ETH,
  nativeBook: "ETHUSDT",
  cash: BASE_USDC,
  stables: [BASE_USDC, BASE_USDBC],
  aliases: { ETH, WETH: BASE_WETH, USDC: BASE_USDC },
  liquidationReserve: 3e-5,
  gasBudgetUsd: { min: 0.3, max: 3 }
});
var bsc = evmAdapter({
  id: "bsc",
  label: "BNB Chain",
  native: BNB,
  nativeBook: "BNBUSDT",
  cash: BSC_USDT,
  stables: [BSC_USDT, BSC_USDC],
  aliases: { BNB, WBNB: BSC_WBNB, USDT: BSC_USDT, USDC: BSC_USDC },
  liquidationReserve: 2e-4,
  gasBudgetUsd: { min: 0.3, max: 3 }
});

// src/market/research.ts
var n2 = (v, digits = 2) => typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(digits)) : void 0;
var ageMinutes2 = (iso) => iso === void 0 ? void 0 : Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
async function attempt(label, fn) {
  try {
    return await fn();
  } catch (err) {
    return { error: `${label}: ${err.message.slice(0, 160)}` };
  }
}
async function scanMarket(limit = 25) {
  const merged = /* @__PURE__ */ new Map();
  const add2 = (mint, source, data) => {
    if (!mint) return;
    const c = merged.get(mint) ?? { mint, sources: [] };
    if (!c.sources.includes(source)) c.sources.push(source);
    for (const [k, v] of Object.entries(data)) if (v !== void 0 && c[k] === void 0) c[k] = v;
    merged.set(mint, c);
  };
  const jup = async (interval) => {
    const list = await fetchJson(`https://lite-api.jup.ag/tokens/v2/toptrending/${interval}?limit=50`);
    for (const t of list) {
      add2(t.id, `jupiter_trending_${interval}`, {
        symbol: t.symbol,
        name: t.name,
        mcapUsd: n2(t.mcap, 0),
        liquidityUsd: n2(t.liquidity, 0),
        priceChange5mPct: n2(t.stats5m?.priceChange),
        priceChange1hPct: n2(t.stats1h?.priceChange),
        netBuyers5m: t.stats5m?.numNetBuyers,
        traders5m: t.stats5m?.numTraders,
        ageMinutes: ageMinutes2(t.createdAt)
      });
    }
    return list.length;
  };
  const pump = async () => {
    const list = await fetchJson("https://frontend-api-v3.pump.fun/coins/currently-live?limit=40&offset=0&includeNsfw=false");
    for (const c of list) {
      add2(c.mint, "pumpfun_live", {
        symbol: c.symbol,
        name: c.name,
        mcapUsd: n2(c.usd_market_cap, 0),
        pumpfunGraduated: c.complete,
        pumpfunReplies: c.reply_count,
        ageMinutes: ageMinutes2(c.created_timestamp)
      });
    }
    return list.length;
  };
  const boosts = async () => {
    const list = await fetchJson("https://api.dexscreener.com/token-boosts/latest/v1");
    const sol = list.filter((b) => b.chainId === "solana");
    for (const b of sol) add2(b.tokenAddress, "dexscreener_boosted", { dexscreenerBoost: b.totalAmount });
    return sol.length;
  };
  const gecko = async () => {
    const res = await fetchJson("https://api.geckoterminal.com/api/v2/networks/solana/trending_pools");
    for (const p of res.data) {
      const mint = String(p.relationships?.base_token?.data?.id ?? "").replace(/^solana_/, "");
      const a = p.attributes ?? {};
      add2(mint, "geckoterminal_trending", {
        name: a.name,
        liquidityUsd: n2(Number(a.reserve_in_usd), 0),
        priceChange5mPct: n2(Number(a.price_change_percentage?.m5)),
        priceChange1hPct: n2(Number(a.price_change_percentage?.h1)),
        ageMinutes: ageMinutes2(a.pool_created_at)
      });
    }
    return res.data.length;
  };
  const status = await Promise.all([
    attempt("jupiter_trending_5m", () => jup("5m")),
    attempt("jupiter_trending_1h", () => jup("1h")),
    attempt("pumpfun_live", pump),
    attempt("dexscreener_boosted", boosts),
    attempt("geckoterminal_trending", gecko)
  ]);
  const candidates = [...merged.values()].sort((a, b) => b.sources.length - a.sources.length || (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0)).slice(0, limit);
  return {
    note: "Candidatos combinados de varias fuentes (los que aparecen en m\xE1s fuentes van primero). Para analizar uno a fondo usa token_report con chain: solana y su mint.",
    sourcesStatus: status.map(
      (s, i) => typeof s === "number" ? `${["jupiter_trending_5m", "jupiter_trending_1h", "pumpfun_live", "dexscreener_boosted", "geckoterminal_trending"][i]}: ${s}` : s.error
    ),
    totalUnique: merged.size,
    candidates
  };
}
async function tokenReport(mint) {
  const [jupiter, dexscreener, rugcheck, pumpfun] = await Promise.all([
    attempt("jupiter", async () => {
      const list = await fetchJson(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mint)}`);
      const t = list.find((x) => x.id === mint);
      if (!t) return { error: "no encontrado en Jupiter" };
      const stats = (s) => s && {
        priceChangePct: n2(s.priceChange),
        buyVolumeUsd: n2(s.buyVolume, 0),
        sellVolumeUsd: n2(s.sellVolume, 0),
        buys: s.numBuys,
        sells: s.numSells,
        traders: s.numTraders,
        netBuyers: s.numNetBuyers,
        organicBuyers: s.numOrganicBuyers
      };
      return {
        symbol: t.symbol,
        name: t.name,
        priceUsd: t.usdPrice,
        mcapUsd: n2(t.mcap, 0),
        liquidityUsd: n2(t.liquidity, 0),
        holders: t.holderCount,
        ageMinutes: ageMinutes2(t.createdAt),
        launchpad: t.launchpad,
        graduatedAt: t.graduatedAt,
        organicScore: n2(t.organicScore, 1),
        verified: t.isVerified,
        website: t.website,
        audit: t.audit,
        stats5m: stats(t.stats5m),
        stats1h: stats(t.stats1h),
        stats24h: stats(t.stats24h)
      };
    }),
    attempt("dexscreener", async () => {
      const pairs = await fetchJson(`https://api.dexscreener.com/tokens/v1/solana/${mint}`);
      if (!pairs.length) return { error: "sin pares en DexScreener" };
      const top = pairs[0];
      return {
        pairs: pairs.length,
        mainDex: top.dexId,
        pairAgeMinutes: ageMinutes2(top.pairCreatedAt),
        liquidityUsd: n2(top.liquidity?.usd, 0),
        volumeUsd: top.volume,
        txns: { m5: top.txns?.m5, h1: top.txns?.h1 },
        priceChangePct: top.priceChange,
        websites: top.info?.websites?.map((w) => w.url),
        socials: top.info?.socials?.map((s) => `${s.type}: ${s.url}`),
        boosts: top.boosts?.active,
        url: top.url
      };
    }),
    attempt("rugcheck", async () => {
      const r = await fetchJson(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`);
      return {
        scoreNormalised: r.score_normalised,
        risks: (r.risks ?? []).map((x) => `${x.level}: ${x.name}${x.value ? ` (${x.value})` : ""}`)
      };
    }),
    mint.endsWith("pump") ? attempt("pumpfun", async () => {
      const c = await fetchJson(`https://frontend-api-v3.pump.fun/coins-v2/${mint}`);
      return {
        description: c.description,
        twitter: c.twitter,
        telegram: c.telegram,
        website: c.website,
        replies: c.reply_count,
        participants: c.num_participants,
        graduated: c.complete,
        mcapUsd: n2(c.usd_market_cap, 0),
        athMcapUsd: n2(c.ath_market_cap, 0),
        securityVerdict: c.security_verdict,
        createdMinutesAgo: ageMinutes2(c.created_timestamp),
        url: `https://pump.fun/coin/${mint}`
      };
    }) : Promise.resolve(void 0)
  ]);
  return { mint, jupiter, dexscreener, rugcheck, ...pumpfun ? { pumpfun } : {} };
}

// src/sim/venues/solana.ts
var TOKEN_ACCOUNT_RENT_SOL = 203928e-8;
var USDT_MINT2 = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
var CASH2 = /* @__PURE__ */ new Set([USDC_MINT, USDT_MINT2]);
var DUST2 = 1e-12;
var SOL = { address: SOL_MINT, symbol: "SOL", decimals: 9 };
var USDC = { address: USDC_MINT, symbol: "USDC", decimals: 6 };
function settleSolanaSwap(q, w) {
  const input = q.input.address;
  const output = q.output.address;
  const inBalance = w.balance(input);
  if (q.amountIn > inBalance + DUST2) {
    return { ok: false, error: `Saldo insuficiente: tienes ${inBalance} ${q.input.symbol} y quieres vender ${q.amountIn}`, deltas: [], costs: [] };
  }
  const opensAccount = output !== SOL_MINT && w.balance(output) <= DUST2;
  const closesAccount = input !== SOL_MINT && inBalance - q.amountIn <= DUST2;
  const costs = [{ kind: "network_fee", asset: SOL_MINT, symbol: "SOL", amount: config.solanaTxFeeSol }];
  if (opensAccount) costs.push({ kind: "rent", asset: SOL_MINT, symbol: "SOL", amount: TOKEN_ACCOUNT_RENT_SOL });
  if (closesAccount) costs.push({ kind: "rent_refund", asset: SOL_MINT, symbol: "SOL", amount: -TOKEN_ACCOUNT_RENT_SOL });
  const solCost = costs.reduce((s, c) => s + c.amount, 0);
  const solAfter = w.balance(SOL_MINT) - solCost - (input === SOL_MINT ? q.amountIn : 0) + (output === SOL_MINT ? q.amountOut : 0);
  if (solAfter < -DUST2) {
    return {
      ok: false,
      error: `SOL insuficiente para pagar la red (${solCost.toFixed(6)} SOL de fees/renta). En Solana necesitas SOL para operar.`,
      deltas: [],
      costs: []
    };
  }
  return {
    ok: true,
    deltas: [
      { asset: input, symbol: q.input.symbol, decimals: q.input.decimals, amount: -q.amountIn },
      { asset: output, symbol: q.output.symbol, decimals: q.output.decimals, amount: q.amountOut },
      { asset: SOL_MINT, symbol: "SOL", decimals: 9, amount: -solCost }
    ],
    costs,
    info: { networkCostSol: solCost, tokenAccountOpened: opensAccount, tokenAccountClosed: closesAccount }
  };
}
async function priceUsd(mints) {
  const prices = {};
  const need = [...new Set(mints)].filter((m) => !CASH2.has(m));
  for (const m of mints) if (CASH2.has(m)) prices[m] = 1;
  if (need.length) {
    const data = await fetchJson(`https://lite-api.jup.ag/price/v3?ids=${need.join(",")}`);
    for (const m of need) if (typeof data[m]?.usdPrice === "number") prices[m] = data[m].usdPrice;
  }
  return prices;
}
async function entryFeatures(mint) {
  const [jup, rug] = await Promise.allSettled([
    fetchJson(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`, 8e3),
    fetchJson(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, 8e3)
  ]);
  const t = jup.status === "fulfilled" ? jup.value.find((x) => x.id === mint) : void 0;
  const risks = rug.status === "fulfilled" ? rug.value.risks ?? [] : void 0;
  const round = (v, d = 2) => typeof v === "number" ? Number(v.toFixed(d)) : void 0;
  return {
    venue: "solana",
    ageMinutes: t?.createdAt ? Math.round((Date.now() - new Date(t.createdAt).getTime()) / 6e4) : void 0,
    liquidityUsd: round(t?.liquidity, 0),
    mcapUsd: round(t?.mcap, 0),
    priceChange5mPct: round(t?.stats5m?.priceChange),
    priceChange1hPct: round(t?.stats1h?.priceChange),
    priceChange24hPct: round(t?.stats24h?.priceChange),
    buyVolume5mUsd: round(t?.stats5m?.buyVolume, 0),
    sellVolume5mUsd: round(t?.stats5m?.sellVolume, 0),
    buySellRatio5m: t?.stats5m?.sellVolume > 0 ? round(t.stats5m.buyVolume / t.stats5m.sellVolume) : void 0,
    holders: t?.holderCount,
    topHoldersPct: round(t?.audit?.topHoldersPercentage, 1),
    netBuyers5m: t?.stats5m?.numNetBuyers,
    organicScore: round(t?.organicScore, 1),
    launchpad: t?.launchpad,
    rugcheckDangerRisks: risks ? risks.filter((r) => r.level === "danger").length : void 0,
    rugcheckWarnRisks: risks ? risks.filter((r) => r.level === "warn").length : void 0
  };
}
var solana = {
  kind: "chain",
  id: "solana",
  label: "Solana",
  native: SOL,
  cash: USDC,
  stables: [USDC, { address: USDT_MINT2, symbol: "USDT", decimals: 6 }],
  liquidationReserve: config.solanaTxFeeSol,
  // Entre ~0,005 SOL (la fee de muchas operaciones y la renta de dos tokens a la vez) y ~0,05 SOL.
  gasBudgetUsd: { min: 0.75, max: 7.5 },
  isCash: (asset) => CASH2.has(asset),
  async resolveToken(ref) {
    const mint = resolveMint(ref.trim());
    const info = await getTokenInfo(mint);
    return { address: mint, symbol: info.symbol, decimals: info.decimals };
  },
  priceUsd,
  async triggerPrice(asset) {
    const price = (await priceUsd([asset]))[asset];
    if (typeof price !== "number") throw new Error(`Jupiter no da precio para ${asset}`);
    return price;
  },
  async quote({ input, output, amountIn, slippageBps }) {
    if (input.address === output.address) throw new Error("El token de entrada y salida son el mismo");
    const q = await getQuote(input.address, output.address, toBaseUnits(amountIn, input.decimals), slippageBps);
    const out = fromBaseUnits(q.outAmount, output.decimals);
    return {
      chain: "solana",
      input,
      output,
      amountIn,
      grossOut: out,
      amountOut: out,
      priceImpactPct: q.priceImpactPct,
      route: q.routePlan.map((r) => `${r.swapInfo.label ?? r.swapInfo.ammKey} (${r.percent}%)`),
      slippageBps,
      extra: { slot: q.contextSlot },
      warnings: []
    };
  },
  settle: settleSolanaSwap,
  async liquidationValue(h) {
    if (CASH2.has(h.asset)) return { usd: h.amount, method: "stable", reliable: true };
    if (h.asset === SOL_MINT) {
      try {
        const fill = walkBook((await getOrderBook("SOLUSDT")).bids, "SELL", h.amount);
        return { usd: fill.quoteQty, method: "libro Binance SOLUSDT", reliable: true };
      } catch {
      }
    }
    try {
      const q = await getQuote(h.asset, USDC_MINT, toBaseUnits(h.amount, h.decimals), 100, 1e4);
      return { usd: fromBaseUnits(q.outAmount, 6), method: "liquidaci\xF3n Jupiter", reliable: true };
    } catch (err) {
      if (isNoRouteError(err)) return { usd: 0, method: "sin ruta de venta: ahora no se puede vender", reliable: true };
      const info = await getTokenInfo(h.asset).catch(() => null);
      return { usd: (info?.usdPrice ?? 0) * h.amount, method: "precio spot (sin cotizaci\xF3n de venta)", reliable: false };
    }
  },
  entryFeatures,
  research: {
    scan: (limit) => scanMarket(limit),
    report: (token2) => tokenReport(resolveMint(token2.trim()))
  }
};

// src/sim/venues/index.ts
var chains = { solana, base, bsc };
var venues = { ...chains, binance };
function getVenue(id) {
  const v = venues[id];
  if (!v) throw new Error(`No existe el sitio "${id}". Disponibles: ${Object.keys(venues).join(", ")}`);
  return v;
}

// src/live/chain.ts
var solanaRpcUrl = () => process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
var TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
async function solanaRpc(method, params, ttlMs = 5e3) {
  const res = await fetchJson(solanaRpcUrl(), {
    method: "POST",
    body: { jsonrpc: "2.0", id: 1, method, params },
    ttlMs
  });
  if (res.error) throw new Error(`RPC de Solana (${method}): ${res.error.message}`);
  return res.result;
}
async function solanaHoldings(owner) {
  const lamports = (await solanaRpc("getBalance", [owner])).value;
  const holdings = [{ venue: "solana", asset: SOL_MINT, symbol: "SOL", decimals: 9, amount: lamports / 1e9 }];
  for (const programId of TOKEN_PROGRAMS) {
    const { value } = await solanaRpc(
      "getTokenAccountsByOwner",
      [owner, { programId }, { encoding: "jsonParsed" }]
    );
    for (const a of value) {
      const { mint, tokenAmount } = a.account.data.parsed.info;
      const amount = Number(tokenAmount.amount) / 10 ** tokenAmount.decimals;
      if (amount <= 0) continue;
      const symbol = await getVenue("solana").resolveToken(mint).then((t) => t.symbol, () => `${mint.slice(0, 4)}\u2026`);
      holdings.push({ venue: "solana", asset: mint, symbol, decimals: tokenAmount.decimals, amount });
    }
  }
  return holdings;
}
var pad32 = (addr) => addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
async function evmHoldings(chain2, owner, extraTokens) {
  const venue = getVenue(chain2);
  const seen = /* @__PURE__ */ new Set();
  const tokens = [...venue.stables, ...extraTokens].filter((t) => {
    const a = t.address.toLowerCase();
    if (a === NATIVE || seen.has(a)) return false;
    seen.add(a);
    return true;
  });
  const results = await rpcBatch(chain2, [
    { method: "eth_getBalance", params: [owner, "latest"] },
    ...tokens.map((t) => ({ method: "eth_call", params: [{ to: t.address, data: `0x70a08231${pad32(owner)}` }, "latest"] }))
  ]);
  const holdings = [
    { venue: chain2, asset: NATIVE, symbol: venue.native.symbol, decimals: 18, amount: Number(BigInt(results[0])) / 1e18 }
  ];
  tokens.forEach((t, i) => {
    const raw = results[i + 1];
    const amount = raw && raw !== "0x" ? Number(BigInt(raw)) / 10 ** t.decimals : 0;
    if (amount > 0) holdings.push({ venue: chain2, asset: t.address.toLowerCase(), symbol: t.symbol, decimals: t.decimals, amount });
  });
  return holdings;
}
async function walletBalances(pub, extraEvmTokens = {}) {
  const reads = [
    ["solana", solanaHoldings(pub.solana)],
    ...Object.keys(EVM_CHAINS).map((c) => [c, evmHoldings(c, pub.evm, extraEvmTokens[c] ?? [])])
  ];
  const out = { totalUsd: 0, byChain: { solana: 0, base: 0, bsc: 0 }, balances: [], errors: {} };
  for (const [chain2, p] of reads) {
    try {
      for (const h of await p) {
        const v = await getVenue(chain2).liquidationValue(h).catch(() => ({ usd: 0, method: "sin precio" }));
        out.balances.push({ ...h, usd: Number(v.usd.toFixed(4)), valuedBy: v.method });
        out.byChain[chain2] += v.usd;
        out.totalUsd += v.usd;
      }
    } catch (err) {
      out.errors[chain2] = err.message;
    }
  }
  return out;
}

// src/live/paths.ts
import path6 from "node:path";
var liveDir = () => path6.join(config.dataDir, "live");
var signerInfoFile = () => path6.join(liveDir(), "signer.json");

// src/live/signer/page.ts
var WALLET_PAGE = (
  /* html */
  `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cartera de la IA</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Anybody:wdth,wght@75..150,400..800&display=swap" rel="stylesheet">
<style>
  :root { --bg:#141518; --surface:#1c1d21; --surface-2:#26282d; --ink:#ece8e1; --muted:#9a968f; --rule:#2e3036;
          --accent:#f4c430; --down:#ef6f63; --up:#52c98b; --ease:cubic-bezier(0.16,1,0.3,1); }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 "Anybody", system-ui, sans-serif; font-stretch:100%; }
  main { max-width: 760px; margin: 0 auto; padding: 40px 16px 80px; }
  h1 { font-size: clamp(34px, 7vw, 56px); line-height: 1; font-stretch: 140%; font-weight: 800; margin: 0 0 8px; }
  h2 { font-size: 15px; font-stretch: 125%; letter-spacing: .02em; color: var(--muted); margin: 36px 0 12px; font-weight: 700; }
  p { max-width: 62ch; }
  .lead { color: var(--muted); margin: 0 0 28px; }
  .band { background: var(--accent); color: #141518; font-weight: 700; padding: 10px 14px; border-radius: 4px; margin-bottom: 24px; }
  .warn { border-left: 3px solid var(--down); padding: 4px 0 4px 14px; color: var(--ink); }
  form { display: grid; gap: 12px; max-width: 420px; }
  label { font-size: 14px; color: var(--muted); display: grid; gap: 6px; }
  input[type=password] { background: var(--surface); color: var(--ink); border: 1px solid var(--rule); border-radius: 4px; padding: 12px; font: inherit; }
  input:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  button { font: inherit; font-weight: 700; font-stretch: 115%; border: 0; border-radius: 4px; padding: 12px 18px; cursor: pointer; min-height: 44px;
           background: var(--accent); color: #141518; transition: transform 150ms var(--ease); }
  button:active { transform: translateY(1px); }
  button.ghost { background: transparent; color: var(--ink); border: 1px solid var(--rule); }
  button.stop { background: var(--down); color: #141518; }
  button:disabled { opacity: .5; cursor: default; }
  .error { color: var(--down); min-height: 1.5em; margin: 0; }
  .words { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin: 16px 0; padding: 0; list-style: none; counter-reset: w; }
  .words li { background: var(--surface); border: 1px solid var(--rule); border-radius: 4px; padding: 10px 12px; font-weight: 600; counter-increment: w; }
  .words li::before { content: counter(w); color: var(--muted); font-weight: 400; margin-right: 10px; font-size: 13px; }
  .addr { display: grid; gap: 2px; padding: 14px 0; border-bottom: 1px solid var(--rule); }
  .addr b { font-stretch: 120%; }
  .addr code { font-size: 14px; word-break: break-all; color: var(--ink); }
  .addr a { color: var(--muted); font-size: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 15px; }
  td { padding: 8px 0; border-bottom: 1px solid var(--rule); }
  td.n { text-align: right; font-variant-numeric: tabular-nums; }
  .total { font-size: 40px; font-stretch: 140%; font-weight: 800; margin: 0; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; }
  .pill { display:inline-block; padding: 2px 10px; border-radius: 999px; font-size: 13px; font-weight: 700; background: var(--surface-2); }
  .pill.on { background: var(--up); color: #141518; } .pill.off { background: var(--down); color: #141518; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main>
  <div class="band">Dinero real. Esta p\xE1gina es solo para ti: no la compartas y no se la ense\xF1es al agente.</div>
  <h1>Cartera de la IA</h1>
  <p class="lead" id="lead">Cargando\u2026</p>

  <section id="create" hidden>
    <p>Vas a crear una cartera <b>nueva</b>, solo para la IA. No uses una frase que ya tengas: la IA operar\xE1 con lo que haya en esta cartera y deber\xEDa ser dinero que puedas perder entero.</p>
    <form id="createForm">
      <label>Contrase\xF1a para cifrar la cartera en este ordenador (m\xEDnimo 10 caracteres)
        <input type="password" name="password" autocomplete="new-password" minlength="10" required></label>
      <label>Repite la contrase\xF1a
        <input type="password" name="again" autocomplete="new-password" minlength="10" required></label>
      <button type="submit">Crear la cartera</button>
      <p class="error" id="createError" role="alert"></p>
    </form>
  </section>

  <section id="phrase" hidden>
    <h2>Tu frase de recuperaci\xF3n</h2>
    <p class="warn">Ap\xFAntala en papel ahora. Solo se muestra esta vez. Con ella puedes importar la cartera en MetaMask (Base y BNB Chain) y en Phantom (Solana) para verla. Quien la tenga controla el dinero: no la pegues en ning\xFAn chat, tampoco en el del agente.</p>
    <ol class="words" id="words"></ol>
    <label><span><input type="checkbox" id="saved"> La he apuntado</span></label>
    <div class="row"><button id="phraseDone" disabled>Continuar</button></div>
  </section>

  <section id="unlock" hidden>
    <p id="unlockText">La cartera est\xE1 bloqueada. Escribe tu contrase\xF1a para que el agente pueda usarla.</p>
    <form id="unlockForm">
      <label>Contrase\xF1a <input type="password" name="password" autocomplete="current-password" required></label>
      <button type="submit">Desbloquear</button>
      <p class="error" id="unlockError" role="alert"></p>
    </form>
  </section>

  <section id="wallet" hidden>
    <p class="total" id="total">\u2026</p>
    <p class="lead" id="totalSub"></p>
    <table><tbody id="balances"></tbody></table>
    <h2>Direcciones</h2>
    <div class="addr"><b>Solana</b><code id="solAddr"></code><a id="solLink" target="_blank" rel="noopener">Ver en Solscan</a></div>
    <div class="addr"><b>Base y BNB Chain</b> <span class="lead">(la misma direcci\xF3n en las dos)</span><code id="evmAddr"></code>
      <span><a id="baseLink" target="_blank" rel="noopener">Ver en Basescan</a> \xB7 <a id="bscLink" target="_blank" rel="noopener">Ver en BscScan</a></span></div>
    <p class="lead">Para darle fondos, env\xEDa USDC o USDT (y un poco de SOL, ETH o BNB para el gas) a estas direcciones, por la red correcta.</p>
    <div class="row" id="controls">
      <button class="ghost" id="refresh">Actualizar saldos</button>
      <button class="ghost" id="lock">Bloquear</button>
      <button class="stop" id="stop">Parar todo</button>
    </div>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const post = async (path, body = {}) => {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Error");
  return j;
};
const usd = (n) => n.toLocaleString("es-ES", { style: "currency", currency: "USD" });
const show = (id) => ["create", "phrase", "unlock", "wallet"].forEach((s) => ($(s).hidden = s !== id));

async function load() {
  const s = await (await fetch("/wallet/state")).json();
  if (!s.exists) { $("lead").textContent = "Todav\xEDa no hay cartera."; return show("create"); }
  fillAddresses(s.wallet);
  const status = s.stopped ? '<span class="pill off">parada</span>' : s.unlocked ? '<span class="pill on">desbloqueada</span>' : '<span class="pill">bloqueada</span>';
  $("lead").innerHTML = "Estado: " + status;
  if (!s.unlocked || !s.authed) {
    $("unlockText").textContent = s.unlocked
      ? "La cartera est\xE1 desbloqueada para el agente. Para ver los saldos o pararla desde este navegador, escribe tu contrase\xF1a."
      : s.stopped
        ? "Est\xE1 parada: el agente no puede operar. Escribe tu contrase\xF1a para reanudar."
        : "La cartera est\xE1 bloqueada. Escribe tu contrase\xF1a para que el agente pueda usarla.";
    return show("unlock");
  }
  show("wallet");
  loadBalances();
}
function fillAddresses(w) {
  if (!w) return;
  $("solAddr").textContent = w.solana; $("evmAddr").textContent = w.evm;
  $("solLink").href = "https://solscan.io/account/" + w.solana;
  $("baseLink").href = "https://basescan.org/address/" + w.evm;
  $("bscLink").href = "https://bscscan.com/address/" + w.evm;
}
async function loadBalances() {
  $("total").textContent = "\u2026";
  const b = await (await fetch("/wallet/balances")).json();
  if (b.error) { $("totalSub").textContent = b.error; return; }
  $("total").textContent = usd(b.totalUsd);
  const names = { solana: "Solana", base: "Base", bsc: "BNB Chain" };
  $("totalSub").textContent = Object.entries(b.byChain).map(([c, v]) => names[c] + " " + usd(v)).join(" \xB7 ") +
    (Object.keys(b.errors).length ? " \xB7 sin leer: " + Object.keys(b.errors).map((c) => names[c]).join(", ") : "");
  $("balances").replaceChildren(...b.balances.map((x) => {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td></td><td class='n'></td><td class='n'></td>";
    tr.children[0].textContent = x.symbol + " \xB7 " + names[x.venue];
    tr.children[1].textContent = Number(x.amount.toPrecision(6)).toLocaleString("es-ES");
    tr.children[2].textContent = usd(x.usd);
    return tr;
  }));
}
$("createForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  if (f.get("password") !== f.get("again")) return ($("createError").textContent = "Las contrase\xF1as no coinciden");
  try {
    const r = await post("/wallet/create", { password: f.get("password") });
    e.target.reset();
    fillAddresses(r.wallet);
    $("words").replaceChildren(...r.mnemonic.split(" ").map((w) => Object.assign(document.createElement("li"), { textContent: w })));
    $("lead").textContent = "Cartera creada.";
    show("phrase");
  } catch (err) { $("createError").textContent = err.message; }
});
$("saved").addEventListener("change", (e) => ($("phraseDone").disabled = !e.target.checked));
$("phraseDone").addEventListener("click", () => { $("words").replaceChildren(); load(); });
$("unlockForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { await post("/wallet/unlock", { password: new FormData(e.target).get("password") }); e.target.reset(); $("unlockError").textContent = ""; load(); }
  catch (err) { $("unlockError").textContent = err.message; }
});
$("refresh").addEventListener("click", loadBalances);
$("lock").addEventListener("click", async () => { await post("/wallet/lock"); load(); });
$("stop").addEventListener("click", async () => {
  if (!confirm("\xBFParar todo? El agente no podr\xE1 operar hasta que vuelvas a desbloquear la cartera.")) return;
  await post("/wallet/stop"); load();
});
load();
</script>
</body>
</html>`
);

// src/live/signer/server.ts
var MAX_BODY = 16 * 1024;
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Petici\xF3n demasiado grande"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("JSON no v\xE1lido"));
      }
    });
  });
}
var sameSecret = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function cookieSid(req) {
  const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie ?? "");
  return m ? m[1] : null;
}
function createSignerServer(opts) {
  const state = { accounts: null, stopped: false, sessions: /* @__PURE__ */ new Set(), failedUnlocks: 0, lockedUntil: 0 };
  let origin = "";
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
    res.end(JSON.stringify(body));
  };
  const newSession = () => {
    const sid = randomBytes4(32).toString("hex");
    state.sessions.add(sid);
    return { "set-cookie": `sid=${sid}; HttpOnly; SameSite=Strict; Path=/` };
  };
  const publicState = (authed) => ({
    exists: walletExists(opts.dir),
    unlocked: state.accounts !== null,
    stopped: state.stopped,
    authed,
    wallet: readWalletPublic(opts.dir)
  });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.headers.host !== new URL(origin).host) return send(res, 403, { error: "Host no permitido" });
      if (url.pathname.startsWith("/api/")) {
        const auth = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
        if (!sameSecret(auth, opts.token)) return send(res, 401, { error: "Token no v\xE1lido" });
        if (url.pathname === "/api/status" && req.method === "GET") return send(res, 200, { ...publicState(false), pid: process.pid });
        return send(res, 404, { error: "No existe" });
      }
      if (url.pathname === "/" || url.pathname === "/wallet") {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; frame-ancestors 'none'",
          "x-frame-options": "DENY"
        });
        return res.end(WALLET_PAGE);
      }
      const sid = cookieSid(req);
      const authed = sid !== null && state.sessions.has(sid);
      if (url.pathname === "/wallet/state" && req.method === "GET") return send(res, 200, publicState(authed));
      if (url.pathname === "/wallet/balances" && req.method === "GET") {
        const pub = readWalletPublic(opts.dir);
        return pub ? send(res, 200, await walletBalances(pub)) : send(res, 404, { error: "No hay cartera" });
      }
      if (req.method !== "POST") return send(res, 404, { error: "No existe" });
      if (req.headers.origin !== origin) return send(res, 403, { error: "Origen no permitido" });
      const body = await readBody(req);
      if (url.pathname === "/wallet/create") {
        const { mnemonic, pub } = createWallet(opts.dir, String(body.password ?? ""));
        state.accounts = unlockWallet(opts.dir, String(body.password));
        state.stopped = false;
        return send(res, 200, { mnemonic, wallet: pub }, newSession());
      }
      if (url.pathname === "/wallet/unlock") {
        if (Date.now() < state.lockedUntil) return send(res, 429, { error: "Demasiados intentos. Espera un poco." });
        try {
          state.accounts = unlockWallet(opts.dir, String(body.password ?? ""));
        } catch (err) {
          if (++state.failedUnlocks >= 5) {
            state.lockedUntil = Date.now() + 6e4;
            state.failedUnlocks = 0;
          }
          return send(res, 400, { error: err.message });
        }
        state.failedUnlocks = 0;
        state.stopped = false;
        return send(res, 200, publicState(true), newSession());
      }
      if (!authed) return send(res, 401, { error: "Desbloquea la cartera con tu contrase\xF1a" });
      if (url.pathname === "/wallet/lock" || url.pathname === "/wallet/stop") {
        state.accounts = null;
        state.stopped = url.pathname === "/wallet/stop";
        state.sessions.clear();
        return send(res, 200, publicState(false));
      }
      return send(res, 404, { error: "No existe" });
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  });
  return {
    state,
    server,
    listen: (port = 0) => new Promise(
      (resolve) => server.listen(port, "127.0.0.1", () => {
        const p = server.address().port;
        origin = `http://127.0.0.1:${p}`;
        resolve(p);
      })
    )
  };
}
async function runSigner() {
  const dir = liveDir();
  mkdirSync4(dir, { recursive: true });
  const token2 = randomBytes4(32).toString("hex");
  const signer = createSignerServer({ dir, token: token2 });
  const port = await signer.listen();
  const info = { port, token: token2, pid: process.pid, startedAt: (/* @__PURE__ */ new Date()).toISOString() };
  writeFileSync2(signerInfoFile(), JSON.stringify(info), { mode: 384 });
  const cleanup = () => {
    rmSync2(signerInfoFile(), { force: true });
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  console.error(`Firmante de cryptoagent en http://127.0.0.1:${port}/wallet`);
}

// src/live/signer/main.ts
await runSigner();
