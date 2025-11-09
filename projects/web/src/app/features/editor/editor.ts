// src/app/features/editor/model-editor.component.ts
import {
  Component,
  type OnDestroy,
  type OnInit,
  ViewChild,
  type ElementRef,
  inject,
  signal,
  effect,
  runInInjectionContext,
  EnvironmentInjector,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, type FormArray, FormBuilder, Validators } from '@angular/forms';
import * as go from 'gojs';
import debounce from 'lodash-es/debounce';
import { ModelsApiService } from '../../core/services/models-api';
import { ActivatedRoute } from '@angular/router';
import { HeaderComponent } from '../../shared/components/header/header';
import { CardComponent } from '../../shared/components/card/card';
import { FormFieldComponent } from '../../shared/components/form-field/form-field';
import { RealtimeService } from '../../core/services/realtime';
import { UmlImportApi } from '../../core/services/uml-import-api';

type EntityAttr = {
  name: string;
  type: string;
  pk?: boolean;
  unique?: boolean;
  nullable?: boolean;
};
type Key = string | number;
type Entity = {
  key?: Key;
  name: string;
  stereotype?: string;
  isInterface?: boolean;
  isAbstract?: boolean;
  attrs: EntityAttr[];
};
type Relation = {
  from: Key;
  to: Key;
  kind:
    | 'association'
    | 'aggregation'
    | 'composition'
    | 'generalization'
    | 'realization'
    | 'dependency'
    | 'inheritance';
  via?: string;
  fromCard?: string;
  toCard?: string;
};
type DSL = { entities: Entity[]; relations: Relation[]; constraints?: any[] };
function normalizeKind(
  k: string
): 'association' | 'aggregation' | 'composition' | 'generalization' | 'realization' | 'dependency' {
  const kk = (k || '').toLowerCase();
  if (kk === 'inheritance') return 'generalization';
  return kk as any;
}
@Component({
  selector: 'app-model-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HeaderComponent, CardComponent, FormFieldComponent],
  templateUrl: './editor.html',
  styleUrls: ['./editor.scss'],
})
export class ModelEditorComponent implements OnInit, OnDestroy {
  @ViewChild('diagramDiv', { static: true }) diagramRef!: ElementRef<HTMLDivElement>;
  private route = inject(ActivatedRoute);
  private api = inject(ModelsApiService);
  private fb = inject(FormBuilder);

  private diagram!: go.Diagram;
  private modelChangedListener?: (e: go.ChangedEvent) => void;
  private selectionChangedHandler?: (e: go.DiagramEvent) => void;
  private linkDrawnHandler?: (e: go.DiagramEvent) => void;

  projectId = signal<string>('');
  branchId = signal<string | undefined>(undefined);
  status = signal<string>('Listo');
  selectedType = signal<'node' | 'link' | null>(null);
  private selectedNodeData?: any;
  private selectedLinkData?: any;

  constructor(private realtime: RealtimeService) {}

  private remoteOff?: () => void;
  private applyingRemote = false;
  private env = inject(EnvironmentInjector);
  private umlApi = inject(UmlImportApi);

  // Forms
  nodeForm = this.fb.group({
    name: ['', Validators.required],
    stereotype: [''],
    isInterface: [false],
    isAbstract: [false],
    attrs: this.fb.array(this.makeAttrArray([])),
  });
  linkForm = this.fb.group({
    kind: ['association', Validators.required],
    fromCard: ['N'],
    toCard: ['1'],
  });
  relationForm = this.fb.group({
    from: ['', Validators.required], // nombre de clase origen
    to: ['', Validators.required], // nombre de clase destino
    kind: ['association', Validators.required],
    fromCard: ['N'],
    toCard: ['1'],
  });
  get entityNames(): string[] {
    const m = this.glm();
    return (m.nodeDataArray as any[])
      .map((n) => n.name)
      .filter(Boolean)
      .sort((a: string, b: string) => a.localeCompare(b));
  }

  private findNodeByName(name: string): any | undefined {
    const m = this.glm();
    return (m.nodeDataArray as any[]).find((n) => (n.name || '').trim() === name.trim());
  }

  // NEW: extraemos la lógica de “si es N–N, crear tabla intermedia”
  private expandManyToManyIfNeeded(linkData: Relation) {
    const m = this.glm();
    const fromNode = m.findNodeDataForKey(linkData.from) as any;
    const toNode = m.findNodeDataForKey(linkData.to) as any;
    if (!fromNode || !toNode) return;

    const fromCard = (linkData.fromCard ?? 'N').toUpperCase();
    const toCard = (linkData.toCard ?? '1').toUpperCase();
    const hasN = (c: string) => (c || '').toUpperCase().includes('N');

    const k = normalizeKind(linkData.kind as any);
    const isAssocish = k === 'association' || k === 'aggregation' || k === 'composition';

    if (isAssocish && hasN(fromCard) && hasN(toCard)) {
      // 👉 En vez de partir la relación, referenciamos la "association class"
      this.attachJoinRef(linkData); // crea (si falta) la tabla intermedia y la línea punteada
      this.status.set('Se vinculó tabla intermedia (Association Class) para relación M:N');
    }
  }
  onUmlImageSelected(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  this.status.set('Importando imagen UML…');
  this.umlApi.import(this.projectId(), file, {
    branchId: this.branchId(),
    merge: 'merge', // usa 'replace' si quieres reemplazar
    message: 'import: imagen UML',
  }).subscribe({
    next: () => {
      // Recargar contenido desde la versión más reciente de la rama actual
      this.api.getCurrent(this.projectId(), this.branchId()).subscribe({
        next: (res) => {
          this.fromDSL(res.content as any);
          this.layout(); // opcional: reordenar
          this.status.set('Importación completada');
        },
        error: (e) => this.status.set(e?.error?.message ?? 'Error al recargar'),
      });
    },
    error: (e) => this.status.set(e?.error?.message ?? 'Error al importar'),
  });

  // Permitir volver a elegir el mismo archivo
  input.value = '';
}

  // NEW: crear relación desde el formulario
  createRelationFromForm() {
    const { from, to, kind, fromCard, toCard } = this.relationForm.value;
    if (!from || !to) return;
    if (from.trim() === to.trim()) {
      const k = String(kind || '').toLowerCase();
      if (k === 'composition' || k === 'generalization') {
        this.status.set(
          `El tipo "${k}" no puede ser reflexivo (A→A). Usa "association" o "aggregation".`
        );
        return;
      }
    }

    const A = this.findNodeByName(from);
    const B = this.findNodeByName(to);
    if (!A || !B) {
      this.status.set('Clase origen o destino no existe');
      return;
    }

    const m = this.glm();
    const kk = normalizeKind(kind as string);

    // evitar duplicados de lazo entre A y B
    if (A.key === B.key && (kk === 'composition' || kk === 'generalization')) {
      this.status.set(`"${kk}" no puede ser reflexiva (A→A). Usa association/aggregation.`);
      return;
    }

    // Bloquear sólo duplicado exacto:
    if (this.isDuplicateExact(m, A.key as Key, B.key as Key, kk, fromCard ?? 'N', toCard ?? '1')) {
      this.status.set('Ya existe una relación idéntica entre esas clases.');
      return;
    }

    // generalization/realization/dependency NO usan cardinalidades
    const useCards = kk === 'association' || kk === 'aggregation' || kk === 'composition';
    const data: any = {
      key: (this.diagram.model as go.GraphLinksModel).makeUniqueLinkKeyFunction!(
        this.diagram.model as go.GraphLinksModel,
        {}
      ),
      from: A.key as Key,
      to: B.key as Key,
      kind: kk,
      ...(useCards ? { fromCard: fromCard ?? 'N', toCard: toCard ?? '1' } : {}),
      labelKeys: [] as go.Key[],
    };

    this.diagram.startTransaction('new-relation');
    m.addLinkData(data);
    this.diagram.commitTransaction('new-relation');

    // si corresponde, expandir a N–N con tabla intermedia
    this.expandManyToManyIfNeeded(data);
    this.status.set('Relación creada');
    this.relationForm.reset({ from: '', to: '', kind: 'association', fromCard: 'N', toCard: '1' });
  }

  ngOnInit() {
    this.projectId.set(this.route.snapshot.paramMap.get('projectId')!);
    this.initDiagram();
    this.load();
    const token = localStorage.getItem('token')!;
    this.realtime.connectWithToken(token);

    // Log de depuración: ver a qué room te uniste
    this.realtime.onJoined((info) => console.log('[WS] joined', info.room));

    // Efecto: cuando hay conexión y ya tenemos ids => join (y re-join si cambia branch)
    runInInjectionContext(this.env, () => {
      effect(() => {
        if (!this.realtime.connected()) return;
        const pid = this.projectId();
        const bid = this.branchId();
        if (!pid) return;
        // Si no hay branch aún, también join al room del proyecto.
        this.realtime.join({ projectId: pid });
        if (bid) this.realtime.join({ projectId: pid, branchId: bid });
      });
      this.realtime.onJoined((info) => console.log('[WS] joined', info.room));
      // Listener de parches entrantes
      this.remoteOff = this.realtime.onPatch(({ patch }) => {
        console.log('[WS] patch recibido', patch);
        if (patch) this.applyRemotePatch(patch);
      });
    });
  }
  ngOnDestroy() {
    this.remoteOff?.();
    if (this.diagram) {
      if (this.modelChangedListener) {
        (this.diagram.model as go.Model).removeChangedListener(this.modelChangedListener);
      }
      if (this.selectionChangedHandler) {
        this.diagram.removeDiagramListener('ChangedSelection', this.selectionChangedHandler);
      }
      if (this.linkDrawnHandler) {
        this.diagram.removeDiagramListener('LinkDrawn', this.linkDrawnHandler);
      }
      this.diagram.div = null;
    }
  }

  private bindAutosaveAndRealtime(model: go.GraphLinksModel) {
    const doAutosave = debounce(() => this.save('auto-save'), 800);
    const doBroadcast = debounce(() => {
      const patch = this.serializeModel();
      this.realtime.sendPatch({ projectId: this.projectId(), branchId: this.branchId(), patch });
    }, 250);

    this.modelChangedListener = (e) => {
      if (e.isTransactionFinished) {
        if (!this.applyingRemote) {
          doBroadcast();
          this.status.set('Cambios pendientes…');
          doAutosave();
        }
      }
    };
    model.addChangedListener(this.modelChangedListener);
  }

  private serializeModel() {
    const m = this.glm();
    // MVP: reemplazo completo (nodos + enlaces)
    return {
      nodeDataArray: m.nodeDataArray as any[],
      linkDataArray: m.linkDataArray as any[],
    };
  }

  private glm(): go.GraphLinksModel {
    return this.diagram.model as go.GraphLinksModel;
  }

  private ensureLabelNodeForLink(linkData: any): go.Key {
    const m = this.diagram.model as go.GraphLinksModel;

    // Asegura que el link tenga key
    if (!linkData.key) {
      const mk = (m as any).makeUniqueLinkKeyFunction as (mm: go.GraphLinksModel, d: any) => go.Key;
      const newKey = typeof mk === 'function' ? mk(m, linkData) : `L:${crypto.randomUUID()}`;
      m.setDataProperty(linkData, 'key', newKey);
    }

    // ¿ya hay label asociado?
    const existing: (go.Key | undefined)[] = m.getLabelKeysForLinkData(linkData) ?? [];
    const safe = existing.filter((k): k is go.Key => k !== undefined);

    if (safe.length > 0) return safe[0];

    // crear label node
    const labelKey = `lbl:${String(linkData.key)}` as go.Key;
    m.addNodeData({ key: labelKey, category: 'LinkLabel' });

    // vincularlo correctamente
    m.setLabelKeysForLinkData(linkData, [labelKey]);
    return labelKey;
  }

  private ensureJoinNodeFor(linkData: any): go.Key {
    const m = this.diagram.model as go.GraphLinksModel;
    const fromNode = m.findNodeDataForKey(linkData.from) as any;
    const toNode = m.findNodeDataForKey(linkData.to) as any;
    const name = this.mkJoinName(fromNode.name, toNode.name);

    const byKey = m.findNodeDataForKey(name) as any | undefined;
    const byName = (m.nodeDataArray as any[]).find((n: any) => n.name === name);

    if (byKey) return name as go.Key; // existe con key = name
    if (byName) return byName.key as go.Key; // existe con key distinto

    // no existe → crear con key = name
    const newNode = {
      key: name as go.Key,
      name,
      attrs: [
        { name: this.fkName(fromNode.name), type: 'uuid', pk: true },
        { name: this.fkName(toNode.name), type: 'uuid', pk: true },
      ],
    };
    m.addNodeData(newNode);
    return newNode.key as go.Key;
  }

  private attachJoinRef(linkData: any) {
    const m = this.diagram.model as go.GraphLinksModel;
    this.diagram.startTransaction('attach-joinref');

    const joinKey = this.ensureJoinNodeFor(linkData); // ✅ key real (no solo name)
    const labelKey = this.ensureLabelNodeForLink(linkData); // ✅ garantiza key y label

    // marca la via en el link principal
    m.setDataProperty(
      linkData,
      'via',
      (m.findNodeDataForKey(joinKey) as any)?.name ?? String(joinKey)
    );

    // crea línea punteada (si falta)
    const already = (m.linkDataArray as any[]).some(
      (l) => l.isJoinRef && l.from === labelKey && l.to === joinKey
    );
    if (!already) {
      m.addLinkData({ from: labelKey, to: joinKey, isJoinRef: true, labelKeys: [] as go.Key[] });
    }

    this.diagram.commitTransaction('attach-joinref');
  }
  private isDuplicateExact(
    m: go.GraphLinksModel,
    fromKey: Key,
    toKey: Key,
    kind: string,
    fromCard?: string,
    toCard?: string
  ): boolean {
    const k = normalizeKind(kind as any);
    const undirected = k === 'association' || k === 'aggregation' || k === 'composition';

    const S = (x: Key) => String(x);
    const canon = (a: Key, b: Key, fc?: string, tc?: string) => {
      if (undirected && S(a) > S(b)) return { a: b, b: a, fc: tc, tc: fc };
      return { a, b, fc, tc };
    };

    const target = canon(fromKey, toKey, fromCard, toCard);

    return (m.linkDataArray as any[]).some((l: any) => {
      if (l.isJoinRef) return false; // la línea punteada auxiliar no cuenta
      const lk = normalizeKind((l.kind ?? 'association') as any);
      if (lk !== k) return false;

      const C = canon(l.from, l.to, l.fromCard, l.toCard);

      // En no dirigidos, también comparamos cardinalidades (para que 1..N y N..1 no se mezclen por dirección)
      const sameEnds = S(C.a) === S(target.a) && S(C.b) === S(target.b);
      if (!sameEnds) return false;

      if (!undirected) return true; // en dirigidos, mismo tipo + mismos extremos ya es duplicado exacto

      const cf = String(C.fc ?? '');
      const ct = String(C.tc ?? '');
      const tf = String(target.fc ?? '');
      const tt = String(target.tc ?? '');

      return cf === tf && ct === tt;
    });
  }

  private detachJoinRef(linkData: any) {
    const m = this.diagram.model as go.GraphLinksModel;

    this.diagram.startTransaction('detach-joinref');
    try {
      // Asegura arreglo de go.Key sin undefined
      const raw = m.getLabelKeysForLinkData(linkData) as Array<go.Key | undefined> | null;
      const labelKeys: go.Key[] = Array.isArray(raw)
        ? raw.filter((k): k is go.Key => k !== undefined)
        : [];

      const via: string | undefined = (linkData as any).via;

      // 1) Remueve links punteados (join-ref)
      if (via && labelKeys.length) {
        const toRemove = (m.linkDataArray as any[]).filter(
          (l) => l.isJoinRef && labelKeys.includes(l.from as go.Key) && l.to === via
        );
        for (const l of toRemove) m.removeLinkData(l);
      }

      // 2) Remueve los label nodes
      for (const k of labelKeys) {
        const lab = m.findNodeDataForKey(k);
        if (lab) m.removeNodeData(lab);
      }

      // 3) Deja labelKeys en array vacío (no undefined)
      m.setLabelKeysForLinkData(linkData, [] as go.Key[]);

      // 4) Limpia metadatos propios
      m.setDataProperty(linkData, 'via', undefined);
    } finally {
      this.diagram.commitTransaction('detach-joinref');
    }
  }

  private applyRemotePatch(patch: { nodeDataArray: any[]; linkDataArray: any[] }) {
    const m = this.glm();
    this.applyingRemote = true; // no dispares autosave/broadcast
    m.startTransaction('remote');
    // Reemplazo completo; mantiene claves y bindings
    m.nodeDataArray = patch.nodeDataArray ?? [];
    m.linkDataArray = patch.linkDataArray ?? [];
    m.commitTransaction('remote');
    setTimeout(() => (this.applyingRemote = false), 50);
  }

  attrsFA(): FormArray {
    return this.nodeForm.get('attrs') as FormArray;
  }
  private makeAttrArray(items: EntityAttr[]) {
    return items.map((a) =>
      this.fb.group({
        name: [a.name, Validators.required],
        type: [a.type || 'string', Validators.required],
        pk: [!!a.pk],
        unique: [!!a.unique],
        nullable: [!!a.nullable],
      })
    );
  }

  // ---------------- Diagram setup
  private initDiagram() {
    const $ = go.GraphObject.make;
    const diag = $(go.Diagram, this.diagramRef.nativeElement, {
      'undoManager.isEnabled': true,
      'grid.visible': true,
      'grid.gridCellSize': new go.Size(10, 10),
      'draggingTool.isGridSnapEnabled': true,
      'resizingTool.isGridSnapEnabled': true,
      'toolManager.mouseWheelBehavior': go.ToolManager.WheelZoom,
      initialContentAlignment: go.Spot.Center,
      layout: $(go.LayeredDigraphLayout, { layerSpacing: 50, columnSpacing: 20 }),
    });

    // Regla: no lazos A→A y no duplicados
    diag.toolManager.linkingTool.archetypeLinkData = {
      kind: 'association',
      fromCard: 'N',
      toCard: '1',
    };
    diag.toolManager.linkingTool.linkValidation = (fromnode, _fp, tonode, _tp, _link) => {
      if (!fromnode || !tonode) return false;

      const fromKey = fromnode.data.key as string;
      const toKey = tonode.data.key as string;

      const m = diag.model as go.GraphLinksModel;

      // Evitar duplicados (incluye self-links):
      const currentKind = String(this.linkForm?.value?.kind ?? 'association').toLowerCase();
      const currentFromCard = String(this.linkForm?.value?.fromCard ?? 'N');
      const currentToCard = String(this.linkForm?.value?.toCard ?? '1');

      return !this.isDuplicateExact(m, fromKey, toKey, currentKind, currentFromCard, currentToCard);
    };

    // Atributos (item template)… igual que antes (omito por brevedad)
    const attrTemplate = $(
      go.Panel,
      'TableRow',
      new go.Binding('portId', 'name'),
      $(
        go.Shape,
        'Rectangle',
        { column: 0, width: 8, height: 8, strokeWidth: 0, margin: 2 },
        new go.Binding('fill', '', (a: any) =>
          a.pk ? '#111827' : a.unique ? '#6b7280' : '#e5e7eb'
        )
      ),
      $(
        go.TextBlock,
        { column: 1, editable: true, margin: new go.Margin(2, 4, 2, 2) },
        new go.Binding('text', 'name').makeTwoWay()
      ),
      $(
        go.TextBlock,
        { column: 2, editable: true, margin: new go.Margin(2, 4, 2, 2), stroke: '#6b7280' },
        new go.Binding('text', 'type').makeTwoWay()
      )
    );

    // Clase (nodeTemplate)
    diag.nodeTemplate = $(
      go.Node,
      'Auto',
      { locationSpot: go.Spot.Center, resizable: true },
      $(go.Shape, 'RoundedRectangle', {
        fill: '#fff',
        stroke: '#d1d5db',
        strokeWidth: 1,
        parameter1: 8,
        portId: '',
        fromLinkable: true,
        toLinkable: true,
      }),
      $(
        go.Panel,
        'Table',
        { minSize: new go.Size(200, Number.NaN), defaultRowSeparatorStroke: '#e5e7eb' },

        // ======= TÍTULO (nombre de clase) =======
        $(
          go.Panel,
          'TableRow',
          { background: '#f9fafb' },
          $(
            go.TextBlock,
            {
              margin: 6,
              row: 0,
              column: 0,
              columnSpan: 3,
              editable: true,
            },
            // si es abstracta ⇒ cursiva + bold
            new go.Binding('font', '', (n: any) =>
              n && n.isAbstract ? 'italic bold 12pt sans-serif' : 'bold 12pt sans-serif'
            ),
            new go.Binding('text', 'name').makeTwoWay()
          )
        ),

        // ======= ESTEREOTIPO / «interface» =======
        // Si isInterface === true, muestra «interface» fijo y oculta el estereotipo editable.
        $(
          go.Panel,
          'Horizontal',
          { row: 1, column: 0, columnSpan: 3, margin: new go.Margin(0, 6, 4, 6) },

          // «interface» (solo visible cuando isInterface)
          $(
            go.TextBlock,
            { stroke: '#6b7280', font: 'italic 10pt sans-serif', visible: false },
            new go.Binding('visible', 'isInterface', (v) => !!v),
            new go.Binding('text', '', () => '\u00ABinterface\u00BB')
          ),

          // Estereotipo editable (visible cuando NO es interface)
          $(
            go.TextBlock,
            { stroke: '#6b7280', editable: true, visible: true },
            new go.Binding('visible', 'isInterface', (v) => !v),
            new go.Binding('text', 'stereotype').makeTwoWay()
          )
        ),

        // ======= ATRIBUTOS =======
        $(
          go.Panel,
          'Table',
          { row: 2, column: 0, itemTemplate: attrTemplate },
          new go.Binding('itemArray', 'attrs').makeTwoWay()
        )
      )
    );
    diag.nodeTemplateMap.add(
      'LinkLabel',
      $(
        go.Node,
        'Spot',
        {
          selectable: false,
          layerName: 'Foreground',
          locationSpot: go.Spot.Center,
          width: 1,
          height: 1, // invisible, solo como ancla
        },
        $(go.Shape, 'Circle', { width: 1, height: 1, fill: 'transparent', stroke: null })
      )
    );
    // Relación (linkTemplate)
    diag.linkTemplate = $(
      go.Link,
      {
        routing: go.Link.AvoidsNodes,
        corner: 8,
        relinkableFrom: true,
        relinkableTo: true,
        reshapable: true,
        resegmentable: true,
        adjusting: go.Link.End,
        curve: go.Link.None,
      },
      new go.Binding('curve', '', (d: any) => {
        const k = normalizeKind(d.kind);
        const undirected = k === 'association' || k === 'aggregation' || k === 'composition';
        const m = this.diagram?.model as go.GraphLinksModel;
        if (!m) return go.Link.None;

        const isSelf = d.from === d.to;
        const siblings = (m.linkDataArray as any[]).filter((l: any) => {
          if (l.isJoinRef) return false;
          if (undirected) {
            return (l.from === d.from && l.to === d.to) || (l.from === d.to && l.to === d.from);
          }
          return l.from === d.from && l.to === d.to;
        });

        return isSelf || siblings.length > 1 ? go.Link.Bezier : go.Link.None;
      }),

      new go.Binding('curviness', '', (d: any) => {
        const k = normalizeKind(d.kind);
        const undirected = k === 'association' || k === 'aggregation' || k === 'composition';
        const m = this.diagram?.model as go.GraphLinksModel;
        if (!m) return 0;

        const isSelf = d.from === d.to;
        const siblings = (m.linkDataArray as any[]).filter((l: any) => {
          if (l.isJoinRef) return false;
          if (undirected) {
            return (l.from === d.from && l.to === d.to) || (l.from === d.to && l.to === d.from);
          }
          return l.from === d.from && l.to === d.to;
        });

        if (siblings.length <= 1) return isSelf ? -50 : 0;

        const idx = siblings.findIndex((l) => l === d);
        const base = 30; // separación entre paralelos
        const sign = idx % 2 === 0 ? 1 : -1;
        const mag = Math.ceil(idx / 2);
        // Self-link: arrancamos curvado por defecto
        return (isSelf ? -50 : 0) + sign * mag * base;
      }),
      $(
        go.Shape,
        { stroke: '#374151', strokeWidth: 1.5 },
        new go.Binding('strokeDashArray', '', (d: any) => {
          const k = normalizeKind(d.kind);
          return d.isJoinRef || k === 'realization' || k === 'dependency' ? [6, 4] : null;
        })
      ),

      // Punta en DESTINO para generalization/realization (triángulo hueco)
      $(
        go.Shape,
        { toArrow: '', stroke: '#374151', fill: 'white', strokeWidth: 1.5 },
        new go.Binding('toArrow', '', (d: any) => {
          if (d.isJoinRef) return '';
          const k = normalizeKind(d.kind);
          if (k === 'generalization' || k === 'realization') return 'Triangle';
          if (k === 'dependency') return 'OpenTriangle';
          return '';
        }),
        new go.Binding('fill', '', (d: any) =>
          d.kind === 'generalization' || d.kind === 'realization' ? 'white' : 'white'
        )
      ),

      // Rombo en ORIGEN para aggregation/composition
      $(
        go.Shape,
        { fromArrow: '', stroke: '#374151', strokeWidth: 1.5 },
        new go.Binding('fromArrow', '', (d: any) => {
          if (d.isJoinRef) return '';
          const k = normalizeKind(d.kind);
          return k === 'aggregation' || k === 'composition' ? 'StretchedDiamond' : '';
        })
      ),
      // Etiqueta cardinalidad origen (visible solo en asociaciones/agr/compos.)
      $(
        go.Panel,
        'Auto',
        new go.Binding('visible', '', (d: any) => {
          const k = normalizeKind(d.kind);
          return k === 'association' || k === 'aggregation' || k === 'composition';
        }),
        $(go.Shape, 'RoundedRectangle', { fill: '#f3f4f6', stroke: null }),
        $(
          go.TextBlock,
          { margin: 2, editable: true },
          new go.Binding('text', 'fromCard').makeTwoWay()
        ),
        { segmentIndex: 0, segmentOffset: new go.Point(-10, -10) }
      ),

      // Etiqueta cardinalidad destino (visible solo en asociaciones/agr/compos.)
      $(
        go.Panel,
        'Auto',
        new go.Binding(
          'visible',
          '',
          (d: any) =>
            d.kind === 'association' || d.kind === 'aggregation' || d.kind === 'composition'
        ),
        $(go.Shape, 'RoundedRectangle', { fill: '#f3f4f6', stroke: null }),
        $(
          go.TextBlock,
          { margin: 2, editable: true },
          new go.Binding('text', 'toCard').makeTwoWay()
        ),
        { segmentIndex: -1, segmentOffset: new go.Point(10, 10) }
      )
    );

    // Modelo + listeners
    const model = $(go.GraphLinksModel, {
      copiesArrays: true,
      copiesArrayObjects: true,
      linkKeyProperty: 'key',
      linkLabelKeysProperty: 'labelKeys',
      makeUniqueLinkKeyFunction: (m: go.GraphLinksModel, _data: any): go.Key => {
        // L1, L2, L3...
        let i = 1;
        let k: string;
        do {
          k = `L${i++}`;
        } while ((m.linkDataArray as any[]).some((ld: any) => ld.key === k));
        return k;
      },
    });

    // autosave con debounce
    const doAutosave = debounce(() => this.save('auto-save'), 800);

    this.modelChangedListener = (e) => {
      if (e.isTransactionFinished) {
        this.status.set('Cambios pendientes…');
        doAutosave();
      }
    };

    // Diagram listeners: guarda referencias para quitarlos después
    this.selectionChangedHandler = () => this.onSelectionChanged();
    this.linkDrawnHandler = (ev) => this.onLinkDrawn(ev);
    diag.addDiagramListener('ChangedSelection', this.selectionChangedHandler);
    diag.addDiagramListener('LinkDrawn', this.linkDrawnHandler);
    diag.addDiagramListener('SelectionDeleting', (e) => {
      const it = e.subject.iterator;
      const m = this.diagram.model as go.GraphLinksModel;
      const detachByVia = (via: string) => {
        const affected = (m.linkDataArray as any[]).filter((l: any) => l.via === via);
        for (const l of affected) this.detachJoinRef(l);
      };
      while (it.next()) {
        const part = it.value;
        if (part instanceof go.Link) {
          const d: any = part.data;
          if (d?.via) this.detachJoinRef(d);
        }

        if (part instanceof go.Node && (part.data?.name || part.data?.key)) {
          const via = String(part.data.name ?? part.data.key);
          detachByVia(via);
        }
      }
    });

    this.diagram = diag;
    this.diagram.model = model;

    this.bindAutosaveAndRealtime(model);
  }

  // ------------- Selection & forms
  private onSelectionChanged() {
    const sel = this.diagram.selection.first();
    if (!sel) {
      this.selectedType.set(null);
      this.selectedNodeData = undefined;
      this.selectedLinkData = undefined;
      return;
    }
    if (sel instanceof go.Node) {
      this.selectedType.set('node');
      this.selectedNodeData = sel.data;
      const attrs: EntityAttr[] = (sel.data.attrs ?? []).map((a: any) => ({
        name: a.name,
        type: a.type,
        pk: !!a.pk,
        unique: !!a.unique,
        nullable: !!a.nullable,
      }));
      this.nodeForm.reset({
        name: sel.data.name ?? '',
        stereotype: sel.data.stereotype ?? '',
        isInterface: !!sel.data.isInterface,
        isAbstract: !!sel.data.isAbstract,
      });
      const arr = this.makeAttrArray(attrs);
      this.nodeForm.setControl('attrs', this.fb.array(arr));
    } else if (sel instanceof go.Link) {
      this.selectedType.set('link');
      this.selectedLinkData = sel.data;
      this.linkForm.reset({
        kind: sel.data.kind ?? 'association',
        fromCard: sel.data.fromCard ?? 'N',
        toCard: sel.data.toCard ?? '1',
      });
    }
  }

  addAttr() {
    this.attrsFA().push(
      this.fb.group({
        name: ['field', Validators.required],
        type: ['string', Validators.required],
        pk: [false],
        unique: [false],
        nullable: [true],
      })
    );
  }
  removeAttr(i: number) {
    this.attrsFA().removeAt(i);
  }

  applyNodeForm() {
    if (!this.selectedNodeData || this.nodeForm.invalid) return;
    const m = this.diagram.model as go.GraphLinksModel;
    const { name, stereotype, isInterface, isAbstract } = this.nodeForm.getRawValue();
    const attrs = this.attrsFA().getRawValue();

    this.diagram.startTransaction('apply-node');
    m.setDataProperty(this.selectedNodeData, 'name', name);
    m.setDataProperty(this.selectedNodeData, 'stereotype', stereotype ?? '');
    m.setDataProperty(this.selectedNodeData, 'isInterface', !!isInterface);
    m.setDataProperty(this.selectedNodeData, 'isAbstract', !!isAbstract);
    m.setDataProperty(this.selectedNodeData, 'attrs', attrs);
    this.diagram.commitTransaction('apply-node');
  }
  applyLinkForm() {
    if (!this.selectedLinkData) return;
    const m = this.diagram.model as go.GraphLinksModel;
    const { kind, fromCard, toCard } = this.linkForm.value;
    const nk = normalizeKind(kind as string);
    const prevKind = (this.selectedLinkData as any).kind;

    this.diagram.startTransaction('apply-link');
    m.setDataProperty(this.selectedLinkData, 'kind', nk);
    m.setDataProperty(this.selectedLinkData, 'fromCard', fromCard);
    m.setDataProperty(this.selectedLinkData, 'toCard', toCard);

    // Si es lazo A→A, prohibimos composition / generalization (y opcionalmente realization)
    const d = this.selectedLinkData as any;
    if (
      d.from === d.to &&
      (nk === 'composition' || nk === 'generalization') /* || nk === 'realization' */
    ) {
      m.setDataProperty(this.selectedLinkData, 'kind', prevKind); // revertir
      this.diagram.commitTransaction('apply-link');
      this.status.set(`El tipo "${nk}" no puede ser reflexivo (A→A). Se mantiene "${prevKind}".`);
      return;
    }

    this.diagram.commitTransaction('apply-link');

    // Si ahora es N–N, crear intermedia
    this.expandManyToManyIfNeeded(this.selectedLinkData as any);

    // Sugerir FK para N→1
    this.maybeSuggestFK(this.selectedLinkData);
  }

  // ------------- Actions
  addClass() {
    const m = this.diagram.model as go.GraphLinksModel;
    const p = this.diagram.viewportBounds.center;
    this.diagram.startTransaction('new-class');
    const key = crypto.randomUUID();
    m.addNodeData({
      key,
      name: 'Clase',
      stereotype: 'entity',
      attrs: [{ name: 'id', type: 'uuid', pk: true, nullable: false }],
    });
    const n = this.diagram.findNodeForKey(key);
    if (n) n.location = p;
    this.diagram.commitTransaction('new-class');
  }
  layout() {
    (this.diagram.layout as any)?.doLayout(this.diagram);
  }
  undo() {
    (this.diagram.undoManager as any).undo();
  }
  redo() {
    (this.diagram.undoManager as any).redo();
  }
  canUndo() {
    // devuelve booleano seguro aunque el diagrama no exista todavía
    const um = (this.diagram as any)?.undoManager;
    const val = typeof um?.canUndo === 'function' ? um?.canUndo?.() : um?.canUndo;
    return !!val;
  }
  canRedo() {
    const um = (this.diagram as any)?.undoManager;
    const val = typeof um?.canRedo === 'function' ? um?.canRedo?.() : um?.canRedo;
    return !!val;
  }
  // ------------- Load/Save
  private toDSL(): DSL {
    const m = this.diagram.model as go.GraphLinksModel;

    const entities: Entity[] = (m.nodeDataArray as any[])
      // 1) No persistir nodos de UI
      .filter((n) => (n.category ?? '') !== 'LinkLabel')
      // 2) Normalizar el nombre para evitar null/undefined y espacios
      .map((n) => ({
        name: String(n.name || '').trim(),
        stereotype: n.stereotype ?? '',
        isInterface: !!n.isInterface,
        isAbstract: !!n.isAbstract,
        attrs: (n.attrs ?? []) as EntityAttr[],
      }))
      // 3) Blindaje: si por alguna razón quedó sin nombre, no lo envíes
      .filter((e) => e.name.length > 0);

    const relations: Relation[] = (m.linkDataArray as any[]).flatMap((l) => {
      // No persistir la línea punteada UI-only
      if ((l as any).isJoinRef) return [];

      const from = (m as any).findNodeDataForKey(l.from)?.name;
      const to = (m as any).findNodeDataForKey(l.to)?.name;
      const kind = normalizeKind(l.kind ?? 'association');
      if (!from || !to) return [];

      const base: any = { from, to, kind };

      // Persistir referencia a la association class (si existe)
      const via = (l as any).via;
      if (via && entities.some((e) => e.name === via)) {
        base.via = via;
      }
      if (kind === 'association' || kind === 'aggregation' || kind === 'composition') {
        base.fromCard = l.fromCard ?? 'N';
        base.toCard = l.toCard ?? '1';
      }
      return [base as Relation];
    });
    return { entities, relations, constraints: [] };
  }
  private fromDSL(dsl: DSL) {
    const nodeData = dsl.entities.map((e) => ({
      key: e.name,
      name: e.name,
      stereotype: e.stereotype ?? '',
      isInterface: !!e.isInterface,
      isAbstract: !!e.isAbstract,
      attrs: e.attrs ?? [],
    }));
    const linkData = dsl.relations.map((r, i) => ({
      key: `L${i}`,
      from: r.from,
      to: r.to,
      kind: normalizeKind(r.kind ?? 'association'),
      fromCard: r.fromCard ?? 'N',
      toCard: r.toCard ?? '1',
      via: r.via,
    }));
    const m = this.diagram.model as go.GraphLinksModel;
    m.startTransaction('load');
    m.nodeDataArray = nodeData;
    m.linkDataArray = linkData;
    m.commitTransaction('load');
    for (const l of m.linkDataArray as any[]) {
      if ((l as any).via) this.attachJoinRef(l);
    }
  }

  private load() {
    this.api.getCurrent(this.projectId(), this.branchId()).subscribe({
      next: (res) => {
        this.branchId.set(res.branchId);
        this.fromDSL(res.content as DSL);
        this.status.set(`Cargado v:${res.versionId.slice(0, 6)} (${res.branchId})`);
      },
      error: (e) => this.status.set(e?.error?.message ?? 'Error al cargar'),
    });
  }

  save(message = 'edit') {
    const dsl = this.toDSL();
    this.api
      .save(this.projectId(), { branchId: this.branchId(), message, content: dsl })
      .subscribe({
        next: (r) => this.status.set(`Guardado ${new Date(r.createdAt).toLocaleTimeString()}`),
        error: (e) => this.status.set(e?.error?.message ?? 'Error al guardar'),
      });
  }

  // ------------- Regla: sugerir FK en N→1
  private onLinkDrawn(e: go.DiagramEvent) {
    const link = e.subject as go.Link;
    const data = link.data as Relation;
    const nk = normalizeKind((data as any).kind || 'association');
    if (nk !== (data as any).kind) {
      (this.diagram.model as go.GraphLinksModel).setDataProperty(data as any, 'kind', nk);
    }
    const m = this.diagram.model as go.GraphLinksModel;

    const fromNode = m.findNodeDataForKey(data.from) as any;
    const toNode = m.findNodeDataForKey(data.to) as any;
    if (!fromNode || !toNode) return;

    const fromCard = (data.fromCard ?? 'N').toUpperCase();
    const toCard = (data.toCard ?? '1').toUpperCase();

    const hasN = (c: string) => c.includes('N');

    // M:N → crear tabla intermedia
    if (hasN(fromCard) && hasN(toCard)) {
      this.attachJoinRef(data);
      this.status.set('Se vinculó tabla intermedia (Association Class) para relación M:N');
    }
  }
  private fkName(name: string) {
    const base = (name || 'Ref').charAt(0).toLowerCase() + (name || 'Ref').slice(1);
    return `${base}Id`;
  }
  private mkJoinName(a: string, b: string) {
    const [x, y] = [a, b].sort((s1, s2) => s1.localeCompare(s2));
    return `${x}${y}Join`;
  }

  private maybeSuggestFK(linkData: any) {
    const m = this.diagram.model as go.GraphLinksModel;
    const fromNode = (m as any).findNodeDataForKey(linkData.from);
    const toNode = (m as any).findNodeDataForKey(linkData.to);
    if (!fromNode || !toNode) return;

    const fromCard = (linkData.fromCard ?? 'N').toUpperCase();
    const toCard = (linkData.toCard ?? '1').toUpperCase();
    // Heurística: N→1 (o N..1) ⇒ FK en origen
    const isNto1 = (c: string) => c.includes('N');
    const is1 = (c: string) => c === '1' || c === '0..1';
    if (isNto1(fromCard) && is1(toCard)) {
      // nombre: <toName>Id
      const toName = (toNode.name as string) || 'Ref';
      const fk = toName.charAt(0).toLowerCase() + toName.slice(1) + 'Id';
      const attrs: EntityAttr[] = fromNode.attrs ?? [];
      if (!attrs.some((a) => a.name === fk)) {
        this.diagram.startTransaction('add-fk');
        attrs.push({ name: fk, type: 'uuid', nullable: false });
        m.setDataProperty(fromNode, 'attrs', attrs);
        this.diagram.commitTransaction('add-fk');
        this.status.set(`Sugerencia aplicada: FK "${fk}" en ${fromNode.name}`);
      }
    }
  }
}
