import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'feed' },
  { path: 'feed', loadComponent: () => import('./feed-page').then((module) => module.FeedPage) },
  { path: 'map', loadComponent: () => import('./map-page').then((module) => module.MapPage) },
  { path: 'profile', canActivate: [authGuard], loadComponent: () => import('./profile-page').then((module) => module.ProfilePage) },
  { path: 'login', loadComponent: () => import('./auth-page').then((module) => module.AuthPage) },
  { path: 'register', loadComponent: () => import('./auth-page').then((module) => module.AuthPage) },
  { path: 'confirm-email', loadComponent: () => import('./confirm-email-page').then((module) => module.ConfirmEmailPage) },
  { path: 'forgot-password', loadComponent: () => import('./recovery-page').then((module) => module.RecoveryPage) },
  { path: 'reset-password', loadComponent: () => import('./recovery-page').then((module) => module.RecoveryPage) },
  { path: '**', redirectTo: 'feed' }
];
