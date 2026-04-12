import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'chat'
  },
  {
    path: 'chat',
    loadChildren: () => import('./routes/chat.routes').then((m) => m.CHAT_ROUTES)
  },
  {
    path: 'time',
    loadChildren: () => import('./routes/time.routes').then((m) => m.TIME_ROUTES)
  },
  {
    path: 'contacts',
    loadChildren: () => import('./routes/contacts.routes').then((m) => m.CONTACTS_ROUTES)
  },
  {
    path: '**',
    redirectTo: 'chat'
  }
];
