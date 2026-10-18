const paths = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  projects: 'M3 7V4h7l3 3h8v13H3V7Z M3 10h18',
  connection: 'M8 3v4 M16 3v4 M5 7h14 M7 7v4a5 5 0 0 0 10 0V7 M12 16v5',
  shield: 'M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6l-8-3Z M8 12l3 3 5-6',
  plus: 'M12 5v14 M5 12h14',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
  external: 'M6 18 18 6 M7 6h11v11',
  calendar: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2',
  copy: 'M8 8h12v13H8z M16 8V3H3v13h5',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 16v5h16v-5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  eyeOff: 'M3 3l18 18 M10 5c7-1 12 7 12 7a21 21 0 0 1-4 4 M6 6a21 21 0 0 0-4 6s4 7 10 7a13 13 0 0 0 5-1 M10 10a3 3 0 0 0 4 4',
  close: 'M6 6l12 12 M6 18 18 6',
  chevron: 'M9 5l7 7-7 7',
};

export default function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg className="ui-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  );
}
