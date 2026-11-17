import { Component } from '@angular/core';
import { MapComponent } from './map/map';

@Component({
  imports: [MapComponent],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
