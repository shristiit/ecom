import fetch from 'node-fetch';
import { OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL } from '../../config/env.js';
import { query } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';

type NavigationTarget = {
  key: string;
  href: string;
  label: string;
  description: string;
  keywords?: string[];
};

type NavigationResolution = {
  matched: boolean;
  href?: string;
  label?: string;
  reasoning: string;
};

type NavigationCandidate = {
  target: NavigationTarget;
  score: number;
};

const OPENAI_NAVIGATION_TIMEOUT_MS = 4_500;
const MAX_CONTEXT_TURNS = 8;
const MAX_CANDIDATES = 8;

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'for',
  'from',
  'i',
  'in',
  'into',
  'me',
  'my',
  'of',
  'on',
  'please',
  'screen',
  'show',
  'take',
  'that',
  'the',
  'there',
  'to',
  'us',
  'with',
]);

const NAVIGATION_VERBS = ['go', 'open', 'take', 'navigate', 'move', 'proceed', 'show'];

const NAVIGATION_TARGETS: NavigationTarget[] = [
  { key: 'dashboard', href: '/', label: 'Dashboard', description: 'Operational overview and landing page.' },
  { key: 'ai', href: '/ai', label: 'AI Copilot', description: 'AI copilot landing page.', keywords: ['assistant'] },
  { key: 'ai_approvals', href: '/ai/approvals', label: 'AI Approvals', description: 'Pending AI approvals.' },
  { key: 'ai_history', href: '/ai/history', label: 'AI History', description: 'Historical AI activity.' },
  { key: 'orders', href: '/orders', label: 'Orders', description: 'Orders workspace root.' },
  {
    key: 'orders_sales',
    href: '/orders/sales',
    label: 'Sales Orders',
    description: 'Sales order listing page.',
    keywords: ['sales', 'invoice', 'customer orders'],
  },
  {
    key: 'orders_purchase',
    href: '/orders/purchase',
    label: 'Purchase Orders',
    description: 'Purchase order listing page.',
    keywords: ['purchase', 'po', 'procurement', 'supplier orders'],
  },
  { key: 'products', href: '/products', label: 'Products', description: 'Products catalog page.', keywords: ['catalog', 'items'] },
  { key: 'products_new', href: '/products/new', label: 'New Product', description: 'Create product page.', keywords: ['create', 'add'] },
  { key: 'inventory', href: '/inventory', label: 'Inventory', description: 'Inventory workspace root.', keywords: ['stock'] },
  {
    key: 'inventory_stock',
    href: '/inventory/stock-on-hand',
    label: 'Stock On Hand',
    description: 'Inventory balances page.',
    keywords: ['availability', 'balances', 'on hand'],
  },
  {
    key: 'inventory_movements',
    href: '/inventory/movements',
    label: 'Inventory Movements',
    description: 'Inventory movement history page.',
    keywords: ['movements', 'movement history'],
  },
  {
    key: 'inventory_receipts',
    href: '/inventory/receipts',
    label: 'Receipts',
    description: 'Inventory receipts page.',
    keywords: ['receiving', 'receive stock'],
  },
  {
    key: 'inventory_transfers',
    href: '/inventory/transfers',
    label: 'Transfers',
    description: 'Inventory transfers page.',
    keywords: ['transfer page'],
  },
  {
    key: 'inventory_adjustments',
    href: '/inventory/adjustments',
    label: 'Adjustments',
    description: 'Inventory adjustments page.',
    keywords: ['adjust stock'],
  },
  {
    key: 'inventory_write_offs',
    href: '/inventory/write-offs',
    label: 'Write-offs',
    description: 'Inventory write-offs page.',
    keywords: ['write off', 'damaged', 'expired'],
  },
  {
    key: 'inventory_cycle_counts',
    href: '/inventory/cycle-counts',
    label: 'Cycle Counts',
    description: 'Inventory cycle counts page.',
    keywords: ['stock counts', 'counting'],
  },
  { key: 'users', href: '/users', label: 'Users', description: 'Users management page.', keywords: ['team', 'staff'] },
  { key: 'roles', href: '/roles', label: 'Roles', description: 'Role management page.' },
  { key: 'policies', href: '/policies', label: 'Policies', description: 'Policies page.', keywords: ['permissions'] },
  { key: 'customers', href: '/master/customers', label: 'Customers', description: 'Master customers page.' },
  { key: 'suppliers', href: '/master/suppliers', label: 'Suppliers', description: 'Master suppliers page.', keywords: ['vendors'] },
  { key: 'locations', href: '/master/locations', label: 'Locations', description: 'Master locations page.', keywords: ['warehouses'] },
  { key: 'categories', href: '/master/categories', label: 'Categories', description: 'Master categories page.' },
  { key: 'audit', href: '/audit', label: 'Audit', description: 'Audit log page.', keywords: ['logs'] },
  { key: 'settings', href: '/settings', label: 'Settings', description: 'Settings landing page.', keywords: ['preferences', 'config'] },
  { key: 'settings_profile', href: '/settings/profile', label: 'Profile Settings', description: 'Profile settings page.', keywords: ['profile'] },
  {
    key: 'settings_integrations',
    href: '/settings/integrations',
    label: 'Integrations',
    description: 'Integration settings page.',
    keywords: ['integration settings'],
  },
  {
    key: 'settings_alerts',
    href: '/settings/alerts',
    label: 'Alerts',
    description: 'Alert settings page.',
    keywords: ['notifications'],
  },
  {
    key: 'settings_workflows',
    href: '/settings/workflows',
    label: 'Workflows',
    description: 'Workflow settings page.',
    keywords: ['workflow settings', 'approvals'],
  },
  {
    key: 'settings_numbering',
    href: '/settings/numbering',
    label: 'Numbering',
    description: 'Document numbering settings page.',
    keywords: ['sequence', 'document numbering'],
  },
];

const NAVIGATION_RESPONSE_SCHEMA = {
  name: 'admin_navigation',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      matched: { type: 'boolean' },
      routeKey: {
        type: 'string',
        enum: [...NAVIGATION_TARGETS.map((target) => target.key), 'NONE'],
      },
      reasoning: { type: 'string' },
    },
    required: ['matched', 'routeKey', 'reasoning'],
  },
} as const;

function normalizeNavigationText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function singularize(token: string) {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('es') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s') && token.length > 3) return token.slice(0, -1);
  return token;
}

function tokenize(value: string) {
  const normalized = normalizeNavigationText(value);
  if (!normalized) return [];

  const unique = new Set<string>();
  for (const token of normalized.split(/\s+/)) {
    if (!token || STOP_WORDS.has(token)) continue;
    unique.add(token);
    unique.add(singularize(token));
  }

  return [...unique].filter(Boolean);
}

function routeSearchText(target: NavigationTarget) {
  return normalizeNavigationText([target.label, target.description, target.href, ...(target.keywords ?? [])].join(' '));
}

function routeTokens(target: NavigationTarget) {
  return new Set(tokenize(routeSearchText(target)));
}

function normalizedVariants(values: string[]) {
  return values.map((value) => normalizeNavigationText(value)).filter(Boolean);
}

function isExactMeaningfulMatch(query: string, target: NavigationTarget) {
  const normalizedQuery = normalizeNavigationText(query);
  if (!normalizedQuery) return false;

  const directValues = normalizedVariants([target.label, target.href, ...(target.keywords ?? [])]);
  if (directValues.includes(normalizedQuery)) return true;

  const queryTokens = new Set(tokenize(normalizedQuery));
  if (queryTokens.size === 0) return false;

  const labelTokens = new Set(tokenize(target.label));
  const keywordTokenSets = (target.keywords ?? []).map((keyword) => new Set(tokenize(keyword)));
  const comparableSets = [labelTokens, ...keywordTokenSets].filter((tokens) => tokens.size > 0);

  return comparableSets.some((tokens) => tokens.size === queryTokens.size && [...tokens].every((token) => queryTokens.has(token)));
}

function candidateScore(target: NavigationTarget, queryText: string, queryTokens: string[]) {
  const normalizedQuery = normalizeNavigationText(queryText);
  const haystackTokens = routeTokens(target);
  const labelTokens = tokenize(target.label);

  let score = 0;
  for (const token of queryTokens) {
    if (haystackTokens.has(token)) score += 3;
  }

  const label = normalizeNavigationText(target.label);
  const href = normalizeNavigationText(target.href);
  if (label && normalizedQuery.includes(label)) score += 10;
  if (href && normalizedQuery.includes(href)) score += 10;
  if (target.keywords?.some((keyword) => normalizedQuery.includes(normalizeNavigationText(keyword)))) score += 6;

  if (isExactMeaningfulMatch(normalizedQuery, target)) score += 20;

  const unmatchedLabelTokens = labelTokens.filter((token) => !queryTokens.includes(token));
  if (unmatchedLabelTokens.length > 0) {
    score -= unmatchedLabelTokens.length * 2;
  }

  return score;
}

function buildCandidates(input: { text: string; context: string[] }) {
  const combinedText = [input.text, ...input.context].join(' ');
  const queryTokens = tokenize(combinedText);

  return NAVIGATION_TARGETS.map((target) => ({
    target,
    score: candidateScore(target, combinedText, queryTokens),
  }))
    .filter((item) => item.score > -1)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_CANDIDATES);
}

function findDirectNavigationTarget(text: string, candidates: NavigationCandidate[]) {
  const normalizedText = normalizeNavigationText(text);
  if (!normalizedText) return null;

  const exact = NAVIGATION_TARGETS.find((target) => isExactMeaningfulMatch(normalizedText, target));
  if (exact) {
    return {
      target: exact,
      reasoning: 'Matched an exact navigation target without needing model inference.',
    };
  }

  const top = candidates[0];
  const second = candidates[1];
  if (!top) return null;

  const topMargin = top.score - (second?.score ?? -1);
  const shortDirectPrompt = tokenize(normalizedText).length <= 3;
  if (shortDirectPrompt && top.score >= 6 && topMargin >= 2) {
    return {
      target: top.target,
      reasoning: 'Matched the highest-confidence route candidate from a short direct prompt.',
    };
  }

  return null;
}

function isLikelyNavigationIntent(input: { text: string; context: string[]; candidates: NavigationCandidate[] }) {
  const normalizedText = normalizeNavigationText(input.text);
  const hasVerb = NAVIGATION_VERBS.some((verb) => normalizedText.includes(verb));
  const refersIndirectly = normalizedText.includes('there') || normalizedText.includes('that page') || normalizedText.includes('that screen');
  const topScore = input.candidates[0]?.score ?? 0;
  const directMatch = Boolean(findDirectNavigationTarget(input.text, input.candidates));
  return hasVerb || refersIndirectly || directMatch || topScore >= 8;
}

function deterministicFallback(input: {
  text: string;
  context: string[];
  candidates: NavigationCandidate[];
}): NavigationResolution {
  const direct = findDirectNavigationTarget(input.text, input.candidates);
  if (direct) {
    return {
      matched: true,
      href: direct.target.href,
      label: direct.target.label,
      reasoning: direct.reasoning,
    };
  }

  if (!isLikelyNavigationIntent(input)) {
    return {
      matched: false,
      reasoning: 'The request did not clearly indicate a navigation action.',
    };
  }

  const best = input.candidates[0];
  const second = input.candidates[1];
  const bestMargin = (best?.score ?? 0) - (second?.score ?? -1);
  if (!best || best.score < 5 || bestMargin < 2) {
    return {
      matched: false,
      reasoning: 'No allowed page scored highly enough for a safe navigation fallback.',
    };
  }

  return {
    matched: true,
    href: best.target.href,
    label: best.target.label,
    reasoning: 'Matched the best route candidate using deterministic retrieval fallback.',
  };
}

async function getConversationContext(tenantId: string, conversationId?: string) {
  if (!conversationId) return [];
  const turns = await query<{ role: string; content: string }>(
    `SELECT role, content
     FROM conversation_turns
     WHERE tenant_id = $1 AND conversation_id = $2
     ORDER BY created_at DESC
     LIMIT ${MAX_CONTEXT_TURNS}`,
    [tenantId, conversationId]
  );
  return turns.rows.reverse().map((turn) => `${turn.role}: ${turn.content}`);
}

async function resolveWithOpenAI(input: {
  text: string;
  tenantId: string;
  conversationId?: string;
  context: string[];
  candidates: NavigationCandidate[];
}) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const routeOptions = (input.candidates.length > 0 ? input.candidates.map((item) => item.target) : NAVIGATION_TARGETS)
    .map((target) => `- ${target.key}: ${target.label} (${target.description})`)
    .join('\n');

  const prompt = `You are an admin navigation resolver.

Decide whether the user is asking to open one of the allowed admin pages.
Only return matched=true when the primary intent is navigation.
Use the recent conversation context when the latest request is indirect, for example "take me there".
Do not invent a route outside the provided route options.
If the request is not a navigation request, return matched=false and routeKey=NONE.

Route options:
${routeOptions}

Conversation context:
${input.context.length > 0 ? input.context.join('\n') : 'No previous context.'}

Current user message:
${input.text}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_NAVIGATION_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        max_tokens: 120,
        messages: [
          {
            role: 'system',
            content: 'Resolve admin navigation intent and choose one allowed route key or NONE.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: NAVIGATION_RESPONSE_SCHEMA,
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const details = await response.text();
    logger.warn({ status: response.status, details }, 'navigation resolver request failed');
    throw new Error('Navigation resolver request failed');
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('Navigation resolver returned an empty response');
  }

  const parsed = JSON.parse(raw) as {
    matched: boolean;
    routeKey: string;
    reasoning: string;
  };

  if (!parsed.matched || parsed.routeKey === 'NONE') {
    return {
      matched: false,
      reasoning: parsed.reasoning,
    } satisfies NavigationResolution;
  }

  const target = NAVIGATION_TARGETS.find((item) => item.key === parsed.routeKey);
  if (!target) {
    return {
      matched: false,
      reasoning: 'The model returned an unknown route.',
    } satisfies NavigationResolution;
  }

  return {
    matched: true,
    href: target.href,
    label: target.label,
    reasoning: parsed.reasoning,
  } satisfies NavigationResolution;
}

export async function resolveNavigation(input: { text: string; tenantId: string; conversationId?: string }) {
  const context = await getConversationContext(input.tenantId, input.conversationId);
  const candidates = buildCandidates({ text: input.text, context });
  const direct = findDirectNavigationTarget(input.text, candidates);

  if (direct) {
    return {
      matched: true,
      href: direct.target.href,
      label: direct.target.label,
      reasoning: direct.reasoning,
    } satisfies NavigationResolution;
  }

  try {
    return await resolveWithOpenAI({ ...input, context, candidates });
  } catch (error) {
    const fallback = deterministicFallback({ text: input.text, context, candidates });
    logger.warn(
      {
        error: error instanceof Error ? { name: error.name, message: error.message } : { message: 'Unknown error' },
        fallbackMatched: fallback.matched,
        candidates: candidates.map((item) => ({ key: item.target.key, score: item.score })),
      },
      'navigation resolver fell back to deterministic retrieval'
    );
    return fallback;
  }
}
