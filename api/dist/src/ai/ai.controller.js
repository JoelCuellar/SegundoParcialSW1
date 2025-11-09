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
exports.AiController = void 0;
const common_1 = require("@nestjs/common");
const guards_1 = require("../auth/guards");
const ai_service_1 = require("./ai.service");
let AiController = class AiController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    list(projectId) {
        return this.svc.list(projectId);
    }
    request(projectId, body, req) {
        const userId = req.user.userId;
        return this.svc.request(projectId, body.modelVersionId, userId, body.scope, body.promptHints);
    }
    apply(projectId, sid, body, req) {
        const userId = req.user.userId;
        return this.svc.apply(projectId, sid, userId, body.includePaths);
    }
    reject(projectId, sid, req) {
        const userId = req.user.userId;
        return this.svc.reject(projectId, sid, userId);
    }
};
exports.AiController = AiController;
__decorate([
    (0, common_1.Get)('suggestions'),
    __param(0, (0, common_1.Param)('projectId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('suggestions'),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "request", null);
__decorate([
    (0, common_1.Post)('suggestions/:sid/apply'),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Param)('sid')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "apply", null);
__decorate([
    (0, common_1.Post)('suggestions/:sid/reject'),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Param)('sid')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "reject", null);
exports.AiController = AiController = __decorate([
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    (0, common_1.Controller)('projects/:projectId/ai'),
    __metadata("design:paramtypes", [ai_service_1.AiService])
], AiController);
//# sourceMappingURL=ai.controller.js.map