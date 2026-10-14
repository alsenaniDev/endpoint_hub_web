import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpMethodType } from '../../../core/models/models';

@Component({
  selector: 'app-method-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './method-badge.component.html',
  styleUrls: ['./method-badge.component.scss']
})
export class MethodBadgeComponent {
  @Input() method: HttpMethodType = 'GET';
}
