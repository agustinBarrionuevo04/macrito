import { describe, expect, it } from 'vitest';
import {
  decodeArgenfoodsHtml,
  parseFoodPage,
  parseIndexLetters,
  parseIndexPage,
  toArgenfoodsFood,
} from './argenfoods';

/** Misma estructura que las páginas reales, con alimentos y valores inventados para el test. */
function page(title: string, rows: [string, string, string][]): string {
  const body = rows
    .map(
      ([label, value, unit]) =>
        `<tr bgcolor="#FFFFFF" valign=middle><td align=left width="21%" height="25"><p class="C1">${label}</p></td><td align=left width="80%"><p class="C2"> ${value}&nbsp;</p></td><td align=left width="80%"><p class="C3">${unit}&nbsp;</p></td><td align=right width="30%"><p class="C3">`,
    )
    .join('\n');
  return `<html><head><title>${title}</title></head><body><table>\n${body}\n</table></body></html>`;
}

const full: [string, string, string][] = [
  ['Energía', '1000', 'kj'],
  ['Energía', '239', 'kcal'],
  ['Agua', '70', 'g'],
  ['Proteínas', '20', 'g'],
  ['Grasa Total', '10', 'g'],
  ['Carbohidratos totales', '12', 'g'],
  ['Carbohidratos disponibles', '10', 'g'],
  ['Fibra dietética', '2', 'g'],
  ['Sodio', '300', 'mg'],
  ['Vitamina C', '', 'mg'],
];

const parse = (html: string, code = 1) => {
  const parsed = parseFoodPage(html, code);
  if (!parsed) throw new Error('no se pudo interpretar la página');
  return parsed;
};

describe('parseFoodPage', () => {
  it('lee nombre y valores, distinguiendo la energía en kJ y kcal', () => {
    const parsed = parse(page('Alimento de prueba, crudo', full), 7);
    expect(parsed.code).toBe(7);
    expect(parsed.name).toBe('Alimento de prueba, crudo');
    expect(parsed.values['energia kj']).toBe(1000);
    expect(parsed.values['energia kcal']).toBe(239);
    expect(parsed.values['proteinas']).toBe(20);
    expect(parsed.values['grasa total']).toBe(10);
    expect(parsed.values['fibra dietetica']).toBe(2);
  });

  it('las celdas vacías quedan en null, no en 0', () => {
    expect(parse(page('X', full)).values['vitamina c']).toBeNull();
  });

  it('decodifica entidades HTML y espacios del título', () => {
    expect(parse(page('Pan  de  ma&iacute;z &amp; queso', full)).name).toBe('Pan de maíz & queso');
  });

  it('acepta decimales con coma', () => {
    const parsed = parse(page('X', [['Proteínas', '6,9', 'g']]));
    expect(parsed.values['proteinas']).toBe(6.9);
  });

  it('devuelve null si no hay título o no hay tabla', () => {
    expect(parseFoodPage('<html><title> </title></html>', 1)).toBeNull();
    expect(parseFoodPage('<html><title>Algo</title><body>nada</body></html>', 1)).toBeNull();
    expect(parseFoodPage('<html><body>sin titulo</body></html>', 1)).toBeNull();
  });
});

describe('decodeArgenfoodsHtml', () => {
  it('decodifica windows-1252', () => {
    // "Proteínas" en windows-1252: í = 0xED
    const bytes = Uint8Array.from([0x50, 0x72, 0x6f, 0x74, 0x65, 0xed, 0x6e, 0x61, 0x73]);
    expect(decodeArgenfoodsHtml(bytes)).toBe('Proteínas');
  });
});

describe('parseIndexPage / parseIndexLetters', () => {
  it('lista los códigos sin repetir', () => {
    const html = `<a href="../Codigo/164.htm">Abadejo      164</a><br><a href="../Codigo/148.htm">Aceite 148</a><a href="../Codigo/164.htm">otra vez</a>`;
    expect(parseIndexPage(html).sort((a, b) => a - b)).toEqual([148, 164]);
  });

  it('lista las letras del índice general, con o sin ancla', () => {
    const html = `<a href="A.htm">A</a> <a href="D.htm#D">D</a> <a href="Cond_Uso.htm">uso</a> <a href="A.htm">A</a> <a href="../Grupo/Carnes.pdf">x</a>`;
    expect(parseIndexLetters(html).sort()).toEqual(['A', 'D']);
  });
});

describe('toArgenfoodsFood', () => {
  const without = (...labels: string[]) => full.filter(([label]) => !labels.includes(label));
  const ok = (rows: [string, string, string][]) => {
    const result = toArgenfoodsFood(parse(page('X', rows), 5));
    if (result.status !== 'ok') throw new Error(`se esperaba ok, vino ${result.reason}`);
    return result;
  };

  it('arma el alimento ar_seed con carbohidratos disponibles, fibra y sodio', () => {
    const result = toArgenfoodsFood(parse(page('Alimento de prueba', full), 42));
    expect(result).toEqual({
      status: 'ok',
      flags: [],
      notes: [],
      food: {
        id: '',
        source: 'ar_seed',
        sourceId: '42',
        name: 'Alimento de prueba',
        per100g: { kcal: 239, protein_g: 20, carbs_g: 10, fat_g: 10, fiber_g: 2, sodium_mg: 300 },
        portions: [],
      },
    });
  });

  it('sin kcal pero con kJ usa kJ ÷ 4.184', () => {
    const rows = full.filter(([label, , unit]) => !(label === 'Energía' && unit === 'kcal'));
    expect(ok(rows).food.per100g.kcal).toBe(239.01); // 1000 / 4.184
  });

  it('sin carbohidratos disponibles usa totales − fibra', () => {
    expect(ok(without('Carbohidratos disponibles')).food.per100g.carbs_g).toBe(10);
  });

  it('con solo carbohidratos totales los usa y lo anota, sin pedir revisión', () => {
    const result = ok(without('Carbohidratos disponibles', 'Fibra dietética'));
    expect(result.food.per100g.carbs_g).toBe(12);
    expect(result.food.per100g).not.toHaveProperty('fiber_g');
    expect(result.notes).toEqual(['carbs_total_only']);
    expect(result.flags).toEqual([]);
  });

  describe('valores en blanco', () => {
    it('sin energía pero con los tres macros la calcula con los factores 4/4/9 de la tabla', () => {
      const rows = full.filter(([label]) => label !== 'Energía');
      const result = ok(rows);
      expect(result.food.per100g.kcal).toBe(210); // 4·20 + 4·10 + 9·10
      expect(result.notes).toEqual(['energy_computed']);
    });

    it('carnes y pescados: sin carbohidratos y con energía = 4·proteína + 9·grasa → carbohidratos 0', () => {
      const rows: [string, string, string][] = [
        ['Energía', '219', 'kcal'],
        ['Proteínas', '22', 'g'],
        ['Grasa Total', '14.5', 'g'],
        ['Carbohidratos totales', '', 'g'],
        ['Carbohidratos disponibles', '', 'g'],
      ];
      const result = ok(rows);
      expect(result.food.per100g).toMatchObject({
        kcal: 219,
        protein_g: 22,
        fat_g: 14.5,
        carbs_g: 0,
      });
      expect(result.notes).toEqual(['carbs_inferred_zero']);
      expect(result.flags).toEqual([]);
    });

    it('verduras: sin grasa y con energía = 4·proteína + 4·carbohidratos → grasa 0', () => {
      const rows: [string, string, string][] = [
        ['Energía', '70', 'kcal'],
        ['Proteínas', '2.4', 'g'],
        ['Grasa Total', '', 'g'],
        ['Carbohidratos disponibles', '15', 'g'],
      ];
      const result = ok(rows);
      expect(result.food.per100g.fat_g).toBe(0);
      expect(result.notes).toEqual(['fat_inferred_zero']);
    });

    it('sin proteína y con energía = 4·carbohidratos + 9·grasa → proteína 0', () => {
      const rows: [string, string, string][] = [
        ['Energía', '90', 'kcal'],
        ['Proteínas', '', 'g'],
        ['Grasa Total', '10', 'g'],
        ['Carbohidratos disponibles', '0', 'g'],
      ];
      const result = ok(rows);
      expect(result.food.per100g.protein_g).toBe(0);
      expect(result.notes).toEqual(['protein_inferred_zero']);
    });

    it('no completa nada si la energía no concuerda con los macros presentes', () => {
      // 4·20 + 9·10 = 170, pero la energía publicada es 239: algo falta y no se sabe qué.
      expect(
        toArgenfoodsFood(
          parse(page('X', without('Carbohidratos disponibles', 'Carbohidratos totales')), 9),
        ),
      ).toMatchObject({
        status: 'skipped',
        reason: 'missing_carbs',
      });
      expect(toArgenfoodsFood(parse(page('X', without('Proteínas')), 9))).toMatchObject({
        reason: 'missing_protein',
      });
      expect(toArgenfoodsFood(parse(page('X', without('Grasa Total')), 9))).toMatchObject({
        reason: 'missing_fat',
      });
    });

    it('aceites: sin proteína ni carbohidratos y con energía = 9·grasa → ambos 0', () => {
      const rows: [string, string, string][] = [
        ['Energía', '900', 'kcal'],
        ['Proteínas', '', 'g'],
        ['Grasa Total', '100', 'g'],
        ['Carbohidratos totales', '', 'g'],
      ];
      const result = ok(rows);
      expect(result.food.per100g).toMatchObject({
        kcal: 900,
        protein_g: 0,
        fat_g: 100,
        carbs_g: 0,
      });
      expect(result.notes).toEqual(['protein_inferred_zero', 'carbs_inferred_zero']);
    });

    it('para completar un valor exige que la energía coincida a ±3 kcal, no más', () => {
      const withEnergy = (kcal: string): [string, string, string][] => [
        ['Energía', kcal, 'kcal'],
        ['Proteínas', '22', 'g'],
        ['Grasa Total', '14.5', 'g'],
        ['Carbohidratos disponibles', '', 'g'],
      ];
      // 4·22 + 9·14.5 = 218.5
      expect(toArgenfoodsFood(parse(page('X', withEnergy('221')), 1))).toMatchObject({
        status: 'ok',
      });
      expect(toArgenfoodsFood(parse(page('X', withEnergy('222')), 1))).toMatchObject({
        status: 'skipped',
        reason: 'missing_carbs',
      });
    });

    it('no completa nada si faltan dos macros y la energía no los respalda', () => {
      const result = toArgenfoodsFood(parse(page('X', without('Proteínas', 'Grasa Total')), 9));
      expect(result).toMatchObject({ status: 'skipped' });
    });

    it('sin energía y sin macros suficientes para calcularla, omite', () => {
      const rows = full.filter(([label]) => label !== 'Energía' && label !== 'Proteínas');
      expect(toArgenfoodsFood(parse(page('Sin datos', rows), 9))).toEqual({
        status: 'skipped',
        reason: 'missing_energy',
        code: 9,
        name: 'Sin datos',
      });
    });

    it('una celda vacía en un macro esencial no se toma como 0 si la energía no lo respalda', () => {
      const rows = full.map(([l, v, u]): [string, string, string] =>
        l === 'Proteínas' ? [l, '', u] : [l, v, u],
      );
      expect(toArgenfoodsFood(parse(page('X', rows)))).toMatchObject({
        status: 'skipped',
        reason: 'missing_protein',
      });
    });
  });

  it('omite valores imposibles', () => {
    const rows = full.map(([l, v, u]): [string, string, string] =>
      l === 'Energía' && u === 'kcal' ? [l, '4000', u] : [l, v, u],
    );
    expect(toArgenfoodsFood(parse(page('X', rows)))).toMatchObject({
      status: 'skipped',
      reason: 'implausible_values',
    });
  });

  it('marca las kcal que no cierran con proteína/carbohidratos/grasa (Atwater 4/4/9)', () => {
    // 4·20 + 4·10 + 9·10 = 210; publicado 400 → desvío 190 kcal.
    const rows = full.map(([l, v, u]): [string, string, string] =>
      l === 'Energía' && u === 'kcal' ? [l, '400', u] : [l, v, u],
    );
    expect(ok(rows).flags).toEqual(['kcal_mismatch']);
  });

  it('no marca desvíos chicos', () => {
    // Publicado 239 vs Atwater 210: 29 kcal (12 %), dentro de la tolerancia.
    expect(ok(full).flags).toEqual([]);
  });

  it('un alimento sin sodio ni fibra queda sin esos campos', () => {
    expect(ok(without('Sodio', 'Fibra dietética')).food.per100g).toEqual({
      kcal: 239,
      protein_g: 20,
      carbs_g: 10,
      fat_g: 10,
    });
  });
});
