import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { VersionsApiService } from '../../core/services/versions-api';

@Component({
  standalone: true,
  selector: 'app-versions',
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './versions.html',
  styleUrl: './versions.scss'
})
export class VersionsComponent implements OnInit {
  private api = inject(VersionsApiService);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);

  projectId = signal<string>('');
  branches = signal<any[]>([]);
  branchId = signal<string>('');
  versions = signal<any[]>([]);
  selectedVersionId = signal<string>('');

  // New branch
  branchForm = this.fb.group({ name: ['', Validators.required], fromVersionId: [''] });

  // Diff
  diffFromId = signal<string>('');
  diffToId = signal<string>('');
  diffRes = signal<any | null>(null);

  // Merge
  mergeSourceBranchId = signal<string>('');
  mergeSourceVersions = signal<any[]>([]);
  mergeSourceVersionId = signal<string>('');
  mergeRes = signal<any | null>(null);

  ngOnInit() {
    this.projectId.set(this.route.snapshot.paramMap.get('projectId')!);
    this.loadBranches();
  }

  branchName(id: string): string {
    const b = this.branches().find(x => x.id === id);
    return b?.name ?? '';
  }

  loadBranches() {
    this.api.listBranches(this.projectId()).subscribe(bs => {
      this.branches.set(bs as any[]);
      const pick = bs.find((b: any) => b.isDefault) ?? bs[0];
      if (pick) { this.selectBranch(pick.id); }
      // init merge source
      if (bs?.length) { this.mergeSourceBranchId.set(bs[0].id); this.loadSourceVersions(bs[0].id); }
    });
  }

  selectBranch(bid: string) {
    this.branchId.set(bid);
    this.api.listVersions(this.projectId(), bid).subscribe(vs => {
      this.versions.set(vs as any[]);
      const first = vs[0];
      if (first) { this.selectedVersionId.set(first.id); this.diffFromId.set(first.id); this.diffToId.set(first.id); }
    });
  }

  selectVersion(id: string) { this.selectedVersionId.set(id); }

  createBranch() {
    const { name, fromVersionId } = this.branchForm.value;
    this.api.createBranch(this.projectId(), { name: name!, fromVersionId: fromVersionId || undefined })
      .subscribe(() => { this.branchForm.reset({ name: '', fromVersionId: '' }); this.loadBranches(); });
  }

  runDiff() {
    if (!this.diffFromId() || !this.diffToId()) return;
    this.api.diff(this.projectId(), this.diffFromId(), this.diffToId())
      .subscribe(r => this.diffRes.set(r));
  }

  restore() {
    if (!this.selectedVersionId()) return;
    if (!confirm('Crear snapshot restaurando a la versión seleccionada?')) return;
    this.api.restore(this.projectId(), this.selectedVersionId())
      .subscribe(() => this.selectBranch(this.branchId()));
  }

  onPickSourceBranch(bid: string) {
    this.mergeSourceBranchId.set(bid);
    this.loadSourceVersions(bid);
  }
  loadSourceVersions(bid: string) {
    this.api.listVersions(this.projectId(), bid).subscribe(vs => {
      this.mergeSourceVersions.set(vs as any[]);
      if (vs[0]) this.mergeSourceVersionId.set(vs[0].id);
    });
  }

  runMerge() {
    const body = {
      sourceBranchId: this.mergeSourceBranchId(),
      targetBranchId: this.branchId(),
      sourceVersionId: this.mergeSourceVersionId(),
      targetVersionId: this.selectedVersionId(),
    };
    this.api.merge(this.projectId(), body).subscribe(r => {
      this.mergeRes.set(r);
      // recargar timeline destino para ver la versión resultante
      this.selectBranch(this.branchId());
    });
  }
}
