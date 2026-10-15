import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, map, Observable } from 'rxjs';
import { AuthService } from './auth.service';

function validBirthDate(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return { dateFormat: true };
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(year, month - 1, day);
  const valid = date.getFullYear() === year && date.getMonth() === month - 1
    && date.getDate() === day && date < new Date();
  return valid ? null : { invalidBirthDate: true };
}

function matchingPasswords(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmation = control.get('confirmPassword')?.value;
  return confirmation && password !== confirmation ? { passwordMismatch: true } : null;
}

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-page">
      <section class="auth-card">
        <a routerLink="/feed" class="brand"><span class="brand-mark">C</span> Cynthia</a>
        <p class="eyebrow">{{ isRegister ? 'Faça parte da conversa' : 'Bem-vindo de volta' }}</p>
        <h1>{{ isRegister ? 'Crie sua conta' : 'Entre na sua conta' }}</h1>
        <p class="muted">{{ isRegister ? 'Descubra lugares e compartilhe sua experiência.' : 'Veja o que as pessoas estão dizendo por perto.' }}</p>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label *ngIf="isRegister">Nome de usuário
            <input formControlName="userName" autocomplete="username" placeholder="ex.: marina.rio" />
          </label>
          <label *ngIf="isRegister">Data de nascimento
            <input formControlName="dateOfBirth" type="text" inputmode="numeric" autocomplete="bday" placeholder="dd/mm/aaaa" maxlength="10" (input)="maskBirthDate($event)" aria-describedby="birth-date-help" />
            <small class="field-help" id="birth-date-help">Sua data de nascimento é privada.</small>
          </label>
          <label>E-mail
            <input formControlName="email" type="email" autocomplete="email" placeholder="voce@email.com" />
          </label>
          <label>Senha
            <input formControlName="password" type="password" [autocomplete]="isRegister ? 'new-password' : 'current-password'" placeholder="Pelo menos 10 caracteres" />
          </label>
          <label *ngIf="isRegister">Confirme sua senha
            <input formControlName="confirmPassword" type="password" autocomplete="new-password" placeholder="Digite a senha novamente" />
          </label>
          <p class="form-error" *ngIf="isRegister && form.hasError('passwordMismatch')">As senhas não coincidem.</p>
          <div class="photo-upload" *ngIf="isRegister">
            <div class="photo-preview" [class.photo-placeholder]="!photoPreview">
              <img *ngIf="photoPreview" [src]="photoPreview" alt="Prévia da foto de perfil" />
              <span *ngIf="!photoPreview">Foto</span>
            </div>
            <div class="photo-upload-copy">
              <strong>Foto de perfil <small>(opcional)</small></strong>
              <span>JPEG, PNG ou WebP · até 5 MB</span>
              <label class="photo-picker">
                <input type="file" accept="image/jpeg,image/png,image/webp" (change)="selectPhoto($event)" />
                {{ selectedPhoto ? 'Trocar foto' : 'Escolher foto' }}
              </label>
              <button *ngIf="selectedPhoto" class="photo-remove" type="button" (click)="removePhoto()">Remover</button>
            </div>
          </div>
          <p class="form-error" *ngIf="message">{{ message }}</p>
          <button class="primary-button full-width" type="submit" [disabled]="form.invalid || loading">
            {{ loading ? 'Aguarde...' : isRegister ? 'Criar conta' : 'Entrar' }}
          </button>
        </form>
        <p class="auth-switch">
          {{ isRegister ? 'Já tem uma conta?' : 'Ainda não tem uma conta?' }}
          <a [routerLink]="isRegister ? '/login' : '/register'">{{ isRegister ? 'Entrar' : 'Cadastre-se' }}</a>
        </p>
        <a *ngIf="!isRegister" class="subtle-link" routerLink="/forgot-password">Esqueceu a senha?</a>
      </section>
      <aside class="auth-aside">
        <span class="aside-orb orb-one"></span><span class="aside-orb orb-two"></span>
        <div class="aside-content">
          <span class="aside-icon">✳</span>
          <h2>As melhores descobertas começam com uma opinião.</h2>
          <p>Compartilhe suas experiências reais e encontre lugares recomendados por quem está por perto.</p>
          <div class="aside-quote"><span class="quote-dot"></span><span>De pessoas reais, para lugares reais.</span></div>
        </div>
      </aside>
    </main>
  `
})
export class AuthPage implements OnDestroy {
  readonly isRegister: boolean;
  readonly form;
  loading = false;
  message = '';
  selectedPhoto: File | null = null;
  photoPreview: string | null = null;

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly auth: AuthService,
    private readonly router: Router,
    route: ActivatedRoute
  ) {
    this.isRegister = route.snapshot.routeConfig?.path === 'register';
    this.form = this.formBuilder.group({
      userName: ['', this.isRegister ? [Validators.required, Validators.minLength(3), Validators.maxLength(30), Validators.pattern(/^[a-zA-Z0-9_.]+$/)] : []],
      dateOfBirth: ['', this.isRegister ? [Validators.required, validBirthDate] : []],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      password: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(128)]],
      confirmPassword: ['', this.isRegister ? [Validators.required] : []]
    }, { validators: this.isRegister ? matchingPasswords : [] });
  }

  ngOnDestroy(): void {
    if (this.photoPreview) URL.revokeObjectURL(this.photoPreview);
  }

  maskBirthDate(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 8);
    const value = digits.length > 4
      ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
      : digits.length > 2
        ? `${digits.slice(0, 2)}/${digits.slice(2)}`
        : digits;
    input.value = value;
    this.form.controls.dateOfBirth.setValue(value);
  }

  selectPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      this.message = 'Escolha uma imagem JPEG, PNG ou WebP de até 5 MB.';
      input.value = '';
      return;
    }
    if (this.photoPreview) URL.revokeObjectURL(this.photoPreview);
    this.selectedPhoto = file;
    this.photoPreview = URL.createObjectURL(file);
    this.message = '';
  }

  removePhoto(): void {
    if (this.photoPreview) URL.revokeObjectURL(this.photoPreview);
    this.photoPreview = null;
    this.selectedPhoto = null;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.message = '';
    this.loading = true;
    const { userName, email, password, confirmPassword, dateOfBirth } = this.form.getRawValue();
    const request: Observable<unknown> = this.isRegister
      ? this.auth.register(userName!, email!, password!, confirmPassword!, dateOfBirth!, this.selectedPhoto ?? undefined)
      : this.auth.login(email!, password!).pipe(map(() => undefined));
    request.pipe(finalize(() => (this.loading = false))).subscribe({
      next: () => {
        if (this.isRegister) {
          this.message = 'Conta criada. Confira seu e-mail para confirmar o cadastro.';
          this.form.reset();
          this.removePhoto();
          return;
        }
        const returnUrl = this.router.parseUrl(this.router.url).queryParams['returnUrl'] as string | undefined;
        void this.router.navigateByUrl(returnUrl || '/feed');
      },
      error: (error: { error?: { title?: string; detail?: string } }) => {
        this.message = error.error?.detail ?? error.error?.title ?? 'Confira os dados e tente novamente.';
      }
    });
  }
}
