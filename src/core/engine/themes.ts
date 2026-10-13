export interface Theme {
  id: string;
  name: string;
  bg: string;
  text: string;
  headerBg: string;
  headerText: string;
  zebraBg: string;
  grid: string;
}

export const THEMES: Theme[] = [
  { id: 'paper', name: 'Paper', bg: '#ffffff', text: '#17202e', headerBg: '#e9edf3', headerText: '#17202e', zebraBg: '#f6f8fb', grid: '#c9d0da' },
  { id: 'cobalt', name: 'Cobalt', bg: '#ffffff', text: '#14213d', headerBg: '#2f5bea', headerText: '#ffffff', zebraBg: '#eef2ff', grid: '#b7c4f2' },
  { id: 'forest', name: 'Forest', bg: '#ffffff', text: '#1d3125', headerBg: '#2f6b4f', headerText: '#ffffff', zebraBg: '#eef6f1', grid: '#b5cfc0' },
  { id: 'ember', name: 'Ember', bg: '#fffdfb', text: '#3a1f12', headerBg: '#c2410c', headerText: '#fff7ed', zebraBg: '#fff1e6', grid: '#e8c4ad' },
  { id: 'plum', name: 'Plum', bg: '#ffffff', text: '#2b1636', headerBg: '#6b2d7b', headerText: '#ffffff', zebraBg: '#f6edf8', grid: '#d6bfdc' },
  { id: 'slate', name: 'Slate', bg: '#f8fafc', text: '#0f172a', headerBg: '#334155', headerText: '#f1f5f9', zebraBg: '#eef2f6', grid: '#cbd5e1' },
  { id: 'midnight', name: 'Midnight', bg: '#161b26', text: '#e6eaf2', headerBg: '#273248', headerText: '#ffffff', zebraBg: '#1c2230', grid: '#364158' },
  { id: 'mono', name: 'Ink only', bg: '#ffffff', text: '#000000', headerBg: '#ffffff', headerText: '#000000', zebraBg: '#ffffff', grid: '#000000' },
];

export const getTheme = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];
