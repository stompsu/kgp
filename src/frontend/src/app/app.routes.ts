import { Routes } from '@angular/router';
import { MapPage } from './map-page/map-page';

export const routes: Routes = [
  { path: '', component: MapPage, title: 'Korona Gór Polski' },
  { path: 'peaks/:slug', component: MapPage, title: 'Korona Gór Polski' },
  { path: '**', redirectTo: '' },
];
