import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize, Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <main class="center-page"><section class="message-card recovery-card">
      <a routerLink="/feed" class="brand"><span class="brand-mark">C</span> Cynthia</a>
      <span class="success-mark">✳</span>
      <h1>{{ isReset ? 'Escolha uma nova senha' : 'Recupere sua conta' }}</h1>
      <p>{{ isReset ? 'Crie uma senha segura para voltar à comunidade.' : 'Enviaremos um link de redefinição para o e-mail da sua conta.' }}</p>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <label>E-mail<input formControlName="email" type="email" autocomplete="email" placeholder="voce@email.com" /></label>
        <label *ngIf="isReset">Nova senha<input formControlName="password" type="password" autocomplete="new-password" placeholder="Pelo menos 10 caracteres" /></label>
        <p class="success-note" *ngIf="done">{{ message }}</p>
        <p class="form-error" *ngIf="!done && message">{{ message }}</p>
        <button class="primary-button full-width" [disabled]="form.invalid || loading">{{ loading ? 'Enviando...' : isReset ? 'Redefinir senha' : 'Enviar instruções' }}</button>
      </form>
      <a class="subtle-link" routerLink="/login">Voltar para entrar</a>
    </section></main>
  `
})
export class RecoveryPage {
  readonly isReset: boolean;
  readonly form;
  readonly emailToken: string;
  loading = false;
  done = false;
  message = '';

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly auth: AuthService,
    route: ActivatedRoute
  ) {
    this.isReset = route.snapshot.routeConfig?.path === 'reset-password';
    this.emailToken = route.snapshot.queryParamMap.get('token') ?? '';
    this.form = this.formBuilder.group({
      email: [route.snapshot.queryParamMap.get('email') ?? '', [Validators.required, Validators.email]],
      password: ['', this.isReset ? [Validators.required, Validators.minLength(10), Validators.maxLength(128)] : []]
    });
  }

  submit(): void {
    const { email, password } = this.form.getRawValue();
    if (this.isReset && !this.emailToken) {
      this.message = 'O link está incompleto. Solicite novas instruções de redefinição.';
      return;
    }
    this.loading = true;
    this.message = '';
    const request: Observable<unknown> = this.isReset
      ? this.auth.resetPassword(email!, this.emailToken, password!)
      : this.auth.forgotPassword(email!);
    request.pipe(finalize(() => (this.loading = false))).subscribe({
      next: (response) => {
        this.done = true;
        this.message = this.isReset
          ? 'Senha alterada. Agora você já pode entrar.'
          : (response as { message?: string }).message ?? 'Se a conta existir, enviaremos instruções.';
      },
      error: (error: { error?: { title?: string; detail?: string } }) => {
        this.message = error.error?.detail ?? error.error?.title ?? 'Não foi possível concluir. Confira o link e tente novamente.';
      }
    });
  }
}
