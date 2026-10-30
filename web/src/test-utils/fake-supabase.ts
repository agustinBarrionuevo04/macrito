import { randomUUID } from 'node:crypto';

/**
 * Supabase en memoria para tests de acciones y acceso a datos. Implementa lo que usa la app
 * (select/insert/update/delete/upsert con eq, in, neq, gte, lte, order, limit, single y
 * maybeSingle) y emula RLS por columna dueña: un usuario solo lee, modifica, borra o inserta filas
 * propias. La RLS real se prueba con pgTAP; esto sirve para comprobar que el código no depende de
 * lo que manda el cliente y que no toca filas ajenas.
 */

export type Row = Record<string, unknown>;

type FilterOp = 'eq' | 'neq' | 'in' | 'gte' | 'lte';
type Filter = { column: string; op: FilterOp; value: unknown };
type Operation = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

export type RecordedCall = {
  table: string;
  op: Operation;
  payload?: Row | Row[];
  filters: Filter[];
  options?: Record<string, unknown>;
};

export type FakeTable = {
  rows?: Row[];
  /** Columna con el id del dueño. Si está, aplica RLS. */
  ownerColumn?: string;
};

export type FakeSupabaseOptions = {
  /** Usuario de la sesión; `null` simula que no hay sesión. */
  userId: string | null;
  email?: string;
  tables: Record<string, FakeTable>;
  /** Devuelve un error para simular que falla una consulta concreta. */
  failWhen?: (call: RecordedCall) => string | null;
};

type Result = { data: unknown; error: { message: string; code?: string } | null };

const compare = (a: unknown, b: unknown) =>
  a === b ? 0 : (a as string | number) < (b as string | number) ? -1 : 1;

function matches(row: Row, filter: Filter): boolean {
  const value = row[filter.column];
  switch (filter.op) {
    case 'eq':
      return value === filter.value;
    case 'neq':
      return value !== filter.value;
    case 'in':
      return Array.isArray(filter.value) && filter.value.includes(value);
    case 'gte':
      return compare(value, filter.value) >= 0;
    case 'lte':
      return compare(value, filter.value) <= 0;
  }
}

export function createFakeSupabase(options: FakeSupabaseOptions) {
  const tables: Record<string, Row[]> = {};
  for (const [name, table] of Object.entries(options.tables))
    tables[name] = [...(table.rows ?? [])];
  const calls: RecordedCall[] = [];

  const owner = (table: string) => options.tables[table]?.ownerColumn;
  const visible = (table: string, row: Row) => {
    const column = owner(table);
    return !column || row[column] === options.userId;
  };

  function execute(table: string, state: BuilderState): Result {
    const call: RecordedCall = {
      table,
      op: state.op,
      filters: state.filters,
      ...(state.payload !== undefined ? { payload: state.payload } : {}),
      ...(state.options ? { options: state.options } : {}),
    };
    calls.push(call);

    const injected = options.failWhen?.(call);
    if (injected) return { data: null, error: { message: injected } };
    if (!tables[table]) return { data: null, error: { message: `tabla desconocida: ${table}` } };
    const rows = tables[table];

    const selected = (list: Row[]): Result => {
      let out = list.filter((row) => state.filters.every((f) => matches(row, f)));
      if (state.order) {
        const { column, ascending } = state.order;
        out = [...out].sort((a, b) => compare(a[column], b[column]) * (ascending ? 1 : -1));
      }
      if (state.limit !== undefined) out = out.slice(0, state.limit);
      if (state.single === 'one') {
        return out.length === 1
          ? { data: out[0], error: null }
          : { data: null, error: { message: 'se esperaba una fila', code: 'PGRST116' } };
      }
      if (state.single === 'maybe') {
        if (out.length > 1)
          return { data: null, error: { message: 'más de una fila', code: 'PGRST116' } };
        return { data: out[0] ?? null, error: null };
      }
      return { data: out, error: null };
    };

    const ownerColumn = owner(table);
    const insertRow = (payload: Row): Row | string => {
      const row: Row = { id: randomUUID(), created_at: new Date().toISOString(), ...payload };
      if (ownerColumn && row[ownerColumn] !== options.userId)
        return 'new row violates row-level security policy';
      rows.push(row);
      return row;
    };

    switch (state.op) {
      case 'select':
        return selected(rows.filter((row) => visible(table, row)));

      case 'insert': {
        const created: Row[] = [];
        for (const payload of [state.payload].flat() as Row[]) {
          const row = insertRow(payload);
          if (typeof row === 'string')
            return { data: null, error: { message: row, code: '42501' } };
          created.push(row);
        }
        return state.returning ? selected(created) : { data: null, error: null };
      }

      case 'upsert': {
        const columns = String(state.options?.onConflict ?? 'id').split(',');
        const touched: Row[] = [];
        for (const payload of [state.payload].flat() as Row[]) {
          const existing = rows.find(
            (row) =>
              visible(table, row) && columns.every((column) => row[column] === payload[column]),
          );
          if (existing) {
            Object.assign(existing, payload);
            touched.push(existing);
          } else {
            const row = insertRow(payload);
            if (typeof row === 'string')
              return { data: null, error: { message: row, code: '42501' } };
            touched.push(row);
          }
        }
        return state.returning ? selected(touched) : { data: null, error: null };
      }

      case 'update': {
        const targets = rows.filter(
          (row) => visible(table, row) && state.filters.every((f) => matches(row, f)),
        );
        const patch = state.payload as Row;
        if (ownerColumn && ownerColumn in patch && patch[ownerColumn] !== options.userId) {
          return {
            data: null,
            error: { message: 'new row violates row-level security policy', code: '42501' },
          };
        }
        for (const row of targets) Object.assign(row, patch);
        return state.returning ? selected(targets) : { data: null, error: null };
      }

      case 'delete': {
        const removed = rows.filter(
          (row) => visible(table, row) && state.filters.every((f) => matches(row, f)),
        );
        tables[table] = rows.filter((row) => !removed.includes(row));
        return state.returning ? selected(removed) : { data: null, error: null };
      }
    }
  }

  type BuilderState = {
    op: Operation;
    filters: Filter[];
    payload?: Row | Row[];
    options?: Record<string, unknown>;
    order?: { column: string; ascending: boolean };
    limit?: number;
    single?: 'one' | 'maybe';
    returning: boolean;
  };

  function from(table: string) {
    const state: BuilderState = { op: 'select', filters: [], returning: false };
    const builder = {
      // Las columnas pedidas no se aplican: siempre devuelve la fila completa.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      select(_columns?: string) {
        if (state.op !== 'select') state.returning = true;
        return builder;
      },
      insert(payload: Row | Row[]) {
        state.op = 'insert';
        state.payload = payload;
        return builder;
      },
      upsert(payload: Row | Row[], upsertOptions?: Record<string, unknown>) {
        state.op = 'upsert';
        state.payload = payload;
        if (upsertOptions) state.options = upsertOptions;
        return builder;
      },
      update(payload: Row) {
        state.op = 'update';
        state.payload = payload;
        return builder;
      },
      delete() {
        state.op = 'delete';
        return builder;
      },
      eq: (column: string, value: unknown) => (
        state.filters.push({ column, op: 'eq', value }),
        builder
      ),
      neq: (column: string, value: unknown) => (
        state.filters.push({ column, op: 'neq', value }),
        builder
      ),
      in: (column: string, value: unknown[]) => (
        state.filters.push({ column, op: 'in', value }),
        builder
      ),
      gte: (column: string, value: unknown) => (
        state.filters.push({ column, op: 'gte', value }),
        builder
      ),
      lte: (column: string, value: unknown) => (
        state.filters.push({ column, op: 'lte', value }),
        builder
      ),
      order: (column: string, orderOptions?: { ascending?: boolean }) => (
        (state.order = { column, ascending: orderOptions?.ascending ?? true }),
        builder
      ),
      limit: (n: number) => ((state.limit = n), builder),
      single: () => ((state.single = 'one'), Promise.resolve(execute(table, state))),
      maybeSingle: () => ((state.single = 'maybe'), Promise.resolve(execute(table, state))),
      then: (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(execute(table, state)).then(onFulfilled, onRejected),
    };
    return builder;
  }

  const client = {
    auth: {
      getUser: async () => ({
        data: {
          user: options.userId
            ? { id: options.userId, email: options.email ?? 'test@test.local' }
            : null,
        },
      }),
    },
    from,
  };

  return { client, calls, rows: (table: string) => tables[table] ?? [] };
}
