// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { AuthComponent } from './features/auth/login/login';
import { ProjectsComponent } from './features/projects/projects';
import { ModelEditorComponent } from './features/editor/editor';
import { CollaboratorsComponent } from './features/collaborators/collaborators';
import { VersionsComponent } from './features/versions/versions';
import { ArtifactsComponent } from './features/artifacts/artifacts';
import { QualityIaComponent } from './features/quality/quality-ia';

export const routes: Routes = [
  { path: 'login', component: AuthComponent },
  { path: 'auth', redirectTo: 'login', pathMatch: 'full' },
  { path: 'app', canActivate: [authGuard], component: ProjectsComponent },
  {
    path: 'app/projects/:projectId/editor',
    canActivate: [authGuard],
    component: ModelEditorComponent
  },
  {
    path: 'app/projects/:projectId/collaborators',
    canActivate: [authGuard],
    component: CollaboratorsComponent
  },
  {
    path: 'app/projects/:projectId/versions',
    canActivate: [authGuard],
    component: VersionsComponent
  },
  {
    path: 'app/projects/:projectId/artifacts',
    canActivate: [authGuard],
    component: ArtifactsComponent
  },

  { path: '', pathMatch: 'full', redirectTo: 'app' },
  { path: '**', redirectTo: 'app' },
   { path: 'app/projects/:projectId/quality', canActivate: [authGuard], component: QualityIaComponent },

];
