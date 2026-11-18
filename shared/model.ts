export interface Person { id: string; name: string; email?: string }
export interface User extends Person { email: string; role: string }
export interface Room { id: string; name: string }
export interface Unit {
  code: string; room: string; type: string; layers: number;
  x: number; z: number; y?: number; w: number; h: number; d: number; rotation: number;
  name?: string; parent?: string; parentLayer?: number;
}
export interface Item {
  id: string; code: string; unit: string; layer: number; name: string; total: number;
  image: string; assetNumber?: string; x?: number; y?: number;
}
export interface Booking { start: string; end: string; quantity: number }
export interface Selection extends Booking { itemId: string }
export interface Loan extends Selection {
  id: string; userId: string; name: string; picked: number; returned: number; cancelled: number;
  status: string; reservationStart?: string; rescheduledQuantity?: number; rescheduledFrom?: string;
  keepUntilEnd?: boolean; autoCancelled?: boolean;
}
export interface Extension {
  id: string; loanId: string; oldEnd: string; newEnd: string; days: number; status: string;
  affected: { recordId: string; response: boolean | null; noReplyNeeded?: boolean }[];
}
export interface Allocation { recordId: string; quantity: number }
export interface Handover { id: string; loanId: string; reservationId: string; quantity: number; status: string }
export interface Mail {
  id: string; type: string; to: string; subject: string; paragraphs: string[]; actions: string[];
  refs: Partial<Record<'loanId' | 'requestId' | 'reservationId' | 'handoverId', string>>;
  date: string; token: string; tokenExpires: number; used?: boolean; deliveredAt?: string;
}
export interface Receipt { id: string; title: string; paragraphs: string[]; userId?: string }
export interface Catalog {
  today: string; people: Person[]; rooms: Room[]; units: Unit[]; items: Item[];
  records: Loan[]; types: Record<string, string>;
}
export interface State {
  today: string; user: User | null; records: Loan[]; requests: Extension[]; handovers: Handover[];
  mails: Mail[]; receipts: Receipt[];
  events: { id: string; type: string; ref: string; date: string; details: object }[];
}
export interface Snapshot { data: Catalog; state: State; revision: number; lastDaily: string | null }
