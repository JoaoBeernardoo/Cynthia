import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { apiAssetUrl } from './environment';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="page-heading"><div><span class="eyebrow">Sua conta</span><h1>Perfil e configurações</h1>
      <p class="muted">Mantenha suas informações públicas atualizadas.</p></div></div>
    <section class="profile-card">
      <div class="profile-summary">
        <div class="profile-avatar">
          <img *ngIf="imageUrl(profilePhotoUrl) as photo" [src]="photo" [alt]="'Foto de ' + form.controls.userName.value" />
          <span *ngIf="!profilePhotoUrl">{{ form.controls.userName.value?.slice(0, 1)?.toUpperCase() || 'C' }}</span>
        </div>
        <div><h2>{{ form.controls.userName.value || 'Seu perfil' }}</h2><p>{{ accountEmail }}</p>
          <span class="member-tag">Membro desde {{ createdAt | date:'MMM yyyy' }}</span></div>
        <div class="profile-post-count"><strong>{{ postCount }}</strong><small>opiniões</small></div>
      </div>
      <form [formGroup]="form" (ngSubmit)="save()">
        <div class="profile-form-heading"><h3>Informações públicas</h3><p>Seu e-mail e data de nascimento permanecem privados.</p></div>
        <div class="profile-photo-control">
          <div class="profile-photo-preview">
            <img *ngIf="imageUrl(profilePhotoUrl) as photo" [src]="photo" alt="Prévia da foto de perfil" />
            <span *ngIf="!profilePhotoUrl">Sua foto</span>
          </div>
          <div class="profile-photo-copy"><strong>Foto de perfil <small>(opcional)</small></strong>
            <p>JPEG, PNG ou WebP · até 5 MB.</p>
            <label class="photo-picker"><input type="file" accept="image/jpeg,image/png,image/webp" (change)="uploadPhoto($event)" />
              {{ profilePhotoUrl ? 'Trocar foto' : 'Escolher foto' }}</label>
          </div>
        </div>
        <label>Nome de usuário<input formControlName="userName" autocomplete="username" /></label>
        <label>Biografia <small>(opcional)</small><textarea formControlName="bio" rows="3" maxlength="300" placeholder="Conte um pouco sobre você"></textarea></label>
        <p class="success-note" *ngIf="saved">Alterações salvas.</p>
        <p class="form-error" *ngIf="message">{{ message }}</p>
        <div class="profile-form-actions"><span class="muted">Até 300 caracteres na biografia.</span>
          <button class="primary-button" type="submit" [disabled]="form.invalid || saving">{{ saving ? 'Salvando...' : 'Salvar alterações' }}</button></div>
      </form>
    </section>
  `
})
export class ProfilePage implements OnInit {
  readonly imageUrl = apiAssetUrl;
  readonly form;
  accountEmail = '';
  createdAt = '';
  postCount = 0;
  profilePhotoUrl: string | null = null;
  saving = false;
  saved = false;
  message = '';

  constructor(private readonly formBuilder: FormBuilder, private readonly api: ApiService, private readonly auth: AuthService) {
    this.form = this.formBuilder.group({
      userName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(30), Validators.pattern(/^[a-zA-Z0-9_.]+$/)]],
      bio: ['', Validators.maxLength(300)]
    });
  }

  ngOnInit(): void {
    this.api.me().subscribe({
      next: (profile) => {
        this.accountEmail = profile.email;
        this.createdAt = profile.createdAt;
        this.postCount = profile.postCount;
        this.profilePhotoUrl = profile.profilePhotoUrl ?? null;
        this.form.patchValue({ userName: profile.userName, bio: profile.bio ?? '' });
      }
    });
  }

  uploadPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const photo = input.files?.[0];
    if (!photo) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024) {
      this.message = 'Escolha uma imagem JPEG, PNG ou WebP de até 5 MB.';
      input.value = '';
      return;
    }

    this.api.uploadProfilePhoto(photo).subscribe({
      next: (result) => {
        this.message = '';
        this.profilePhotoUrl = result.profilePhotoUrl;
        input.value = '';
        const current = this.auth.user();
        if (current) this.auth.user.set({ ...current, profilePhotoUrl: result.profilePhotoUrl });
      },
      error: (error: { error?: { title?: string; detail?: string } }) => {
        this.message = error.error?.detail ?? error.error?.title ?? 'Não foi possível enviar a foto.';
      }
    });
  }

  save(): void {
    if (this.form.invalid) return;
    this.saving = true;
    this.saved = false;
    this.message = '';
    const value = this.form.getRawValue();
    this.api.updateProfile({
      userName: value.userName ?? '',
      bio: value.bio ?? ''
    }).pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.saved = true;
        const current = this.auth.user();
        if (current) this.auth.user.set({ ...current, userName: this.form.controls.userName.value! });
      },
      error: (error: { error?: { title?: string; detail?: string } }) => {
        this.message = error.error?.detail ?? error.error?.title ?? 'Não foi possível salvar as alterações.';
      }
    });
  }
}
