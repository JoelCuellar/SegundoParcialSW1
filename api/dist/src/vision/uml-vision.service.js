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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var UmlVisionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UmlVisionService = void 0;
const common_1 = require("@nestjs/common");
const Tesseract = __importStar(require("tesseract.js"));
const sharp_1 = __importDefault(require("sharp"));
function looksLikeMethod(line) {
    const L = line.trim();
    return /[A-Za-z_]\w*\s*\(.*\)/.test(L);
}
function parseAttributeLine(line) {
    const L = line.replace(/\s+/g, ' ').trim();
    if (!L)
        return null;
    if (looksLikeMethod(L))
        return null;
    const m = L.match(/^([+\-#~])?\s*([A-Za-z_][\w$]*\*?)\s*(?::\s*([^=<{]+(?:<[^>]+>)?(?:\[\])?|\S+))?\s*(?:=\s*[^{}]+)?\s*(?:\{([^}]*)\})?$/i);
    if (!m)
        return null;
    const [, vis, rawName, rawType, flagsRaw] = m;
    const name = (rawName ?? '').replace(/\*+$/, '');
    let type = (rawType ?? 'any').trim();
    let nullable = /\?$/.test(type);
    type = type.replace(/\?$/, '');
    const flags = (flagsRaw || '').toLowerCase();
    const attr = {
        name,
        type,
        visibility: vis || undefined,
        pk: /\bpk\b/.test(flags) || /\*$/.test(rawName || ''),
        unique: /\bunique\b/.test(flags),
        nullable: nullable || /\bnull(?:able)?\b/.test(flags),
    };
    attr.type = attr.type.replace(/\s+/g, ' ').trim();
    if (!attr.name)
        return null;
    return attr;
}
function parseAttributesFromBlock(block) {
    const attrs = [];
    const lines = block
        .split(/\r?\n/)
        .map((s) => s.replace(/[│┃|]+/g, ' ').trim())
        .filter((s) => !!s && !/^(-{2,}|={2,}|_+)$/.test(s))
        .filter((s) => !/^(atributos|attributes|propiedades|properties)\b/i.test(s));
    for (const line of lines) {
        const parsed = parseAttributeLine(line);
        if (parsed)
            attrs.push(parsed);
    }
    const dedup = new Map();
    for (const a of attrs) {
        const key = a.name.toLowerCase();
        if (!dedup.has(key))
            dedup.set(key, a);
    }
    return [...dedup.values()];
}
function extractStereotype(line) {
    const trimmed = line.trim();
    const m1 = trimmed.match(/^<<\s*([^>]+)\s*>>$/i);
    if (m1)
        return m1[1].trim();
    const m2 = trimmed.match(/^«\s*([^»]+)\s*»$/i);
    if (m2)
        return m2[1].trim();
    return '';
}
let UmlVisionService = UmlVisionService_1 = class UmlVisionService {
    logger = new common_1.Logger(UmlVisionService_1.name);
    normalizeOcr(raw) {
        return (raw || '')
            .replace(/[–—−]/g, '-')
            .replace(/[•·]/g, '.')
            .replace(/[→➔➤➝➛➜]/g, '>')
            .replace(/\u00A0/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }
    parseCardinality(raw) {
        if (!raw)
            return undefined;
        const t = raw.replace(/\s/g, '').toLowerCase();
        if (t === '*' || t === 'n')
            return 'N';
        if (/^\d+$/.test(t))
            return t;
        if (/^\d+\.\.\d+$/i.test(t))
            return t;
        if (/^\d+\.\.[*n]$/i.test(t))
            return t.replace(/[*n]$/i, 'N');
        if (/^[*n]\.\.\d+$/i.test(t))
            return 'N..' + t.split('..')[1];
        return undefined;
    }
    extractRelationsFromOcr(ocrText, entityNames) {
        const txt = this.normalizeOcr(ocrText);
        const names = new Set(entityNames);
        const relations = [];
        const NAME = '([A-Za-z_][A-Za-z0-9_]*)';
        const CARD_OPT = '(?:\\s*(?:\\[\\s*([0-9\\*nN.\\s]+)\\s*\\]|([0-9\\*nN.\\s]{1,6})))?';
        const patterns = [
            {
                re: new RegExp(`${NAME}${CARD_OPT}\\s*(?:\\.{2}|-){2}\\|>\\s*${NAME}${CARD_OPT}`, 'g'),
                kind: 'generalization',
            },
            {
                re: new RegExp(`${NAME}${CARD_OPT}\\s*\\.{2}\\|>\\s*${NAME}${CARD_OPT}`, 'g'),
                kind: 'realization',
            },
            {
                re: new RegExp(`${NAME}${CARD_OPT}\\s*o--\\s*${NAME}${CARD_OPT}`, 'g'),
                kind: 'aggregation',
            },
            {
                re: new RegExp(`${NAME}${CARD_OPT}\\s*\\*--\\s*${NAME}${CARD_OPT}`, 'g'),
                kind: 'composition',
            },
            {
                re: new RegExp(`${NAME}${CARD_OPT}\\s*\\.{2}>\\s*${NAME}${CARD_OPT}`, 'g'),
                kind: 'dependency',
            },
            {
                re: new RegExp(`${NAME}${CARD_OPT}\\s*--\\s*${NAME}${CARD_OPT}`, 'g'),
                kind: 'association',
            },
        ];
        const pushUnique = (r) => {
            const exists = relations.some((x) => x.from === r.from &&
                x.to === r.to &&
                x.kind === r.kind &&
                (x.fromCard ?? '') === (r.fromCard ?? '') &&
                (x.toCard ?? '') === (r.toCard ?? '') &&
                (x.via ?? '') === (r.via ?? ''));
            if (!exists)
                relations.push(r);
        };
        for (const { re, kind } of patterns) {
            let m;
            while ((m = re.exec(txt)) !== null) {
                const from = m[1];
                const to = m[4];
                if (!names.has(from) || !names.has(to))
                    continue;
                const fromCard = this.parseCardinality(m[2] || m[3]);
                const toCard = this.parseCardinality(m[5] || m[6]);
                pushUnique({ from, to, kind, fromCard, toCard });
            }
        }
        const tri = new RegExp(`${NAME}\\s*--\\s*${NAME}\\s*--\\s*${NAME}`, 'g');
        let t;
        while ((t = tri.exec(txt)) !== null) {
            const a = t[1], mid = t[2], b = t[3];
            if (!names.has(a) || !names.has(mid) || !names.has(b))
                continue;
            pushUnique({ from: a, to: b, kind: 'association', via: mid });
        }
        return relations;
    }
    async parseImage(buffer) {
        const pre = await (0, sharp_1.default)(buffer)
            .grayscale()
            .normalize()
            .sharpen()
            .toFormat('png')
            .toBuffer();
        const { data } = await Tesseract.recognize(pre, 'eng+spa', {
            logger: (m) => {
                const p = typeof m?.progress === 'number' ? Math.round(m.progress * 100) : 0;
                this.logger.debug(`${m?.status ?? 'ocr'}: ${p}%`);
            },
        });
        const ocrText = (data?.text || '').replace(/\r/g, '').trim();
        const dsl = this.textToDsl(ocrText);
        return {
            dsl,
            ocrText,
            stats: {
                symbols: ocrText.length,
                lines: ocrText.split('\n').length,
                entities: dsl.entities.length,
                relations: dsl.relations.length,
            },
        };
    }
    textToDsl(text) {
        const blocks = text
            .split(/\n{2,}|(?:\-{3,}|\={3,})\n/)
            .map((b) => b.trim())
            .filter(Boolean);
        const entities = [];
        for (const b of blocks) {
            const lines = b
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean);
            if (!lines.length)
                continue;
            const stereotype = extractStereotype(lines[0]);
            const nameLineIdx = stereotype ? 1 : 0;
            const rawName = (lines[nameLineIdx] || '').replace(/\s+/g, ' ').trim();
            if (!/^[A-Za-z_][\w\s]*$/.test(rawName) || rawName.length > 80)
                continue;
            const className = rawName.replace(/\s{2,}/g, ' ').trim();
            const lowerAll = [stereotype, ...lines.slice(0, nameLineIdx + 1)]
                .join(' ')
                .toLowerCase();
            const isInterface = /(^|[\s«<])interface([»>]|$)/i.test(stereotype || '') ||
                /\binterface\b/.test(lowerAll);
            const isAbstract = /(^|[\s«<])abstract([»>]|$)/i.test(stereotype || '') ||
                /\babstract\b/.test(lowerAll);
            const attrsBlock = lines.slice(nameLineIdx + 1).join('\n');
            const parsedAttrs = parseAttributesFromBlock(attrsBlock);
            const mappedAttrs = parsedAttrs.map((a) => ({
                name: a.name,
                type: a.type,
                pk: !!a.pk,
                unique: !!a.unique,
                nullable: !!a.nullable,
            }));
            const existing = entities.find((e) => e.name.toLowerCase() === className.toLowerCase());
            if (existing) {
                existing.stereotype ||= stereotype || undefined;
                existing.isInterface ||= isInterface || undefined;
                existing.isAbstract ||= isAbstract || undefined;
                for (const a of mappedAttrs) {
                    if (!existing.attrs.some((x) => x.name.toLowerCase() === a.name.toLowerCase())) {
                        existing.attrs.push(a);
                    }
                }
            }
            else {
                entities.push({
                    name: className,
                    stereotype: stereotype || undefined,
                    isInterface: isInterface || undefined,
                    isAbstract: isAbstract || undefined,
                    attrs: mappedAttrs,
                });
            }
        }
        const entityNames = entities.map((e) => e.name);
        const relations = this.extractRelationsFromOcr(text, entityNames);
        return { entities, relations, constraints: [] };
    }
};
exports.UmlVisionService = UmlVisionService;
exports.UmlVisionService = UmlVisionService = UmlVisionService_1 = __decorate([
    (0, common_1.Injectable)()
], UmlVisionService);
//# sourceMappingURL=uml-vision.service.js.map