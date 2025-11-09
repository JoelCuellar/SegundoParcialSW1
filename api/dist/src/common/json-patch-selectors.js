"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyNamedJsonPatch = applyNamedJsonPatch;
const rfc6902 = __importStar(require("fast-json-patch"));
function applyNamedJsonPatch(model, patch) {
    const clone = JSON.parse(JSON.stringify(model));
    const resolved = patch.map((op) => ({
        ...op,
        path: resolvePath(clone, op.path),
    }));
    const res = rfc6902.applyPatch(clone, resolved, false, false);
    return res.newDocument;
}
function resolvePath(doc, path) {
    if (!path?.includes('['))
        return path;
    const segments = path.split('/').filter(Boolean);
    const real = [''];
    let cursor = doc;
    for (const seg of segments) {
        const m = seg.match(/^([a-zA-Z0-9_-]+)(\[.+\])?$/);
        if (!m) {
            real.push(seg);
            continue;
        }
        const key = m[1];
        const filt = m[2];
        if (!filt) {
            cursor = cursor?.[key];
            real.push(key);
            continue;
        }
        const filters = Array.from(filt.matchAll(/\[([a-zA-Z0-9_-]+)=([^\]]+)\]/g)).map((g) => ({ k: g[1], v: stripQuotes(g[2]) }));
        const arr = cursor?.[key];
        if (!Array.isArray(arr))
            throw new Error(`Esperaba array en "${key}" para selector "${seg}"`);
        const idx = arr.findIndex((it) => filters.every((f) => (it?.[f.k] ?? '') === f.v));
        if (idx < 0)
            throw new Error(`No encontrado "${seg}" en ruta "${path}"`);
        real.push(key, String(idx));
        cursor = arr[idx];
    }
    return real.join('/');
}
function stripQuotes(s) {
    return s.replace(/^['"]|['"]$/g, '');
}
//# sourceMappingURL=json-patch-selectors.js.map