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
exports.ValidationController = void 0;
const common_1 = require("@nestjs/common");
const guards_1 = require("../auth/guards");
const validation_service_1 = require("./validation.service");
let ValidationController = class ValidationController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    list(projectId) {
        return this.svc.listRuns(projectId);
    }
    get(projectId, runId) {
        return this.svc.getRun(projectId, runId);
    }
    run(projectId, body, req) {
        const userId = req.user.userId;
        return this.svc.run(projectId, body.modelVersionId, userId, body.timeoutMs);
    }
    cancel(projectId, runId, req) {
        const userId = req.user.userId;
        return this.svc.cancel(projectId, runId, userId);
    }
};
exports.ValidationController = ValidationController;
__decorate([
    (0, common_1.Get)('runs'),
    __param(0, (0, common_1.Param)('projectId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ValidationController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('runs/:runId'),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Param)('runId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ValidationController.prototype, "get", null);
__decorate([
    (0, common_1.Post)('runs'),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ValidationController.prototype, "run", null);
__decorate([
    (0, common_1.Post)('runs/:runId/cancel'),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Param)('runId')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ValidationController.prototype, "cancel", null);
exports.ValidationController = ValidationController = __decorate([
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    (0, common_1.Controller)('projects/:projectId/validation'),
    __metadata("design:paramtypes", [validation_service_1.ValidationService])
], ValidationController);
//# sourceMappingURL=validation.controller.js.map