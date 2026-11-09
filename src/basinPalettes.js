const palettes = {
  emerald: {
    name: 'emerald',
    body: ['#246967', '#17494f', '#103440', '#0a202e'],
    rim: ['#52bdb0', '#215a66', '#7fe9ce', '#abffe2'],
    water: ['#073c49', '#076b6c', '#0aa38e', '#3be1b0', '#c0ffd7'],
    inner: '#082b39', edge: '#8ffff0', carving: '#163f4e', shadow: '#020e16',
    cloud: [139, 255, 209], mist: [67, 223, 174], light: [187, 255, 228], spark: '#ddffbe'
  },
  silver: {
    name: 'silver',
    body: ['#62747c', '#41535e', '#283b49', '#142532'],
    rim: ['#aabfc5', '#506a79', '#c1d9dd', '#e7f5f3'],
    water: ['#294958', '#557b89', '#8baeb6', '#bed9db', '#f1faf5'],
    inner: '#1a3343', edge: '#e5f7f3', carving: '#435d6b', shadow: '#030c14',
    cloud: [236, 249, 245], mist: [205, 226, 232], light: [248, 255, 250], spark: '#f3fff9'
  }
};

export function getBasinPalette() {
  return new URLSearchParams(window.location.search).get('palette') === 'silver' ? palettes.silver : palettes.emerald;
}

export const rgba = (color, alpha) => `rgba(${color.join(',')},${alpha})`;
