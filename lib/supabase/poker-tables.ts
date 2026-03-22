import type { AnteType, StraddleType, TableRow } from '@/types/poker';

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => unknown;
    insert: (values: Record<string, unknown>) => unknown;
  };
};

type PostgrestErrorLike = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined;

type PostgrestResponseLike = {
  data: unknown;
  error: PostgrestErrorLike;
};

type PokerTableSelectQuery = PromiseLike<PostgrestResponseLike> & {
  eq: (column: string, value: unknown) => PokerTableSelectQuery;
  order: (column: string, options: { ascending: boolean }) => PokerTableSelectQuery;
  limit: (count: number) => PokerTableSelectQuery;
  single: () => Promise<PostgrestResponseLike>;
};

type PokerTableInsertQuery = {
  select: (columns: string) => {
    single: () => Promise<PostgrestResponseLike>;
  };
};

type PokerTableInsertInput = Pick<
  TableRow,
  'name' | 'table_size' | 'small_blind' | 'big_blind' | 'min_buy_in' | 'max_buy_in'
> & {
  created_by: string;
  ante?: number;
  ante_type?: AnteType;
  straddle_type?: StraddleType;
};

const BASE_POKER_TABLE_COLUMNS = [
  'id',
  'name',
  'table_size',
  'small_blind',
  'big_blind',
  'min_buy_in',
  'max_buy_in',
  'is_active',
  'current_players',
  'created_by',
  'created_at',
].join(', ');

const OPTIONAL_POKER_TABLE_COLUMNS = [
  'ante',
  'ante_type',
  'straddle_type',
].join(', ');

const FULL_POKER_TABLE_COLUMNS = `${BASE_POKER_TABLE_COLUMNS}, ${OPTIONAL_POKER_TABLE_COLUMNS}`;

let pokerTableBettingColumnsSupported: boolean | null = null;
let pokerTableBettingColumnsPromise: Promise<boolean> | null = null;

function normalizeAnteType(value: unknown): AnteType {
  return value === 'table' || value === 'big_blind' ? value : 'none';
}

function normalizeStraddleType(value: unknown): StraddleType {
  return value === 'utg' || value === 'button' ? value : 'none';
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function normalizePokerTableRow(raw: Record<string, unknown>): TableRow {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    table_size: toNumber(raw.table_size),
    small_blind: toNumber(raw.small_blind),
    big_blind: toNumber(raw.big_blind),
    min_buy_in: toNumber(raw.min_buy_in),
    max_buy_in: toNumber(raw.max_buy_in),
    ante: toNumber(raw.ante),
    ante_type: normalizeAnteType(raw.ante_type),
    straddle_type: normalizeStraddleType(raw.straddle_type),
    is_active: Boolean(raw.is_active),
    current_players: toNumber(raw.current_players),
    created_by: typeof raw.created_by === 'string' ? raw.created_by : null,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
  };
}

export function isMissingPokerTableBettingColumnsError(error: PostgrestErrorLike): boolean {
  const text = [error?.message, error?.details, error?.hint]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();

  if (!text) return false;

  const referencesOptionalColumn = ['ante', 'ante_type', 'straddle_type'].some(column =>
    text.includes(column)
  );

  return referencesOptionalColumn && (
    text.includes('schema cache') ||
    text.includes('column') ||
    text.includes('does not exist')
  );
}

function rememberPokerTableBettingColumnsSupport(isSupported: boolean) {
  pokerTableBettingColumnsSupported = isSupported;
}

async function runPokerTableSelect(
  supabase: SupabaseLike,
  configure: (query: PokerTableSelectQuery) => Promise<PostgrestResponseLike> | PokerTableSelectQuery,
  includeBettingColumns: boolean
) {
  const shouldTryFullColumns = includeBettingColumns && pokerTableBettingColumnsSupported !== false;
  const initialColumns = shouldTryFullColumns ? FULL_POKER_TABLE_COLUMNS : BASE_POKER_TABLE_COLUMNS;
  const initialQuery = supabase.from('poker_tables').select(initialColumns) as PokerTableSelectQuery;

  let { data, error } = await configure(initialQuery);

  if (!error && shouldTryFullColumns) {
    rememberPokerTableBettingColumnsSupport(true);
  }

  if (error && shouldTryFullColumns && isMissingPokerTableBettingColumnsError(error)) {
    rememberPokerTableBettingColumnsSupport(false);
    const fallbackQuery = supabase.from('poker_tables').select(BASE_POKER_TABLE_COLUMNS) as PokerTableSelectQuery;
    ({ data, error } = await configure(fallbackQuery));
  }

  return { data, error };
}

function buildPokerTableInsertData(input: PokerTableInsertInput, includeBettingColumns: boolean) {
  const insertData: Record<string, unknown> = {
    name: input.name,
    table_size: input.table_size,
    small_blind: input.small_blind,
    big_blind: input.big_blind,
    min_buy_in: input.min_buy_in,
    max_buy_in: input.max_buy_in,
    is_active: true,
    current_players: 0,
    created_by: input.created_by,
  };

  if (!includeBettingColumns) {
    return insertData;
  }

  if (input.ante && input.ante > 0) {
    insertData.ante = input.ante;
  }

  if (input.ante_type && input.ante_type !== 'none') {
    insertData.ante_type = input.ante_type;
  }

  if (input.straddle_type && input.straddle_type !== 'none') {
    insertData.straddle_type = input.straddle_type;
  }

  return insertData;
}

export async function supportsPokerTableBettingColumns(supabase: SupabaseLike): Promise<boolean> {
  if (pokerTableBettingColumnsSupported !== null) {
    return pokerTableBettingColumnsSupported;
  }

  if (pokerTableBettingColumnsPromise) {
    return pokerTableBettingColumnsPromise;
  }

  pokerTableBettingColumnsPromise = (async () => {
    const query = supabase
      .from('poker_tables')
      .select(OPTIONAL_POKER_TABLE_COLUMNS) as PokerTableSelectQuery;
    const result = await query.limit(1);

    if (result.error && isMissingPokerTableBettingColumnsError(result.error)) {
      rememberPokerTableBettingColumnsSupport(false);
      return false;
    }

    const supported = !result.error;
    rememberPokerTableBettingColumnsSupport(supported);
    return supported;
  })();

  try {
    return await pokerTableBettingColumnsPromise;
  } finally {
    pokerTableBettingColumnsPromise = null;
  }
}

export async function listActivePokerTables(
  supabase: SupabaseLike
): Promise<{ tables: TableRow[]; error: PostgrestErrorLike }> {
  const { data, error } = await runPokerTableSelect(
    supabase,
    query => query
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    false
  );

  const tables = Array.isArray(data)
    ? data.map((table) => normalizePokerTableRow(table as Record<string, unknown>))
    : [];

  return { tables, error };
}

export async function getPokerTableById(
  supabase: SupabaseLike,
  tableId: string,
  options?: { includeBettingColumns?: boolean }
): Promise<{ table: TableRow | null; error: PostgrestErrorLike }> {
  const { data, error } = await runPokerTableSelect(
    supabase,
    query => query.eq('id', tableId).single(),
    options?.includeBettingColumns ?? true
  );

  if (error || !data) {
    return { table: null, error };
  }

  return {
    table: normalizePokerTableRow(data as Record<string, unknown>),
    error: null,
  };
}

export async function createPokerTable(
  supabase: SupabaseLike,
  input: PokerTableInsertInput
): Promise<{ table: TableRow | null; error: PostgrestErrorLike; supportsBettingColumns: boolean }> {
  const supportsBettingColumns = await supportsPokerTableBettingColumns(supabase);
  const insertData = buildPokerTableInsertData(input, supportsBettingColumns);
  const selectColumns = supportsBettingColumns ? FULL_POKER_TABLE_COLUMNS : BASE_POKER_TABLE_COLUMNS;
  const insertQuery = supabase.from('poker_tables').insert(insertData) as PokerTableInsertQuery;

  let { data, error } = await insertQuery.select(selectColumns).single();

  if (error && supportsBettingColumns && isMissingPokerTableBettingColumnsError(error)) {
    rememberPokerTableBettingColumnsSupport(false);
    const fallbackInsertData = buildPokerTableInsertData(input, false);
    const fallbackInsertQuery = supabase.from('poker_tables').insert(fallbackInsertData) as PokerTableInsertQuery;
    ({ data, error } = await fallbackInsertQuery.select(BASE_POKER_TABLE_COLUMNS).single());
  }

  if (error || !data) {
    return { table: null, error, supportsBettingColumns };
  }

  return {
    table: normalizePokerTableRow(data as Record<string, unknown>),
    error: null,
    supportsBettingColumns: pokerTableBettingColumnsSupported ?? supportsBettingColumns,
  };
}

export function __resetPokerTableCompatibilityCacheForTests() {
  pokerTableBettingColumnsSupported = null;
  pokerTableBettingColumnsPromise = null;
}
