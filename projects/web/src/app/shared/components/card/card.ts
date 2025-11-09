import { Component, Input } from "@angular/core"
import { CommonModule } from "@angular/common"
@Component({
  selector: "app-card",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card" [class.card-hover]="hover">
      <div class="card-header">
        <h3 *ngIf="title" class="card-title">{{ title }}</h3>
        <ng-content select="[slot=header]"></ng-content>
      </div>
      <div class="card-content">
        <ng-content></ng-content>
      </div>
      <div class="card-footer">
        <ng-content select="[slot=footer]"></ng-content>
      </div>
    </div>
  `,
  styleUrl: "./card.scss",
})
export class CardComponent {
  @Input() title?: string;
  @Input() hover = false;
}