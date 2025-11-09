import { Component, type OnInit, inject, signal } from "@angular/core"
import { CommonModule } from "@angular/common"
import { ReactiveFormsModule, FormBuilder, Validators } from "@angular/forms"
import { ProjectsService } from "../../core/services/projects"
import { WorkspacesService, type WorkspaceDTO } from "../../core/services/workspaces"
import { RouterLink } from "@angular/router"
import { HeaderComponent } from "../../shared/components/header/header"
import { CardComponent } from "../../shared/components/card/card"
import { FormFieldComponent } from "../../shared/components/form-field/form-field"

@Component({
  standalone: true,
  selector: "app-projects",
  imports: [CommonModule, ReactiveFormsModule, RouterLink, HeaderComponent, CardComponent, FormFieldComponent],
  templateUrl: "./projects.html",
  styleUrl: "./projects.scss",
})
export class ProjectsComponent implements OnInit {
  private fb = inject(FormBuilder)
  private api = inject(ProjectsService)
  private wsApi = inject(WorkspacesService)

  workspaces = signal<WorkspaceDTO[]>([])
  selectedWsId = signal<string>("")
  projects = signal<any[]>([])
  loading = signal(false)
  error = signal("")

  form = this.fb.group({
    name: ["", [Validators.required, Validators.minLength(2)]],
    description: [""],
    tags: [""],
  })

  ngOnInit() {
    this.loadWorkspaces()
  }

  loadWorkspaces() {
    this.loading.set(true)
    this.wsApi.list().subscribe({
      next: (rows) => {
        this.workspaces.set(rows)
        // seleccionar por defecto: lastWorkspaceId o primero
        const remembered = localStorage.getItem("lastWorkspaceId")
        const defaultId = remembered && rows.some((w) => w.id === remembered) ? remembered : rows[0]?.id
        if (defaultId) {
          this.selectedWsId.set(defaultId)
          localStorage.setItem("lastWorkspaceId", defaultId)
          this.reload()
        }
        this.loading.set(false)
      },
      error: (e) => {
        this.error.set(e?.error?.message ?? "Error al cargar workspaces")
        this.loading.set(false)
      },
    })
  }

  onWsChanged(ev: Event) {
    const id = (ev.target as HTMLSelectElement).value
    this.selectedWsId.set(id)
    localStorage.setItem("lastWorkspaceId", id)
    this.reload()
  }

  reload() {
    const wsId = this.selectedWsId()
    if (!wsId) return
    this.loading.set(true)
    this.api.list(wsId).subscribe({
      next: (rows: any[]) => {
        this.projects.set(rows)
        this.loading.set(false)
      },
      error: (e) => {
        this.error.set(e?.error?.message ?? "Error al listar")
        this.loading.set(false)
      },
    })
  }

  create() {
    if (this.form.invalid || this.loading()) return
    const wsId = this.selectedWsId()
    const { name, description, tags } = this.form.value
    const tagArr = (tags || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    this.loading.set(true)
    this.api.create(wsId, { name: name!, description: description || undefined, tags: tagArr }).subscribe({
      next: () => {
        this.form.reset({ name: '', description: '', tags: '' }, { emitEvent: false });
      this.form.markAsPristine();
      this.form.markAsUntouched();

      this.reload();
      this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.error?.message ?? "No se pudo crear")
        this.loading.set(false)
      },
    })
  }

  archive(id: string) {
    this.api.archive(id).subscribe({
      next: () => this.reload(),
      error: (e) => this.error.set(e?.error?.message ?? "No se pudo archivar"),
    })
  }
  restore(id: string) {
    this.api.restore(id).subscribe({
      next: () => this.reload(),
      error: (e) => this.error.set(e?.error?.message ?? "No se pudo restaurar"),
    })
  }
  remove(id: string) {
    this.api.remove(id).subscribe({
      next: () => this.reload(),
      error: (e) => this.error.set(e?.error?.message ?? "No se pudo eliminar"),
    })
  }
}
