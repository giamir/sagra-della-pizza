import mappingData from '$lib/data/misterpos-mapping.json';
import type { Payload } from '$lib/types';
import type {
  MisterPosConfig,
  MisterPosMapping,
  MisterPosPingResult,
  MisterPosPreparedOrder,
  MisterPosSendResult,
  MisterPosTicketItem
} from '$lib/types/misterpos';

const CONFIG_KEY = 'sagra-misterpos-config-v1';

export const DEFAULT_MISTERPOS_CONFIG: MisterPosConfig = {
  uiSeatKey: 11,
  uiSeatDescription: 'Al banco',
  desktopBridgeHost: '127.0.0.1',
  desktopBridgePort: 8787
};

export const MISTERPOS_MAPPING = mappingData as MisterPosMapping;

export function loadMisterPosConfig(): MisterPosConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_MISTERPOS_CONFIG };

  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}') as Partial<MisterPosConfig>;
    return {
      ...DEFAULT_MISTERPOS_CONFIG,
      ...stored,
      uiSeatKey: Number(stored.uiSeatKey ?? DEFAULT_MISTERPOS_CONFIG.uiSeatKey),
      desktopBridgePort: Number(
        stored.desktopBridgePort ?? DEFAULT_MISTERPOS_CONFIG.desktopBridgePort
      )
    };
  } catch {
    return { ...DEFAULT_MISTERPOS_CONFIG };
  }
}

export function saveMisterPosConfig(config: MisterPosConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function prepareMisterPosOrder(
  payload: Payload,
  menuLines: Record<string, { name: string; priceCents: number }>
): MisterPosPreparedOrder {
  const items: MisterPosTicketItem[] = [];
  const missingIds: string[] = [];

  if (payload.p > 0) {
    if (MISTERPOS_MAPPING.cover) {
      items.push(
        toTicketItem(
          '__cover__',
          payload.p,
          'Coperto',
          menuLines.__cover__?.priceCents ?? 0,
          MISTERPOS_MAPPING.cover
        )
      );
    } else {
      missingIds.push('__cover__');
    }
  }

  for (const [id, qty] of payload.l) {
    const mapping = MISTERPOS_MAPPING.items[id];
    if (!mapping) {
      missingIds.push(id);
      continue;
    }
    items.push(
      toTicketItem(
        id,
        qty,
        menuLines[id]?.name ?? id,
        menuLines[id]?.priceCents ?? 0,
        mapping
      )
    );
  }

  return {
    ticket: {
      items,
      opt: {
        seat: 0,
        ticket_stus: 10,
        ticketnote: 'Ordine QR Sagra della Pizza'
      }
    },
    missingIds
  };
}

function toTicketItem(
  sourceId: string,
  quantity: number,
  fallbackDescription: string,
  fallbackPriceCents: number,
  mapping: MisterPosMapping['items'][string]
): MisterPosTicketItem {
  return {
    sourceId,
    qt: quantity,
    ak: mapping.articleKey,
    adesc: mapping.description ?? fallbackDescription,
    mdesc: mapping.modifierDescription ?? null,
    ec: mapping.priceCents ?? fallbackPriceCents,
    discounter: false
  };
}

export async function pingMisterPosDesktopBridge(
  config: MisterPosConfig
): Promise<MisterPosPingResult> {
  const response = await fetch(`http://${config.desktopBridgeHost}:${config.desktopBridgePort}/health`);
  const text = await response.text();

  let result: { ok?: boolean; error?: string };
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error('Il bridge desktop MisterPOS ha restituito una risposta non valida.');
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Il bridge desktop MisterPOS ha risposto con HTTP ${response.status}.`);
  }

  return {
    ok: true,
    message: `Bridge desktop MisterPOS raggiungibile su ${config.desktopBridgeHost}:${config.desktopBridgePort}.`
  };
}

export async function loadMisterPosDesktopCart(
  config: MisterPosConfig,
  order: MisterPosPreparedOrder
): Promise<MisterPosSendResult> {
  const response = await fetch(
    `http://${config.desktopBridgeHost}:${config.desktopBridgePort}/load-order`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        seatKey: config.uiSeatKey,
        lines: order.ticket.items.map((item) => ({
          articleKey: item.ak,
          quantity: item.qt
        }))
      })
    }
  );
  const text = await response.text();

  let result: { ok?: boolean; lines?: number; error?: string };
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error('Il bridge desktop MisterPOS ha restituito una risposta non valida.');
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Il bridge desktop MisterPOS ha risposto con HTTP ${response.status}.`);
  }

  return {
    ok: true,
    message: `Ordine caricato nella cassa desktop MisterPOS (${result.lines ?? 0} righe).`
  };
}
