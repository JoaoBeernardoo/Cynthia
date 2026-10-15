import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiErrorService } from './api-error.service';
import { AuthService } from './auth.service';
import { apiAssetUrl } from './environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly profilePhotoUrl = apiAssetUrl.bind(null);

  constructor(
    readonly auth: AuthService,
    readonly errors: ApiErrorService,
    private readonly router: Router
  ) {
    this.auth.restoreSession().subscribe({ error: () => this.auth.clear() });
  }

  dismissError(): void {
    this.errors.message.set(null);
  }

  logout(): void {
    this.auth.logout().subscribe({ error: () => this.auth.clear(), complete: () => void this.router.navigate(['/feed']) });
  }
}
