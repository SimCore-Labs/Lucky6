import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#73d9cb' },
    secondary: { main: '#f4c66e' },
    background: { default: '#0b1421', paper: '#19283a' },
    text: { primary: '#f3f0e8', secondary: '#a6b1bd' },
    success: { main: '#70c9a5' },
    error: { main: '#eb897a' },
  },
  shape: { borderRadius: 3 },
  typography: {
    fontFamily: '"Avenir Next", Avenir, "Segoe UI", sans-serif',
    h1: {
      fontSize: 'clamp(2.6rem, 6vw, 5.4rem)',
      fontWeight: 700,
      letterSpacing: '-0.055em',
      lineHeight: 0.98,
    },
    h2: { fontSize: '2rem', fontWeight: 650, letterSpacing: '-0.035em' },
    button: { textTransform: 'none', fontWeight: 650 },
  },
});
