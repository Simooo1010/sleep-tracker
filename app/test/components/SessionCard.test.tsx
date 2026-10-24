import { renderToStaticMarkup } from 'react-dom/server';
import { it, expect } from 'vitest';
import { SessionCard } from '../../src/components/SessionCard';
it('x', () => { const h = renderToStaticMarkup(<SessionCard status="stimata" duration="7h 32m" />); console.log(h); expect(h).toContain('7h'); });
