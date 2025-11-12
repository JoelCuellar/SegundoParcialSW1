import { Component, effect, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ArtifactsService } from '../../core/services/artifacts';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-artifacts',
  standalone: true,
  imports: [CommonModule, DatePipe], // 👈 NgIf/NgFor + date pipe
  templateUrl: './artifacts.html',
  styleUrls: ['./artifacts.scss']
})
export class ArtifactsComponent {
  projectId = signal<string>('');
  types = signal<string[]>(['SPRING_BOOT_PROJECT', 'POSTMAN_COLLECTION', 'FLUTTER_APP']);
  packageBase = signal('com.acme.demo');
  dbEngine = signal<'POSTGRESQL' | 'MYSQL' | 'MARIADB' | 'SQLSERVER'>('POSTGRESQL');
  migrationTool = signal<'FLYWAY' | 'LIQUIBASE'>('FLYWAY');
  items = signal<any[]>([]);
  loading = signal(false);
  includeAuth = signal(true);
  flutterBaseUrl = signal('http://localhost:8080');
  constructor(private api: ArtifactsService, route: ActivatedRoute) {
    effect(() => {
      const pid = route.snapshot.paramMap.get('projectId')!;
      this.projectId.set(pid);
      this.refresh();
    });
  }

  toggle(t: string) {
    const set = new Set(this.types());
    set.has(t) ? set.delete(t) : set.add(t);
    this.types.set([...set]);
  }

  generate() {
    this.loading.set(true);
    console.log(this.types(), this.packageBase(), this.dbEngine(), this.migrationTool(), this.includeAuth(), this.flutterBaseUrl());
    this.api.generate(this.projectId(), {
      types: this.types(),
      packageBase: this.packageBase(),
      dbEngine: this.dbEngine(),
      migrationTool: this.migrationTool(),
      includeAuth: this.includeAuth(),
      flutterBaseUrl: this.flutterBaseUrl(),
    }).subscribe({
      next: () => { this.loading.set(false); this.refresh(); },
      error: () => this.loading.set(false)
    });
  }

  refresh() {
    if (!this.projectId()) return;
    this.api.list(this.projectId()).subscribe(res => this.items.set(res));
  }

  download(id: string) {
    this.api.download(this.projectId(), id);
  }

  onPkgInput(v: string) {
    this.packageBase.set(v);
  }
  onDbEngineChange(v: string) {
    this.dbEngine.set(v as 'POSTGRESQL' | 'MYSQL' | 'MARIADB' | 'SQLSERVER');
  }
  onMigrationChange(v: string) {
    this.migrationTool.set(v as 'FLYWAY' | 'LIQUIBASE');
  }
}
