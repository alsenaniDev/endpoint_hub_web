import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>'
})
export class App {
  // Inject here so ThemeService initializes on every page (including login)
  // and applies the stored theme class to <body> before anything renders.
  private _theme = inject(ThemeService);
}
