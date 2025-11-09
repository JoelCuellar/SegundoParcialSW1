import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AiApi } from '../../core/services/ai-api';
import { ValidationApi } from '../../core/services/validation-api';
// Usa tu servicio real de versiones; ajusta import si el path difiere
import { VersionsApiService } from '../../core/services/versions-api';

@Component({
  standalone: true,
  selector: 'app-quality-ia',
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
  <div class="wrap">
    <div class="header">
      <a [routerLink]="['/app']">← Proyectos</a>
      <h1>Calidad e IA</h1>
      <a [routerLink]="['/app/projects', pid(), 'editor']">Ir al editor</a>
    </div>

    <!-- VALIDACIÓN -->
    <section class="card">
      <h2>Validación</h2>
      <div class="row">
        <label>Versión:</label>
        <select [(ngModel)]="selectedVid">
          <option *ngFor="let v of versions()" [value]="v.id">{{ v.createdAt | date:'short' }} — {{ v.message }}</option>
        </select>
        <label class="ml">Timeout (ms):</label>
        <input type="number" [(ngModel)]="timeoutMs" style="width:120px" />
        <button (click)="runValidation()">Ejecutar</button>
      </div>

      <div class="mt">
        <h3>Últimos runs</h3>
        <div class="run" *ngFor="let r of runs()">
          <div class="row between">
            <div>
              <b>#{{ r.id }}</b> — <span class="chip" [class]="r.status">{{ r.status }}</span>
              <span class="muted"> {{ r.createdAt | date:'short' }} </span>
            </div>
            <button *ngIf="r.status==='QUEUED' || r.status==='RUNNING'" (click)="cancelRun(r.id)">Cancelar</button>
          </div>
          <details *ngIf="r.report"><summary>Reporte</summary><pre>{{ r.report | json }}</pre></details>
        </div>
      </div>
    </section>

    <!-- IA -->
    <section class="card">
      <h2>Sugerencias de IA</h2>
      <div class="row">
        <label>Alcance:</label>
        <select [(ngModel)]="scope">
          <option>ALL</option><option>CLASSES</option><option>RELATIONSHIPS</option><option>ATTRIBUTES</option><option>DATATYPES</option>
        </select>
        <button (click)="request()">Pedir sugerencias</button>
      </div>

      <div class="list">
        <div class="item" *ngFor="let s of suggestions()">
          <div class="row between">
            <div>
              <b>#{{ s.id }}</b> — <span class="chip">{{ s.status }}</span>
              <span class="muted">{{ s.createdAt | date:'short' }}</span>
            </div>
            <div class="row gap">
              <button (click)="apply(s.id)">Aplicar</button>
              <button (click)="reject(s.id)">Rechazar</button>
            </div>
          </div>
          <div class="muted">{{ s.rationale }}</div>
          <details class="mt"><summary>Ver patch</summary><pre>{{ s.proposedPatch | json }}</pre></details>
        </div>
      </div>
    </section>
  </div>
  `,
  styles: [`
    .wrap { padding: 16px; display: grid; gap: 16px; }
    .header { display:flex; gap:12px; align-items:center; }
    .card { background:#fff; border-radius:12px; padding:16px; box-shadow:0 1px 4px rgba(0,0,0,.06); }
    .row { display:flex; gap:8px; align-items:center; }
    .between { justify-content: space-between; }
    .ml { margin-left: 8px; }
    .mt { margin-top: 8px; }
    .list { display:grid; gap:8px; margin-top:8px; }
    .item { border:1px solid #eee; border-radius:8px; padding:8px; }
    .muted { color:#666; font-size:12px }
    .chip { padding:1px 6px; border-radius:999px; border:1px solid #ddd; font-size:12px }
    .chip.RUNNING { border-color:#444; }
    .chip.QUEUED { border-color:#999; }
    .chip.SUCCEEDED { border-color:#2e7d32; }
    .chip.FAILED { border-color:#c62828; }
    .chip.TIMED_OUT { border-color:#ef6c00; }
    .chip.CANCELED { border-color:#757575; }
    .run { border:1px solid #eee; border-radius:8px; padding:8px; margin-top:6px; }
  `]
})
export class QualityIaComponent implements OnInit {
  pid = signal<string>(''); versions = signal<any[]>([]); selectedVid?: string;
  runs = signal<any[]>([]); suggestions = signal<any[]>([]);
  lastReport: any; scope = 'ALL'; timeoutMs = 15000;

  constructor(
    private route: ActivatedRoute,
    private ai: AiApi,
    private val: ValidationApi,
    private vapi: VersionsApiService
  ) {}

  ngOnInit() {
    this.pid.set(this.route.snapshot.paramMap.get('projectId')!);
    // Cargar versiones (ajusta a tu API real)
    this.vapi.listBranches(this.pid()).subscribe((bs:any[])=>{
      const def = bs.find(b => b.isDefault) || bs[0];
      this.vapi.listVersions(this.pid(), def.id).subscribe((vs:any[])=>{
        this.versions.set(vs);
        this.selectedVid = vs[0]?.id;
      });
    });
    this.reloadRuns();
    this.refreshSuggestions();
  }

  runValidation() {
    if (!this.selectedVid) return;
    this.val.run(this.pid(), this.selectedVid, this.timeoutMs).subscribe(()=> this.reloadRuns());
  }
  cancelRun(runId: string) { this.val.cancel(this.pid(), runId).subscribe(()=> this.reloadRuns()); }
  reloadRuns() { this.val.list(this.pid()).subscribe((xs:any)=> this.runs.set(xs)); }

  request() {
    if (!this.selectedVid) return;
    this.ai.request(this.pid(), this.selectedVid, this.scope).subscribe(()=> this.refreshSuggestions());
  }
  apply(id: string) { this.ai.apply(this.pid(), id).subscribe(()=> this.refreshSuggestions()); }
  reject(id: string) { this.ai.reject(this.pid(), id).subscribe(()=> this.refreshSuggestions()); }
  refreshSuggestions() { this.ai.list(this.pid()).subscribe((xs:any)=> this.suggestions.set(xs)); }
}
