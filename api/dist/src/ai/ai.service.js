"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const json_patch_selectors_1 = require("../common/json-patch-selectors");
let AiService = class AiService {
    prisma;
    llm;
    constructor(prisma, llm) {
        this.prisma = prisma;
        this.llm = llm;
    }
    list(projectId) {
        return this.prisma.aiSuggestion.findMany({
            where: { projectId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async request(projectId, modelVersionId, userId, scope, promptHints) {
        const base = await this.prisma.modelVersion.findFirst({
            where: { id: modelVersionId, projectId },
        });
        if (!base)
            throw new common_1.NotFoundException('ModelVersion no existe');
        const { rationale, patch } = await this.llm.suggest({
            model: base.content,
            scope,
            promptHints,
        });
        const sug = await this.prisma.aiSuggestion.create({
            data: {
                projectId,
                modelVersionId,
                requestedById: userId,
                status: 'PENDING',
                rationale,
                proposedPatch: patch,
            },
        });
        const preview = (0, json_patch_selectors_1.applyNamedJsonPatch)(base.content, Array.isArray(patch) ? patch : []);
        return {
            suggestion: sug,
            previewDiff: { from: base.content, to: preview },
        };
    }
    async apply(projectId, sid, userId, includePaths) {
        const sug = await this.prisma.aiSuggestion.findFirst({
            where: { id: sid, projectId },
        });
        if (!sug)
            throw new common_1.NotFoundException('Sugerencia no existe');
        const base = await this.prisma.modelVersion.findFirst({
            where: { id: sug.modelVersionId },
        });
        if (!base)
            throw new common_1.NotFoundException('ModelVersion base no existe');
        let patch = Array.isArray(sug.proposedPatch)
            ? sug.proposedPatch
            : legacyToPatch(sug.proposedPatch);
        if (includePaths?.length) {
            const set = new Set(includePaths);
            patch = patch.filter((op) => set.has(op.path) || [...set].some((p) => op.path.startsWith(p + '/')));
        }
        const appliedModel = (0, json_patch_selectors_1.applyNamedJsonPatch)(base.content, patch);
        const newVersion = await this.prisma.modelVersion.create({
            data: {
                projectId,
                branchId: base.branchId,
                parentVersionId: base.id,
                authorId: userId,
                message: `Apply AI suggestion ${sid}${includePaths?.length ? ' (partial)' : ''}`,
                content: appliedModel,
            },
        });
        await this.prisma.aiSuggestion.update({
            where: { id: sid },
            data: {
                status: 'APPLIED',
                appliedById: userId,
                appliedVersionId: newVersion.id,
            },
        });
        await this.prisma.auditLog.create({
            data: {
                projectId,
                actorId: userId,
                action: 'AI_SUGGESTION_APPLY',
                targetType: 'ModelVersion',
                targetId: newVersion.id,
                metadata: {
                    suggestionId: sid,
                    baseVersionId: base.id,
                    includePaths: includePaths ?? 'ALL',
                },
            },
        });
        return { appliedVersionId: newVersion.id };
    }
    async reject(projectId, sid, userId) {
        await this.prisma.aiSuggestion.update({
            where: { id: sid },
            data: { status: 'REJECTED' },
        });
        await this.prisma.auditLog.create({
            data: {
                projectId,
                actorId: userId,
                action: 'AI_SUGGESTION_REJECT',
                targetType: 'AiSuggestion',
                targetId: sid,
            },
        });
        return { status: 'REJECTED' };
    }
};
exports.AiService = AiService;
exports.AiService = AiService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)('LlmProvider')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object])
], AiService);
function legacyToPatch(proposed) {
    const ops = [];
    if (proposed?.addEntity) {
        ops.push({
            op: 'add',
            path: '/entities/-',
            value: {
                name: proposed.addEntity,
                attrs: [{ name: 'id', type: 'uuid', pk: true }],
            },
        });
    }
    if (proposed?.addRelation) {
        const [from, to] = String(proposed.addRelation).split('→');
        ops.push({
            op: 'add',
            path: '/relations/-',
            value: { from, to, kind: 'association', fromCard: 'N', toCard: '1' },
        });
    }
    if (proposed?.addAttr) {
        const [cls, attr] = String(proposed.addAttr).split('.');
        ops.push({
            op: 'add',
            path: `/entities[name=${cls}]/attrs/-`,
            value: { name: attr, type: 'string' },
        });
    }
    return ops;
}
//# sourceMappingURL=ai.service.js.map