import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#74a9ff' },
    secondary: { main: '#edbb68' },
    background: { default: '#101a2a', paper: '#18263a' },
    text: { primary: '#f3f4ef', secondary: '#aab6c5' },
    success: { main: '#61c49b' },
    error: { main: '#e48679' },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: 'Arial, Helvetica, sans-serif',
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
