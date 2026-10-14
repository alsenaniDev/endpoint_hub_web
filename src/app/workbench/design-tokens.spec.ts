describe('Shared design system colors', () => {
  let wasDark: boolean;
  let probe: HTMLDivElement;

  beforeEach(() => {
    wasDark = document.body.classList.contains('dark-mode');
    document.body.classList.remove('dark-mode');
    probe = document.createElement('div');
    document.body.appendChild(probe);
  });

  afterEach(() => {
    probe.remove();
    document.body.classList.toggle('dark-mode', wasDark);
  });

  function token(name: string): string {
    return getComputedStyle(probe).getPropertyValue(name).trim().toUpperCase();
  }

  function contrast(foreground: string, background: string): number {
    function luminance(hex: string): number {
      const channels = [1, 3, 5].map(offset => {
        const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    }
    const a = luminance(foreground);
    const b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  it('uses the exact supplied light palette', () => {
    const expected: Record<string, string> = {
      '--bg-base': '#F4F6F8', '--bg-surface': '#FFFFFF', '--text': '#17202A',
      '--text-muted': '#73808D', '--accent': '#2563EB', '--blue': '#2563EB',
      '--green': '#16805C', '--yellow': '#A15C00', '--orange': '#A15C00',
      '--red': '#C7383D', '--code': '#101820', '--border': '#D9E0E7',
      '--green-bg': '#E7F7F1', '--yellow-bg': '#FFF5DC', '--red-bg': '#FDEDEE',
      '--primary': '#17202A', '--accent-fg': '#FFFFFF', '--primary-fg': '#FFFFFF'
    };
    for (const [name, value] of Object.entries(expected)) expect(token(name)).withContext(name).toBe(value);
  });

  it('shares global colors with Workbench and PrimeNG', () => {
    const aliases: Record<string, string> = {
      '--wb-canvas': '--bg-base', '--wb-surface': '--bg-surface', '--wb-ink': '--text',
      '--wb-muted': '--text-muted', '--wb-readable-muted': '--text-secondary',
      '--wb-border': '--border', '--wb-accent': '--accent', '--wb-accent-soft': '--blue-bg',
      '--wb-success': '--green', '--wb-warning': '--yellow', '--wb-danger': '--red',
      '--wb-code': '--code', '--primary-color': '--accent', '--text-color': '--text'
    };
    for (const dark of [false, true]) {
      document.body.classList.toggle('dark-mode', dark);
      for (const [alias, source] of Object.entries(aliases)) expect(token(alias)).withContext(alias).toBe(token(source));
    }
  });

  it('preserves the existing dark neutrals and uses its existing blue as product accent', () => {
    document.body.classList.add('dark-mode');
    expect(token('--bg-base')).toBe('#0F172A');
    expect(token('--bg-surface')).toBe('#1E293B');
    expect(token('--text')).toBe('#F1F5F9');
    expect(token('--green')).toBe('#4ADE80');
    expect(token('--accent')).toBe('#60A5FA');
    expect(token('--accent-fg')).toBe('#0F172A');
    expect(token('--wb-canvas')).toBe('#0F172A');
    expect(token('--wb-accent')).toBe('#60A5FA');
  });

  it('keeps text and solid button foregrounds at AA contrast in both themes', () => {
    for (const dark of [false, true]) {
      document.body.classList.toggle('dark-mode', dark);
      for (const background of ['--bg-surface', '--bg-base', '--blue-bg']) {
        expect(contrast(token('--text-secondary'), token(background))).withContext(background).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(token('--accent-fg'), token('--accent'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token('--primary-fg'), token('--primary'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token('--code-fg'), token('--code'))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('uses readable semantic text on feedback backgrounds in both themes', () => {
    for (const dark of [false, true]) {
      document.body.classList.toggle('dark-mode', dark);
      for (const [foreground, background] of [
        ['--green-text', '--green-bg'], ['--yellow', '--yellow-bg'], ['--red', '--red-bg']
      ]) expect(contrast(token(foreground), token(background))).withContext(foreground).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('restores light colors after toggling dark mode off', () => {
    document.body.classList.add('dark-mode');
    probe.style.backgroundColor = 'var(--wb-canvas)';
    expect(getComputedStyle(probe).backgroundColor).toBe('rgb(15, 23, 42)');
    document.body.classList.remove('dark-mode');
    expect(getComputedStyle(probe).backgroundColor).toBe('rgb(244, 246, 248)');
  });
});
