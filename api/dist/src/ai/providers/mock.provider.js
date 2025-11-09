"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockLlmProvider = void 0;
class MockLlmProvider {
    async suggest({ model }) {
        const hasInvoice = (model.entities ?? []).some((e) => e.name === 'Invoice');
        const patch = [];
        if (!hasInvoice) {
            patch.push({
                op: 'add',
                path: '/entities/-',
                value: {
                    name: 'Invoice',
                    attrs: [
                        { name: 'id', type: 'uuid', pk: true },
                        { name: 'total', type: 'decimal(12,2)' },
                    ],
                },
            });
        }
        patch.push({
            op: 'add',
            path: '/relations/-',
            value: {
                from: 'Invoice',
                to: 'Customer',
                kind: 'association',
                fromCard: 'N',
                toCard: '1',
            },
        });
        patch.push({
            op: 'replace',
            path: '/entities[name=User]/attrs[name=id]/type',
            value: 'uuid',
        });
        const rationale = 'Se agrega Invoice y relación con Customer para facturación; se normaliza id de User a uuid.';
        return { rationale, patch };
    }
}
exports.MockLlmProvider = MockLlmProvider;
//# sourceMappingURL=mock.provider.js.map