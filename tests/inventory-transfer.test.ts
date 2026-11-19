import { describe, expect, it } from 'vitest';
import { compatibleUnit, combineQuantity } from '../lib/data/inventory';

describe('grocery inventory unit merging', () => {
  it('combines grams into kilograms safely', () => {
    expect(combineQuantity(500, 'g', 500, 'g')).toEqual({ quantity: 1, unit: 'kg' });
  });

  it('combines litres and millilitres safely', () => {
    expect(combineQuantity(500, 'ml', 1, 'litre')).toEqual({ quantity: 1.5, unit: 'litre' });
  });

  it('combines count units', () => {
    expect(combineQuantity(2, 'units', 3, 'units')).toEqual({ quantity: 5, unit: 'units' });
  });

  it('does not merge incompatible units', () => {
    expect(compatibleUnit('g', 'litre')).toBe(false);
  });
});
