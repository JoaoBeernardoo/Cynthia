import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <main class="center-page">
      <section class="message-card">
        <span class="success-mark">{{ confirmed ? '✓' : '✳' }}</span>
        <h1>{{ confirmed ? 'E-mail confirmado!' : 'Confirmando seu e-mail' }}</h1>
        <p>{{ message }}</p>
        <a class="primary-button" routerLink="/login" *ngIf="confirmed">Continuar para entrar</a>
        <a class="subtle-link" routerLink="/feed">Voltar ao início</a>
      </section>
    </main>
  `
})
export class ConfirmEmailPage implements OnInit {
  confirmed = false;
  message = 'Validando o link de confirmação...';

  constructor(private readonly route: ActivatedRoute, private readonly auth: AuthService) {}

  ngOnInit(): void {
    const email = this.route.snapshot.queryParamMap.get('email');
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!email || !token) {
      this.message = 'O link está incompleto. Solicite um novo e-mail de confirmação.';
      return;
    }
    this.auth.confirmEmail(email, token).subscribe({
      next: () => {
        this.confirmed = true;
        this.message = 'Sua conta está pronta. Faça login para publicar e interagir.';
      },
      error: () => (this.message = 'O link é inválido ou expirou. Solicite um novo e-mail de confirmação.')
    });
  }
}
