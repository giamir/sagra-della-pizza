export type MisterPosConfig = {
  uiSeatKey: number;
  uiSeatDescription: string;
  desktopBridgeHost: string;
  desktopBridgePort: number;
};

export type MisterPosMappingEntry = {
  articleKey: number;
  description?: string;
  modifierDescription?: string | null;
  priceCents?: number;
};

export type MisterPosMapping = {
  cover: MisterPosMappingEntry | null;
  items: Record<string, MisterPosMappingEntry>;
};

export type MisterPosTicketItem = {
  sourceId: string;
  qt: number;
  ak: number;
  adesc: string;
  mdesc: string | null;
  ec: number;
  discounter: false;
};

export type MisterPosTicket = {
  items: MisterPosTicketItem[];
  opt: {
    seat: number;
    seatdesc?: string;
    ticket_stus: number;
    ticketnote: string;
  };
};

export type MisterPosPreparedOrder = {
  ticket: MisterPosTicket;
  missingIds: string[];
};

export type MisterPosPingResult = {
  ok: boolean;
  message: string;
  serverVersion?: string;
};

export type MisterPosSendResult = {
  ok: boolean;
  ticketKey?: number;
  totalCents?: number;
  message: string;
};
